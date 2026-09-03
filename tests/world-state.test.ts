import { describe, expect, it, vi } from 'vitest';
import { StateManager } from '../server/state.js';
import { STALE_SESSION_TIMEOUT_MS, TOMBSTONE_DURATION_MS } from '../shared/constants.js';
import type { HookPayload, WorldDelta } from '../shared/types.js';
import { ARCADE_WINDOW_LOOKOUTS, positionAt, routeDistance, workstationWaypoints } from '../shared/world-layouts.js';

function hook(sessionId: string, username = 'alice'): HookPayload {
  return {
    hook_event_name: 'SessionStart',
    session_id: sessionId,
    username,
    cwd: `/work/${sessionId}`,
    avatar: { spriteIndex: 0, color: '#ffffff', hat: null, trail: null },
  };
}

describe('StateManager authoritative world', () => {
  it('routes workstation travel through open aisles instead of cabinet footprints', () => {
    const from = { x: 400, y: 470 };
    const to = { x: 80, y: 164 };
    const waypoints = workstationWaypoints('arcade', from, to, 'entrance', 'work', undefined, 0);
    expect(waypoints).toEqual([
      { x: 330, y: 470 },
      { x: 330, y: 352 },
      { x: 330, y: 332 },
      { x: 122, y: 316 },
      { x: 122, y: 164 },
    ]);

    const distance = routeDistance(from, waypoints, to);
    const movement = { from, to, waypoints, startedAt: 0, arrivesAt: distance };
    const midway = positionAt(movement, distance / 2);
    expect(midway.x).toBeGreaterThan(122);
    expect(midway.x).toBeLessThan(330);
    expect(midway.y).toBeGreaterThanOrEqual(316);
  });

  it('assigns unique server-owned slots and emits contiguous revisions', () => {
    let now = 1_000;
    const state = new StateManager('arcade', () => now);
    const deltas: WorldDelta[] = [];
    state.onStateChange((notification) => {
      if (notification.type === 'delta') deltas.push(notification.delta);
    });

    state.handleHookEvent(hook('one'));
    state.handleHookEvent(hook('two', 'bob'));
    now += 100;
    state.handleHookEvent({ ...hook('one'), hook_event_name: 'PreToolUse', tool_name: 'Read' });
    state.handleHookEvent({ ...hook('two', 'bob'), hook_event_name: 'PreToolUse', tool_name: 'Edit' });

    const snapshot = state.getSnapshot();
    expect(snapshot.agents.map(agent => agent.world.slotIndex)).toEqual([0, 1]);
    expect(snapshot.agents.every(agent => agent.world.zone === 'work')).toBe(true);
    expect(deltas.map(delta => [delta.previousRevision, delta.revision])).toEqual([
      [0, 1], [1, 2], [2, 3], [3, 4],
    ]);
  });

  it('persists a dropped workstation assignment and rejects occupied stations', () => {
    const state = new StateManager('arcade', () => 1_000);
    state.handleHookEvent(hook('one'));
    state.handleHookEvent(hook('two', 'bob'));
    expect(state.assignWorkstation('one', 7)).toBe(true);
    expect(state.get('one')?.world).toEqual({
      zone: 'work', slotIndex: 7, position: { x: 208, y: 274 }, facing: 'up',
    });
    expect(state.assignWorkstation('two', 7)).toBe(false);
    expect(state.get('two')?.world.zone).toBe('idle');
    expect(state.assignWorkstation('two', 99)).toBe(false);
  });

  it('persists bounded shared state and restores without a browser history', () => {
    let now = 2_000;
    const state = new StateManager('mining', () => now);
    state.handleHookEvent(hook('one'));
    state.appendChat({ username: 'alice', message: 'hello', timestamp: now });
    const event = state.startGlobalEvent('vortex');
    const saved = state.getSnapshot();

    now += 500;
    const restored = new StateManager('arcade', () => now);
    restored.restoreWorld(saved);
    const snapshot = restored.getSnapshot();

    // Deployment configuration remains authoritative if the theme changes between restarts.
    expect(snapshot.environment).toBe('arcade');
    expect(snapshot.revision).toBe(saved.revision);
    expect(snapshot.agents[0]).toMatchObject({ sessionId: 'one', username: 'alice' });
    expect(snapshot.chat).toEqual([{ username: 'alice', message: 'hello', timestamp: 2_000 }]);
    expect(snapshot.events[0]?.id).toBe(event.id);
  });

  it('selects interaction targets from canonical server positions', () => {
    let now = 2_500;
    const state = new StateManager('arcade', () => now);
    state.handleHookEvent(hook('shooter'));
    state.handleHookEvent(hook('target', 'bob'));
    state.setManualControl('shooter', { x: 100, y: 100, facing: 'right', moving: false });
    state.setManualControl('target', { x: 200, y: 110, facing: 'left', moving: false });
    now += 101;

    expect(state.getShotTargets('shooter', 'right')).toEqual(['target']);
    expect(state.getShotTargets('shooter', 'left')).toEqual([]);
  });

  it('creates and expires tombstones on the server', () => {
    vi.useFakeTimers();
    let now = 3_000;
    const state = new StateManager('arcade', () => now);
    state.handleHookEvent(hook('one'));

    now += STALE_SESSION_TIMEOUT_MS + 1;
    expect(state.reapStale()).toEqual(['one']);
    expect(state.getSnapshot().tombstones).toHaveLength(1);

    now += TOMBSTONE_DURATION_MS + 1;
    state.advanceWorld(now);
    expect(state.getSnapshot().tombstones).toHaveLength(0);
    vi.useRealTimers();
  });

  it('occasionally routes idle arcade agents across the shared dance floor', () => {
    let now = 1_000;
    const state = new StateManager('arcade', () => now);
    state.handleHookEvent(hook('one'));

    now = 10_000;
    state.advanceWorld(now);
    now = 40_000;
    state.advanceWorld(now);

    const movement = state.get('one')?.world.movement;
    expect(movement?.waypoints).toHaveLength(3);
    expect(movement?.waypoints?.every(point => point.x >= 582 && point.y >= 394)).toBe(true);
    expect(movement?.to).toEqual({ x: 440, y: 382 });
  });

  it('occasionally pauses an idle agent at the window before routing home', () => {
    let now = 1_000;
    const state = new StateManager('arcade', () => now);
    state.handleHookEvent(hook('agent'));

    now = 10_000;
    state.advanceWorld(now);
    now = 40_000;
    state.advanceWorld(now);

    const visit = state.get('agent')?.world.movement;
    expect(ARCADE_WINDOW_LOOKOUTS).toContainEqual(visit?.to);
    expect(visit?.waypoints).toContainEqual({ x: visit?.to.x, y: 316 });
    expect(state.get('agent')?.world.facing).toBe('up');

    now = visit!.arrivesAt + 8_001;
    state.advanceWorld(now);
    expect(state.get('agent')?.world.movement?.to).toEqual({ x: 440, y: 382 });
  });
});
