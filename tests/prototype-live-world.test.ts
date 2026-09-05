import { describe, expect, it } from 'vitest';
import type { WebSocket } from '@fastify/websocket';
import { StateManager } from '../server/state';
import { BroadcastManager } from '../server/ws/broadcast';
import { ControlManager } from '../server/control-manager';
import { GrabManager } from '../server/grab-manager';
import { DEFAULT_AVATAR } from '../shared/constants';
import { WORKSTATIONS, toFactoryWorld, fromFactoryWorld, clearFactorySegment, routeToStation, constrainFactoryStep } from '../shared/factory25d-layout';
import { slotPosition, WORLD_LAYOUTS } from '../shared/world-layouts';
import { agentPosition } from '../client/prototypes/factory25dWorld';

function start(state: StateManager, id: string, work = true) {
  const hook = { hook_event_name: 'SessionStart', session_id: id, username: id, ownerId: `${id}-owner`, cwd: '/work/factory', avatar: { ...DEFAULT_AVATAR, hairStyle: 4, shirtColor: '#ff9900' } };
  state.handleHookEvent(hook);
  if (work) state.handleHookEvent({ ...hook, hook_event_name: 'PreToolUse', tool_name: 'Read' });
}
function socket() { return { readyState: 1, on() {}, send() {} } as unknown as WebSocket; }

describe('the shared 2.5D factory', () => {
  it('assigns all 18 unique stations, including every patio station, and survives a restart', () => {
    const state = new StateManager('factory25d', () => 1000);
    for (let i = 0; i < 18; i++) start(state, `worker-${i}`);
    const snapshot = state.getSnapshot();
    expect(new Set(snapshot.agents.map(a => a.world.slotIndex)).size).toBe(18);
    expect(snapshot.agents.filter(a => WORKSTATIONS[a.world.slotIndex!].room === 'patio')).toHaveLength(6);
    for (const agent of snapshot.agents) {
      const station = WORKSTATIONS[agent.world.slotIndex!];
      expect(agentPosition(agent, 100_000, 'factory25d')).toEqual({ x: expect.closeTo(station.x), z: expect.closeTo(station.z + 0.55) });
    }
    const restored = new StateManager('factory25d', () => 2000); restored.restoreWorld(snapshot);
    expect(restored.getSnapshot().agents.map(a => a.world.slotIndex)).toEqual(snapshot.agents.map(a => a.world.slotIndex));
  });

  it('routes between every station through open floor and the side doorway', () => {
    for (const fromStation of WORKSTATIONS) for (const toStation of WORKSTATIONS) {
      const from = { x: fromStation.x, z: fromStation.z + 0.55 }, to = { x: toStation.x, z: toStation.z + 0.55 };
      const route = [from, ...routeToStation(from, to)];
      expect(route.at(-1), `${fromStation.id} → ${toStation.id}`).toEqual(to);
      for (let i=1;i<route.length;i++) expect(clearFactorySegment(route[i-1],route[i])).toBe(true);
    }
  });

  it('queues excess workers and fills an indoor or patio vacancy when it opens', () => {
    const state = new StateManager('factory25d', () => 1000);
    for (let i = 0; i < 19; i++) start(state, `worker-${i}`);
    expect(state.get('worker-18')!.world.zone).toBe('waiting');
    state.setManualControl('worker-2', {x:760,y:310,facing:'down',moving:false});
    state.advanceWorld(2000);
    expect(state.get('worker-18')!.world).toMatchObject({zone:'work',slotIndex:2});
    expect(WORKSTATIONS[2].room).toBe('patio');
  });

  it('keeps entrance, waiting, idle and roaming paths out of solid room props', () => {
    const layout = WORLD_LAYOUTS.factory25d;
    const destinations = [...layout.waitingSlots, ...layout.idleSlots,
      ...WORKSTATIONS.map((_,i) => slotPosition('factory25d','work',i)),
      ...Array.from({length:5},(_,i) => toFactoryWorld({x:-3.8+i*1.6,z:-3.7})),
      ...Array.from({length:4},(_,i) => toFactoryWorld({x:10.4+i*2.3,z:7.7}))];
    const starts = [layout.entrance, ...destinations];
    for (const start of starts) for (const destination of destinations) {
      const from=fromFactoryWorld(start), to=fromFactoryWorld(destination), route=[from,...routeToStation(from,to)];
      expect(route.at(-1)).toEqual(to);
      for(let i=1;i<route.length;i++) expect(clearFactorySegment(route[i-1],route[i])).toBe(true);
    }
  });

  it('preserves conversations and avatar configuration while migrating the old layout', () => {
    const old = new StateManager('arcade', () => 1000); start(old, 'ada');
    old.appendChat({ username: 'Ada', message: 'existing conversation', timestamp: 1000 });
    const previous = old.getSnapshot(), next = new StateManager('factory25d', () => 2000);
    next.restoreWorld(previous);
    expect(next.getSnapshot().chat).toEqual(previous.chat);
    expect(next.get('ada')?.avatar).toEqual(previous.agents[0].avatar);
    expect(next.get('ada')?.ownerId).toBe('ada-owner');
    expect(next.get('ada')?.world.position).toEqual(slotPosition('factory25d', 'work', 0));
  });

  it('uses the expanded patio coordinates for owner controls and prevents wall crossing', () => {
    let now = 1000;
    const state = new StateManager('factory25d', () => now); start(state, 'ada');
    state.assignWorkstation('ada', 17);
    const controls = new ControlManager(state, new BroadcastManager(), () => now), ws = socket();
    expect(controls.claim(ws, 'another-owner', 'ada')).toBe(false);
    expect(controls.claim(ws, 'ada-owner', 'ada')).toBe(true);
    const before = state.get('ada')!.manualControl!;
    expect(before.x).toBeGreaterThan(782);
    controls.updateInput(ws, 'ada-owner', 'ada', { up:false,down:false,left:false,right:true });
    now += 200; controls.tick(now);
    expect(state.get('ada')!.manualControl!.x).toBeGreaterThan(before.x);
    expect(fromFactoryWorld(constrainFactoryStep(toFactoryWorld({x:7.5,z:0}),toFactoryWorld({x:8.5,z:0}))).x).toBeLessThan(8);
    expect(fromFactoryWorld(constrainFactoryStep(toFactoryWorld({x:7.5,z:-2.5}),toFactoryWorld({x:8.5,z:-2.5}))).x).toBeGreaterThan(8);
    controls.stop();
  });

  it('accepts a patio drop only through an authenticated lease and rejects occupied stations', () => {
    const state = new StateManager('factory25d', () => 1000); start(state, 'ada'); start(state, 'grace');
    const grab = new GrabManager(state, new BroadcastManager(), () => 1000), ws = socket();
    const p = slotPosition('factory25d', 'work', 17);
    expect(grab.begin(ws, undefined, { sessionId: 'ada' }, p.x, p.y)).toBe(false);
    expect(grab.begin(ws, 'viewer', { sessionId: 'ada' }, p.x, p.y)).toBe(true);
    expect(grab.end(ws, 'viewer', { sessionId: 'ada' }, p.x, p.y, 17)).toBe(true);
    expect(state.get('ada')?.world.slotIndex).toBe(17);
    expect(state.assignWorkstation('grace',17)).toBe(false);
    grab.stop();
  });
});
