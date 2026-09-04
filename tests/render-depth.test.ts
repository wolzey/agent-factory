import { describe, expect, it } from 'vitest';
import type { EnvironmentType, Position, WorldMovement } from '../shared/types';
import { WORLD_LAYOUTS, positionAt, slotPosition, workstationWaypoints } from '../shared/world-layouts';
import { GRAB_DEPTH } from '../client/grab/physics';
import {
  MACHINE_BASE_OFFSET,
  agentDepth,
  isBehindMachine,
  machineDepth,
  machineOccludes,
} from '../client/systems/depth';

const ENVIRONMENTS: EnvironmentType[] = ['arcade', 'farm', 'office', 'mining'];

/** Cabinets are placed 24px above their work slot (AgentManager.createMachines). */
function machinesFor(environment: EnvironmentType): Position[] {
  return WORLD_LAYOUTS[environment].workSlots.map(slot => ({ x: slot.x, y: slot.y - 24 }));
}

function route(environment: EnvironmentType, from: Position, to: Position, fromZone: 'entrance' | 'work', toZone: 'work', fromSlot: number | undefined, toSlot: number): WorldMovement {
  return {
    from,
    to,
    waypoints: workstationWaypoints(environment, from, to, fromZone, toZone, fromSlot, toSlot),
    startedAt: 0,
    arrivesAt: 1000,
  };
}

describe('cabinet depth occlusion', () => {
  it('sorts an agent behind a cabinet when its feet are above the base line and in front below it', () => {
    const machine = { x: 80, y: 106 };
    const base = machine.y + MACHINE_BASE_OFFSET;
    const behind = { x: 80, y: base - 20 }; // feet at base - 6
    const inFront = { x: 80, y: base + 24 }; // the work slot stance
    expect(isBehindMachine(behind, machine)).toBe(true);
    expect(agentDepth(behind.y)).toBeLessThan(machineDepth(machine.y));
    expect(isBehindMachine(inFront, machine)).toBe(false);
    expect(agentDepth(inFront.y)).toBeGreaterThan(machineDepth(machine.y));
  });

  it('flips exactly at the base line', () => {
    const machine = { x: 0, y: 0 };
    const base = machine.y + MACHINE_BASE_OFFSET;
    expect(isBehindMachine({ x: 0, y: base - 14 - 1 }, machine)).toBe(true);
    expect(isBehindMachine({ x: 0, y: base - 14 }, machine)).toBe(false);
  });

  it('keeps airborne avatars above every floor-sorted entity', () => {
    expect(agentDepth(460, 1, true)).toBe(GRAB_DEPTH);
    expect(GRAB_DEPTH).toBeGreaterThan(machineDepth(462));
    expect(GRAB_DEPTH).toBeGreaterThan(agentDepth(462));
  });

  it('uses the half-scale feet offset for subagents', () => {
    const machine = { x: 0, y: 0 };
    const base = machine.y + MACHINE_BASE_OFFSET;
    // A half-size sprite has its feet 7px below centre, so it stays behind slightly longer.
    expect(isBehindMachine({ x: 0, y: base - 10 }, machine, 0.5)).toBe(true);
    expect(isBehindMachine({ x: 0, y: base - 10 }, machine, 1)).toBe(false);
  });

  it('only counts as occluded when the sprites actually overlap on screen', () => {
    const machine = { x: 200, y: 106 };
    expect(machineOccludes({ x: 200, y: 90 }, machine)).toBe(true); // standing behind the cabinet
    expect(machineOccludes({ x: 260, y: 90 }, machine)).toBe(false); // same row, clear to the side
    expect(machineOccludes({ x: 200, y: 154 }, machine)).toBe(false); // the work stance, in front
  });

  it('places every agent in front of its own cabinet at the work slot', () => {
    for (const environment of ENVIRONMENTS) {
      const machines = machinesFor(environment);
      machines.forEach((machine, index) => {
        const stance = slotPosition(environment, 'work', index);
        expect(isBehindMachine(stance, machine)).toBe(false);
        expect(agentDepth(stance.y)).toBeGreaterThan(machineDepth(machine.y));
      });
    }
  });

  it('never hides an agent behind a cabinet along the server-authored routes', () => {
    for (const environment of ENVIRONMENTS) {
      const machines = machinesFor(environment);
      const entrance = WORLD_LAYOUTS[environment].entrance;
      const slots = machines.length;
      const movements: WorldMovement[] = [];
      for (let index = 0; index < slots; index++) {
        const to = slotPosition(environment, 'work', index);
        movements.push(route(environment, entrance, to, 'entrance', 'work', undefined, index));
      }
      for (const [fromSlot, toSlot] of [[0, 7], [5, 6], [11, 0], [3, 9]]) {
        const from = slotPosition(environment, 'work', fromSlot);
        const to = slotPosition(environment, 'work', toSlot);
        movements.push(route(environment, from, to, 'work', 'work', fromSlot, toSlot));
      }

      for (const movement of movements) {
        for (let t = 0; t <= movement.arrivesAt; t += 4) {
          const position = positionAt(movement, t);
          for (const machine of machines) {
            expect(machineOccludes(position, machine), `${environment} route hidden at ${position.x},${position.y}`).toBe(false);
          }
        }
      }
    }
  });

  it('does occlude an avatar dropped behind a cabinet, which is what the sort is for', () => {
    const machine = machinesFor('arcade')[0];
    const landing = { x: machine.x + 6, y: machine.y - 4 };
    expect(machineOccludes(landing, machine)).toBe(true);
    expect(agentDepth(landing.y)).toBeLessThan(machineDepth(machine.y));
  });
});
