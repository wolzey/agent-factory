import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { StateManager } from '../server/state';
import { slotPosition } from '../shared/world-layouts';
import { DEFAULT_AVATAR } from '../shared/constants';
import { PATIO, patioFloorHeight } from '../shared/factory25d-patio';
import { routeToStation, clearFactorySegment, constrainFactoryStep, toFactoryWorld, fromFactoryWorld, PATIO_STATIONS, WORKSTATIONS, factoryCompanionPosition } from '../shared/factory25d-layout';
import { agentPosition } from '../client/prototypes/factory25dWorld';
import { intersectFactoryFloor } from '../client/prototypes/factory25dPatioPicking';

describe('connected patio terraces', () => {
  it('keeps the entrance and upper desks level, and places the lower desks on the garden deck', () => {
    expect(patioFloorHeight({x: 8.2, z: -2.5})).toBe(0);
    for (const station of PATIO_STATIONS) {
      const standing = patioFloorHeight({x: station.x, z: station.z + .55});
      expect(standing).toBe(patioFloorHeight(station));
      expect(standing).toBe(station.z < 0 ? 0 : PATIO.lowerY);
    }
  });
  it('routes through the complete staircase in both directions', () => {
    const upper = {x: 11, z: -.65}, lower = {x: 12.3, z: 4.35};
    for (const [start, end] of [[upper, lower], [lower, upper]]) {
      const path = [start, ...routeToStation(start, end)];
      expect(path.at(-1)).toEqual(end);
      const levels = new Set<number>();
      for (let i = 1; i < path.length; i++) {
        expect(clearFactorySegment(path[i - 1], path[i])).toBe(true);
        for (let t = 0; t <= 1; t += .005) {
          const p = {x: path[i-1].x + (path[i].x-path[i-1].x)*t, z: path[i-1].z + (path[i].z-path[i-1].z)*t};
          levels.add(Math.round(patioFloorHeight(p) * 1000));
        }
      }
      expect(levels.size).toBe(PATIO.stairs.steps + 1);
    }
  });
  it('blocks the retaining edge and stair sides for direct keyboard movement', () => {
    const start = {x: 12, z: -.3};
    const result = fromFactoryWorld(constrainFactoryStep(toFactoryWorld(start), toFactoryWorld({x: 12, z: .8})));
    expect(result.z).toBeCloseTo(start.z);
    expect(clearFactorySegment({x: 16.8, z: 1.5}, {x: 18.5, z: 1.5})).toBe(false);
    expect(clearFactorySegment({x: 18.5, z: -.4}, {x: 18.5, z: 3})).toBe(true);
  });
  it('keeps rendered workers and followers inside the stairs on restored server movements', () => {
    let now = 1000;
    const state = new StateManager('factory25d', () => now);
    state.handleHookEvent({hook_event_name:'SessionStart',session_id:'stair-worker',username:'Stair worker',ownerId:'owner',cwd:'/test',avatar:DEFAULT_AVATAR});
    state.handleHookEvent({hook_event_name:'PreToolUse',session_id:'stair-worker',tool_name:'Read'});
    let start = slotPosition('factory25d', 'work', 0);
    for (const stationId of ['patio-0', 'patio-3', 'patio-2', 'patio-4', 'inside-0']) {
      state.assignWorkstation('stair-worker', WORKSTATIONS.findIndex(s => s.id === stationId));
      const stored = state.getSnapshot(), saved = stored.agents[0];
      saved.world.movement = {from:start, to:saved.world.position, startedAt:now, arrivesAt:now+1000};
      saved.world.position = start;
      const restored = new StateManager('factory25d', () => now); restored.restoreWorld(stored);
      const worker = restored.getSnapshot().agents[0], movement = worker.world.movement!;
      expect(movement).toBeDefined();
      let previous = agentPosition(worker, movement.startedAt, 'factory25d');
      const levels = new Set<number>();
      for (let i = 0; i <= 500; i++) {
        const time = movement.startedAt + (movement.arrivesAt - movement.startedAt) * i / 500;
        const point = agentPosition(worker, time, 'factory25d');
        expect(clearFactorySegment(previous, point)).toBe(true);
        for (const actor of [point, ...Array.from({length:4}, (_, child) => factoryCompanionPosition(point, child))]) {
          if (actor.x < 8 || actor.z <= PATIO.stairs.top || actor.z >= PATIO.stairs.bottom) continue;
          expect(actor.x).toBeGreaterThanOrEqual(PATIO.stairs.left + PATIO.wallClearance);
          expect(actor.x).toBeLessThanOrEqual(PATIO.stairs.right - PATIO.wallClearance);
        }
        if (point.x > 8) levels.add(Math.round(patioFloorHeight(point) * 1000));
        previous = point;
      }
      if (stationId !== 'patio-0') expect(levels.size).toBe(PATIO.stairs.steps + 1);
      start = movement.to; now = movement.arrivesAt + 1;
    }
  });
  it('picks lower desks and every stair tread at their visible elevation', () => {
    const points = [{x: 20, z: 5.05}, {x: 11, z: -.65}, {x: -2, z: 1},
      ...Array.from({length: 7}, (_, i) => ({x: 18.5, z: .25 + (i+.5)*2.4/7}))];
    for (const p of points) {
      const y = p.x > 8 ? patioFloorHeight(p) : 0;
      const ray = new THREE.Ray(new THREE.Vector3(p.x, y + 5, p.z + 2), new THREE.Vector3(0, -5, -2).normalize());
      const hit = new THREE.Vector3();
      expect(intersectFactoryFloor(ray, hit)).toBe(true);
      expect(hit.x).toBeCloseTo(p.x); expect(hit.y).toBeCloseTo(y); expect(hit.z).toBeCloseTo(p.z);
    }
  });
  it('rebuilds a saved flat-deck route and recovers a pose inside a new planter', () => {
    for (const blocked of [false, true]) {
      const initial = new StateManager('factory25d', () => 1000);
      initial.handleHookEvent({hook_event_name:'SessionStart',session_id:'returning-worker',username:'Returning worker',ownerId:'owner',cwd:'/test',avatar:DEFAULT_AVATAR});
      initial.handleHookEvent({hook_event_name:'PreToolUse',session_id:'returning-worker',tool_name:'Read'});
      initial.assignWorkstation('returning-worker', 11);
      initial.appendChat({username:'Returning worker',message:'Keep our conversation',timestamp:1000});
      const stored = initial.getSnapshot(), agent = stored.agents[0];
      const from = toFactoryWorld(blocked ? {x:13.65,z:.15} : {x:11,z:-.65});
      const target = slotPosition('factory25d','work',11);
      agent.world.movement = {from,to:target,startedAt:2000,arrivesAt:10000};
      agent.world.position = from;
      const next = new StateManager('factory25d', () => 2000); next.restoreWorld(stored);
      const restored = next.getSnapshot(), returned = restored.agents[0];
      expect(returned.world.slotIndex).toBe(11);
      expect(returned.ownerId).toBe('owner'); expect(returned.avatar).toEqual(DEFAULT_AVATAR);
      expect(restored.chat).toEqual(stored.chat);
      const movement = returned.world.movement!;
      const route = [movement.from,...(movement.waypoints??[]),movement.to].map(fromFactoryWorld);
      expect(route.at(-1)).toEqual(fromFactoryWorld(target));
      for (let i=1;i<route.length;i++) expect(clearFactorySegment(route[i-1],route[i])).toBe(true);
    }
  });

});
