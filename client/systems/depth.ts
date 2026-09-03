import { GRAB_DEPTH } from '../grab/physics';
import type { Point } from '../grab/physics';

/**
 * One floor-sorted depth band for every grounded thing in the room. Depth grows with the
 * y coordinate of the point where an object touches the floor, so an avatar whose feet are
 * above a cabinet's base line renders behind the cabinet and one standing below it renders
 * in front. Airborne avatars leave the band entirely and render above everything.
 */
export const FLOOR_DEPTH_BASE = 7;
export const DEPTH_PER_PIXEL = 0.001;
/** Shoes end on row 30 of the 32px character frame, whose origin is the centre. */
export const AGENT_FEET_OFFSET = 14;
/** Character frame half extents at scale 1. */
export const AGENT_HALF_WIDTH = 8;
export const AGENT_HALF_HEIGHT = 16;
/** Workstation cabinets are 32px frames drawn at 1.5x, so the base sits 24px below the container centre. */
export const MACHINE_BASE_OFFSET = 24;
export const MACHINE_HALF_WIDTH = 24;
export const MACHINE_HALF_HEIGHT = 24;

export function floorDepth(baselineY: number): number {
  return FLOOR_DEPTH_BASE + baselineY * DEPTH_PER_PIXEL;
}

export function agentBaseline(y: number, scale = 1): number {
  return y + AGENT_FEET_OFFSET * scale;
}

export function machineBaseline(y: number): number {
  return y + MACHINE_BASE_OFFSET;
}

/** Render depth for an agent or subagent body centred at `y`. */
export function agentDepth(y: number, scale = 1, airborne = false): number {
  return airborne ? GRAB_DEPTH : floorDepth(agentBaseline(y, scale));
}

/** Render depth for a workstation cabinet centred at `y`. */
export function machineDepth(y: number): number {
  return floorDepth(machineBaseline(y));
}

/** True when the avatar's feet are above the cabinet's base line, i.e. it stands behind the machine. */
export function isBehindMachine(agent: Point, machine: Point, scale = 1): boolean {
  return agentBaseline(agent.y, scale) < machineBaseline(machine.y);
}

/** True when a grounded avatar overlaps the cabinet on screen and is sorted behind it. */
export function machineOccludes(agent: Point, machine: Point, scale = 1): boolean {
  if (!isBehindMachine(agent, machine, scale)) return false;
  const horizontal = Math.abs(agent.x - machine.x) < AGENT_HALF_WIDTH * scale + MACHINE_HALF_WIDTH;
  const agentTop = agent.y - AGENT_HALF_HEIGHT * scale;
  const agentBottom = agentBaseline(agent.y, scale);
  const machineTop = machine.y - MACHINE_HALF_HEIGHT;
  const machineBottom = machineBaseline(machine.y);
  const vertical = agentBottom > machineTop && agentTop < machineBottom;
  return horizontal && vertical;
}
