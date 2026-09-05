import { fromFactoryWorld } from '@shared/factory25d-layout';
import { positionAt } from '@shared/world-layouts';
import type { EnvironmentType, Position, WorldAgent, WorldMovement } from '@shared/types';
import { slotPosition } from '@shared/world-layouts';
import { WORKSTATIONS, routeToStation } from './factory25dWorkstations';

export type RoomPoint = { x: number; z: number };
export function projectPosition(point: Position, environment: EnvironmentType = 'arcade'): RoomPoint {
  if (environment === 'factory25d') return fromFactoryWorld(point);
  // Preserve server slot IDs across both views, including automatic overflow slots.
  for (let slot = 0; slot < WORKSTATIONS.length; slot++) {
    const stance = slotPosition(environment, 'work', slot);
    if (Math.hypot(point.x - stance.x, point.y - stance.y) < 2) {
      const station = WORKSTATIONS[slot];
      return { x: station.x, z: station.z + 0.55 };
    }
  }
  if (point.y >= 350) return { x: (point.x - 400) / 48, z: 6.1 + (point.y - 350) / 17 };
  return { x: (point.x - 400) / 58, z: -4.2 + (point.y - 58) / 39 };
}

export function pointAlong(path: RoomPoint[], progress: number): RoomPoint {
  const lengths = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.z - path[i].z));
  let distance = lengths.reduce((a, b) => a + b, 0) * Math.max(0, Math.min(1, progress));
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] ? Math.min(1, distance / lengths[i]) : 1;
      return { x: path[i].x + (path[i + 1].x - path[i].x) * t, z: path[i].z + (path[i + 1].z - path[i].z) * t };
    }
    distance -= lengths[i];
  }
  return path.at(-1) ?? { x: 0, z: 12 };
}

export function projectMovement(movement: WorldMovement, now: number, environment: EnvironmentType): RoomPoint {
  const from = projectPosition(movement.from, environment), to = projectPosition(movement.to, environment);
  const duration = movement.arrivesAt - movement.startedAt;
  return pointAlong([from, ...routeToStation(from, to)], duration <= 0 ? 1 : (now - movement.startedAt) / duration);
}

export function agentPosition(agent: WorldAgent, now: number, environment: EnvironmentType): RoomPoint {
  const world = agent.world;
  if (environment === 'factory25d') return fromFactoryWorld(agent.manualControl ?? (world.movement ? positionAt(world.movement, now) : world.position));
  if (agent.manualControl) {
    const anchor = projectPosition(world.position, environment);
    return { x: anchor.x + (agent.manualControl.x - world.position.x) / 48,
      z: anchor.z + (agent.manualControl.y - world.position.y) / 32 };
  }
  return world.movement ? projectMovement(world.movement, now, environment) : projectPosition(world.position, environment);
}
