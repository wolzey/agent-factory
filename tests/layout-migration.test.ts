import { describe, expect, it } from 'vitest';
import { StateManager } from '../server/state';
import { DEFAULT_AVATAR, STOPPED_REMOVAL_DELAY_MS, TOMBSTONE_DURATION_MS } from '../shared/constants';
import { slotPosition } from '../shared/world-layouts';
import type { AgentActivity, WorldAgent, WorldSnapshot, WorldZone } from '../shared/types';

function agent(id: string, slot: number | undefined, activity: AgentActivity = 'writing', zone: WorldZone = 'work'): WorldAgent {
  return { sessionId: id, username: id, ownerId: `owner-${id}`, sessionName: `Session ${id}`, avatar: { ...DEFAULT_AVATAR, hairStyle: 7 },
    cwd: '/migration/fixture', activity, currentTool: 'Read', subagents: [{ agentId: `${id}-child`, agentType: 'test', activity: 'reading', startedAt: 1000 }],
    taskDescription: 'preserved task', toolUseCount: 19, startedAt: 1000, lastEventAt: 2000,
    world: { zone, ...(slot === undefined ? {} : { slotIndex: slot }), position: slotPosition('factory25d', zone === 'manual' || zone === 'entrance' ? 'idle' : zone, slot ?? 0), facing: 'up' } };
}
function world(agents: WorldAgent[]): WorldSnapshot {
  return { schemaVersion: 1, revision: 123, environment: 'factory25d', serverTime: 2000, agents, tombstones: [],
    chat: [{ username: 'fixture', message: 'saved conversation', timestamp: 2000 }],
    events: [{ id: 'ongoing', effect: 'vortex', startedAt: 1000, expiresAt: 16000, seed: 27 }] };
}
function migrate(snapshot: WorldSnapshot, now = 3000, environment: 'arcade' | 'factory25d' = 'arcade') {
  const state = new StateManager(environment, () => now); state.restoreWorld(snapshot); return state;
}
function bounded(state: StateManager) {
  const bounds = state.worldBounds, snapshot = state.getSnapshot();
  for (const point of [...snapshot.agents.map(a => a.world.position), ...snapshot.tombstones.map(t => t.position)]) {
    expect(point.x).toBeGreaterThanOrEqual(bounds.minX); expect(point.x).toBeLessThanOrEqual(bounds.maxX);
    expect(point.y).toBeGreaterThanOrEqual(bounds.minY); expect(point.y).toBeLessThanOrEqual(bounds.maxY);
  }
}

describe('bounded migration between factory layouts', () => {
  it('preserves 18 workers and their data while seating six beyond arcade capacity in available waiting positions', () => {
    const input = world(Array.from({ length: 18 }, (_, index) => agent(`worker-${index}`, index))), original = structuredClone(input);
    const state = migrate(input), output = state.getSnapshot();
    expect(output.environment).toBe('arcade'); expect(output.revision).toBe(input.revision);
    expect(output.chat).toEqual(input.chat); expect(output.events).toEqual(input.events);
    expect(output.agents.map(({ world: _pose, ...data }) => data)).toEqual(input.agents.map(({ world: _pose, ...data }) => data));
    expect(output.agents.filter(a => a.world.zone === 'work')).toHaveLength(12);
    expect(output.agents.filter(a => a.world.zone === 'waiting').map(a => a.world.slotIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(new Set(output.agents.map(a => `${a.world.position.x}:${a.world.position.y}`)).size).toBe(18);
    expect(output.agents.every(a => !a.world.movement)).toBe(true); expect(input).toEqual(original); bounded(state);
    const restarted = migrate(output, 3500);
    expect(restarted.getSnapshot().agents.map(a => a.world)).toEqual(output.agents.map(a => a.world));
    restarted.handleHookEvent({ hook_event_name: 'PreToolUse', session_id: 'worker-12', username: 'worker-12', avatar: DEFAULT_AVATAR, cwd: '/migration/fixture', tool_name: 'Read' });
    expect(restarted.get('worker-12')?.world).toMatchObject({ zone: 'waiting', slotIndex: 0 });
    restarted.setManualControl('worker-2', { x: 400, y: 400, facing: 'down', moving: false }); restarted.advanceWorld(4000);
    expect(restarted.get('worker-12')?.world).toMatchObject({ zone: 'work', slotIndex: 2 });
  });

  it('reserves later workers before releasing stale manual control, independent of snapshot insertion order', () => {
    const manual = agent('manual', undefined, 'writing', 'manual'); manual.manualControl = { x: 1120, y: 382, facing: 'right', moving: true };
    const state = migrate(world([manual, ...Array.from({ length: 12 }, (_, index) => agent(`worker-${index}`, index))]));
    expect(state.get('manual')?.manualControl).toBeUndefined(); expect(state.get('manual')?.world.zone).toBe('waiting');
    for (let index = 0; index < 12; index++) expect(state.get(`worker-${index}`)?.world).toEqual({ zone: 'work', slotIndex: index, position: slotPosition('arcade', 'work', index), facing: 'up' });
    const restarted = migrate(state.getSnapshot(), 3500);
    expect(restarted.get('manual')?.world.zone).toBe('waiting'); expect(restarted.get('worker-0')?.world.slotIndex).toBe(0); bounded(restarted);
  });

  it('retains a valid stationary drop but does not reuse a removed work slot as an offscreen idle slot', () => {
    const state = migrate(world([agent('dropped-valid', 4, 'idle'), agent('dropped-patio', 17, 'idle')]));
    expect(state.get('dropped-valid')?.world).toMatchObject({ zone: 'work', slotIndex: 4 });
    expect(state.get('dropped-patio')?.world).toMatchObject({ zone: 'idle', slotIndex: 0, position: slotPosition('arcade', 'idle', 0) });
    const restarted = migrate(state.getSnapshot(), 4000);
    expect(restarted.get('dropped-valid')?.world).toEqual(state.get('dropped-valid')?.world); bounded(restarted);
  });

  it('preserves valid tombstone reservations and deadlines, including a stopped worker, before allocating work slots', () => {
    const input = world([agent('stopped', 3, 'stopped'), agent('active', 6)]);
    input.tombstones = [
      { sessionId: 'grave', username: 'grave', avatar: DEFAULT_AVATAR, slotIndex: 0, position: slotPosition('factory25d', 'work', 0), createdAt: 1200, expiresAt: 12000 },
      { sessionId: 'removed-patio', username: 'patio', avatar: DEFAULT_AVATAR, slotIndex: 17, position: slotPosition('factory25d', 'work', 17), createdAt: 1200, expiresAt: 12000 },
      { sessionId: 'expired', username: 'expired', avatar: DEFAULT_AVATAR, slotIndex: 6, position: slotPosition('factory25d', 'work', 6), createdAt: 500, expiresAt: 2900 },
    ];
    const state = migrate(input), stones = state.getSnapshot().tombstones;
    expect(stones.find(t => t.sessionId === 'grave')).toMatchObject({ slotIndex: 0, createdAt: 1200, expiresAt: 12000, position: slotPosition('arcade', 'work', 0) });
    expect(stones.find(t => t.sessionId === 'stopped')).toMatchObject({ slotIndex: 3, expiresAt: 2000 + STOPPED_REMOVAL_DELAY_MS + TOMBSTONE_DURATION_MS, position: slotPosition('arcade', 'work', 3) });
    expect(stones.find(t => t.sessionId === 'removed-patio')?.slotIndex).toBeUndefined();
    expect(stones.some(t => t.sessionId === 'expired')).toBe(false); expect(state.get('active')?.world.slotIndex).toBe(6);
    expect(state.assignWorkstation('active', 3)).toBe(false); bounded(state);
  });

  it('keeps existing stopped tombstones and active event deadlines, dropping only expired records', () => {
    const input = world([agent('stopped', 1, 'stopped')]);
    input.tombstones = [{ sessionId: 'stopped', username: 'stopped', avatar: DEFAULT_AVATAR, slotIndex: 1, position: slotPosition('factory25d', 'work', 1), createdAt: 1100, expiresAt: 31000 }];
    input.events.push({ id: 'expired', effect: 'vortex', startedAt: 100, expiresAt: 2000, seed: 3 });
    const output = migrate(input).getSnapshot();
    expect(output.tombstones[0].expiresAt).toBe(31000); expect(output.tombstones[0].createdAt).toBe(1100);
    expect(output.events).toEqual([input.events[0]]);
  });

  it('keeps oversized migrations visible and preserves existing same-layout overflow assignments', () => {
    const state = migrate(world(Array.from({ length: 80 }, (_, index) => agent(`worker-${index}`, index))));
    expect(state.getSnapshot().agents).toHaveLength(80); bounded(state);
    const existing = world([agent('legacy-overflow', 17)]); existing.environment = 'arcade'; existing.agents[0].world.position = slotPosition('arcade', 'work', 17);
    const restored = migrate(existing); expect(restored.get('legacy-overflow')?.world).toMatchObject({ zone: 'work', slotIndex: 17, position: slotPosition('arcade', 'work', 17) });
    expect(restored.get('legacy-overflow')?.world.movement).toBeUndefined();
  });
});
