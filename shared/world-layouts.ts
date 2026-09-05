import { WORKSTATIONS, toFactoryWorld, factory25dWaypoints } from './factory25d-layout.js';
import type { AgentActivity, EnvironmentType, Position, WorldMovement, WorldZone } from './types.js';

export interface WorldLayoutSpec {
  entrance: Position;
  workSlots: Position[];
  waitingSlots: Position[];
  idleSlots: Position[];
}

/**
 * Top row of workstation slots in the standard room. Cabinets sit 24px above a slot and
 * agents stand 24px below it, so this row starts 20px clear of the back-wall neon strip
 * and leaves the skyline window room to breathe.
 */
const STANDARD_WORK_ROW_Y = 140;
/** Vertical distance between the two workstation rows. */
const STANDARD_WORK_ROW_GAP = 110;
/** Aisle the server routes through when moving between workstations, below the lower row's stance. */
const STANDARD_AISLE_Y = STANDARD_WORK_ROW_Y + STANDARD_WORK_ROW_GAP + 24 + 42;
/**
 * Six workstation columns centred on the 800px room (x = 400). Cabinets are 48px wide, so
 * with this pitch the outer cabinet edges sit 56px from both side walls.
 */
const STANDARD_COLUMN_PITCH = 128;
const STANDARD_FIRST_COLUMN_X = 400 - 2.5 * STANDARD_COLUMN_PITCH;

const STANDARD_LAYOUT: WorldLayoutSpec = {
  entrance: { x: 400, y: 470 },
  workSlots: Array.from({ length: 12 }, (_, index) => ({
    x: STANDARD_FIRST_COLUMN_X + (index % 6) * STANDARD_COLUMN_PITCH,
    y: STANDARD_WORK_ROW_Y + Math.floor(index / 6) * STANDARD_WORK_ROW_GAP,
  })),
  waitingSlots: Array.from({ length: 4 }, (_, index) => ({
    x: 60 + index * 90,
    y: 390,
  })),
  idleSlots: [
    { x: 440, y: 382 },
    { x: 488, y: 382 },
    { x: 440, y: 426 },
    { x: 488, y: 426 },
    { x: 560, y: 382 },
    { x: 608, y: 382 },
    { x: 656, y: 382 },
    { x: 704, y: 382 },
    { x: 560, y: 430 },
    { x: 608, y: 430 },
    { x: 656, y: 430 },
    { x: 704, y: 430 },
  ],
};

const MINING_LAYOUT: WorldLayoutSpec = {
  entrance: { x: 400, y: 470 },
  workSlots: Array.from({ length: 12 }, (_, index) => ({
    x: 90 + (index % 6) * 110,
    y: 120 + Math.floor(index / 6) * 95,
  })),
  waitingSlots: Array.from({ length: 4 }, (_, index) => ({
    x: 80 + index * 95,
    y: 390,
  })),
  idleSlots: [
    { x: 540, y: 426 },
    { x: 575, y: 426 },
    { x: 675, y: 426 },
    { x: 710, y: 426 },
  ],
};

function cloneLayout(layout: WorldLayoutSpec): WorldLayoutSpec {
  return {
    entrance: { ...layout.entrance },
    workSlots: layout.workSlots.map(position => ({ ...position })),
    waitingSlots: layout.waitingSlots.map(position => ({ ...position })),
    idleSlots: layout.idleSlots.map(position => ({ ...position })),
  };
}

export const WORLD_LAYOUTS: Record<EnvironmentType, WorldLayoutSpec> = {
  factory25d: {
    entrance: toFactoryWorld({ x: 6.7, z: 12.8 }),
    workSlots: WORKSTATIONS.map(station => { const p = toFactoryWorld({ x: station.x, z: station.z + 0.55 }); return { x: p.x, y: p.y - 24 }; }),
    waitingSlots: [-6.4, -5.1, -3.8, -2.5].map(x => toFactoryWorld({ x, z: 7.5 })),
    idleSlots: [1.4, 2.7, 4, 5.3, 6.6].flatMap(x => [7.3, 10.7].map(z => toFactoryWorld({ x, z }))),
  },
  arcade: cloneLayout(STANDARD_LAYOUT),
  farm: cloneLayout(STANDARD_LAYOUT),
  office: cloneLayout(STANDARD_LAYOUT),
  mining: cloneLayout(MINING_LAYOUT),
};

const WORKING_ACTIVITIES: AgentActivity[] = [
  'thinking',
  'reading',
  'writing',
  'running',
  'searching',
  'chatting',
  'planning',
  'compacting',
];

export function zoneForActivity(activity: AgentActivity): Exclude<WorldZone, 'entrance' | 'manual'> {
  if (WORKING_ACTIVITIES.includes(activity)) return 'work';
  if (activity === 'waiting') return 'waiting';
  return 'idle';
}

export function slotPosition(
  environment: EnvironmentType,
  zone: Exclude<WorldZone, 'entrance' | 'manual'>,
  index: number,
): Position {
  const layout = WORLD_LAYOUTS[environment];
  const slots = zone === 'work'
    ? layout.workSlots
    : zone === 'waiting'
      ? layout.waitingSlots
      : layout.idleSlots;
  const configured = slots[index];
  if (configured) {
    return zone === 'work'
      ? { x: configured.x, y: configured.y + 24 }
      : { ...configured };
  }
  if (environment === 'factory25d') {
    // Overflow waits on the open patio, clear of the six physical workstations.
    const overflow = Math.max(0, index - slots.length);
    return toFactoryWorld({ x: 10.5 + (overflow % 12) * 0.95, z: 10 + (Math.floor(overflow / 12) % 6) * 0.6 });
  }

  const base = slots[0] ?? (zone === 'work'
    ? { x: STANDARD_FIRST_COLUMN_X, y: STANDARD_WORK_ROW_Y }
    : zone === 'waiting'
      ? { x: 60, y: 390 }
      : { x: 550, y: 424 });

  if (zone === 'work') {
    const stepX = slots[1] ? slots[1].x - slots[0].x : 110;
    const stepY = slots[6] ? slots[6].y - slots[0].y : 95;
    return {
      x: base.x + (index % 6) * stepX,
      y: base.y + Math.floor(index / 6) * stepY + 24,
    };
  }

  const columns = 4;
  const stepX = slots[1] ? slots[1].x - slots[0].x : zone === 'waiting' ? 90 : 70;
  return {
    x: base.x + (index % columns) * stepX,
    y: base.y + Math.floor(index / columns) * 30,
  };
}

/** The workstation stance close enough to read as an intentional drop target. */
export function nearestWorkstationSlot(
  environment: EnvironmentType,
  position: Position,
  maxDistance = 44,
): number | undefined {
  let nearest: { index: number; distance: number } | undefined;
  for (let index = 0; index < WORLD_LAYOUTS[environment].workSlots.length; index++) {
    const target = slotPosition(environment, 'work', index);
    const distance = Math.hypot(position.x - target.x, position.y - target.y);
    if (distance <= maxDistance && (!nearest || distance < nearest.distance)) {
      nearest = { index, distance };
    }
  }
  return nearest?.index;
}

export function positionAt(movement: WorldMovement, timestamp: number): Position {
  if (timestamp <= movement.startedAt) return { ...movement.from };
  if (timestamp >= movement.arrivesAt) return { ...movement.to };
  const duration = movement.arrivesAt - movement.startedAt;
  const progress = duration <= 0 ? 1 : (timestamp - movement.startedAt) / duration;
  const path = [movement.from, ...(movement.waypoints ?? []), movement.to];
  const lengths = path.slice(1).map((point, index) => Math.hypot(point.x - path[index].x, point.y - path[index].y));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total <= 0) return { ...movement.to };

  let remaining = total * progress;
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index];
    if (remaining <= length || index === lengths.length - 1) {
      const segmentProgress = length <= 0 ? 1 : remaining / length;
      return {
        x: path[index].x + (path[index + 1].x - path[index].x) * segmentProgress,
        y: path[index].y + (path[index + 1].y - path[index].y) * segmentProgress,
      };
    }
    remaining -= length;
  }
  return { ...movement.to };
}

export function movementHeadingAt(movement: WorldMovement, timestamp: number): Position {
  const path = [movement.from, ...(movement.waypoints ?? []), movement.to];
  if (path.length < 2) return { x: 0, y: 0 };
  const lengths = path.slice(1).map((point, index) => Math.hypot(point.x - path[index].x, point.y - path[index].y));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total <= 0) return { x: 0, y: 0 };
  const duration = movement.arrivesAt - movement.startedAt;
  const progress = duration <= 0
    ? 1
    : Math.max(0, Math.min(1, (timestamp - movement.startedAt) / duration));
  let remaining = total * progress;
  for (let index = 0; index < lengths.length; index++) {
    if (remaining <= lengths[index] || index === lengths.length - 1) {
      return {
        x: path[index + 1].x - path[index].x,
        y: path[index + 1].y - path[index].y,
      };
    }
    remaining -= lengths[index];
  }
  return { x: 0, y: 0 };
}

/** Half width of a character frame, used to keep routed aisles clear of wall props. */
const AGENT_HALF_WIDTH = 8;
/** Left edge of the wall planters along the right side of the room. */
const ROOM_AISLE_MAX_X = 762;
const ROOM_WALL_Y = 340;
const ROOM_DOOR_TOP_Y = 332;
const ROOM_DOOR_BOTTOM_Y = 352;
const COUNTER_DOOR_X = 330;
const LOUNGE_DOOR_X = 540;

export interface WorldObstacle {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Visible plant bounds plus enough room for an avatar to pass without clipping the leaves. */
export const ARCADE_PLANT_OBSTACLES: readonly WorldObstacle[] = [
  { left: 487, right: 543, top: 397, bottom: 464 },
  { left: 750, right: 794, top: 405, bottom: 464 },
];

export const ARCADE_WINDOW_LOOKOUTS: readonly Position[] = [
  { x: 122, y: 38 },
  { x: 250, y: 38 },
  { x: 378, y: 38 },
  { x: 506, y: 38 },
  { x: 634, y: 38 },
  { x: 678, y: 38 },
];

function pushDistinct(points: Position[], point: Position): void {
  const last = points.at(-1);
  if (!last || last.x !== point.x || last.y !== point.y) points.push(point);
}

function insideObstacle(point: Position, obstacle: WorldObstacle): boolean {
  return point.x > obstacle.left && point.x < obstacle.right
    && point.y > obstacle.top && point.y < obstacle.bottom;
}

export function segmentCrossesObstacle(from: Position, to: Position, obstacle: WorldObstacle): boolean {
  if (insideObstacle(from, obstacle) || insideObstacle(to, obstacle)) return true;
  let near = 0;
  let far = 1;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  for (const [p, q] of [
    [-dx, from.x - obstacle.left],
    [dx, obstacle.right - from.x],
    [-dy, from.y - obstacle.top],
    [dy, obstacle.bottom - from.y],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const ratio = q / p;
    if (p < 0) near = Math.max(near, ratio);
    else far = Math.min(far, ratio);
    if (near > far) return false;
  }
  return near < far && far > 0 && near < 1;
}

function routeLength(from: Position, points: Position[], to: Position): number {
  const route = [from, ...points, to];
  return route.slice(1).reduce(
    (total, point, index) => total + Math.hypot(point.x - route[index].x, point.y - route[index].y),
    0,
  );
}

function obstacleDetour(from: Position, to: Position, obstacle: WorldObstacle): Position[] {
  if (insideObstacle(from, obstacle)) {
    const exits = [
      { x: obstacle.left - 1, y: from.y },
      { x: obstacle.right + 1, y: from.y },
      { x: from.x, y: obstacle.top - 1 },
      { x: from.x, y: obstacle.bottom + 1 },
    ];
    return [exits.reduce((best, exit) =>
      Math.hypot(exit.x - to.x, exit.y - to.y) < Math.hypot(best.x - to.x, best.y - to.y) ? exit : best,
    )];
  }

  const left = obstacle.left - 1;
  const right = obstacle.right + 1;
  const top = obstacle.top - 1;
  const bottom = obstacle.bottom + 1;
  const candidates: Position[][] = [
    [{ x: left, y: top }, { x: right, y: top }],
    [{ x: left, y: bottom }, { x: right, y: bottom }],
    [{ x: left, y: top }, { x: left, y: bottom }],
    [{ x: right, y: top }, { x: right, y: bottom }],
  ].flatMap(route => [route, [...route].reverse()]);
  const valid = candidates.filter(route => {
    const segments = [from, ...route, to];
    return segments.slice(1).every((point, index) =>
      !ARCADE_PLANT_OBSTACLES.some(other => segmentCrossesObstacle(segments[index], point, other)),
    );
  });
  return (valid.length > 0 ? valid : candidates).reduce((best, route) =>
    routeLength(from, route, to) < routeLength(from, best, to) ? route : best,
  );
}

/** Add small visibility-graph detours so lounge routes respect the two floor plants. */
export function arcadePlantWaypoints(from: Position, waypoints: Position[], to: Position): Position[] {
  const routed: Position[] = [];
  let cursor = from;
  const destinations = [...waypoints, to];
  for (let destinationIndex = 0; destinationIndex < destinations.length; destinationIndex++) {
    const destination = destinations[destinationIndex];
    const isFinal = destinationIndex === destinations.length - 1;
    if (!isFinal && ARCADE_PLANT_OBSTACLES.some(obstacle => insideObstacle(destination, obstacle))) continue;
    let guard = 0;
    while (guard++ < ARCADE_PLANT_OBSTACLES.length + 1) {
      const obstacle = ARCADE_PLANT_OBSTACLES.find(item => segmentCrossesObstacle(cursor, destination, item));
      if (!obstacle) break;
      const detour = obstacleDetour(cursor, destination, obstacle);
      if (detour.length === 0) break;
      for (const point of detour) pushDistinct(routed, point);
      cursor = detour.at(-1)!;
    }
    if (!isFinal) pushDistinct(routed, destination);
    cursor = destination;
  }
  return routed;
}

export function arcadeWindowWaypoints(from: Position, to: Position): Position[] {
  const points: Position[] = [];
  const layout = WORLD_LAYOUTS.arcade;
  const safeGaps = Array.from(new Set(layout.workSlots.map(slot => {
    const rightGap = slot.x + 42;
    return rightGap + AGENT_HALF_WIDTH <= ROOM_AISLE_MAX_X ? rightGap : slot.x - 42;
  })));
  const gapX = safeGaps.reduce((best, candidate) =>
    Math.abs(candidate - to.x) < Math.abs(best - to.x) ? candidate : best,
  );
  if (from.y > ROOM_WALL_Y) {
    pushDistinct(points, { x: LOUNGE_DOOR_X, y: from.y });
    pushDistinct(points, { x: LOUNGE_DOOR_X, y: ROOM_DOOR_BOTTOM_Y });
    pushDistinct(points, { x: LOUNGE_DOOR_X, y: ROOM_DOOR_TOP_Y });
  }
  pushDistinct(points, { x: gapX, y: STANDARD_AISLE_Y });
  pushDistinct(points, { x: gapX, y: to.y });
  return arcadePlantWaypoints(from, points, to);
}

/**
 * Server-authored aisle route around workstation footprints. Workstations are
 * approached from the open side through the gap between columns, so agents do
 * not visually pass through cabinets on their way between room zones.
 */
export function workstationWaypoints(
  environment: EnvironmentType,
  from: Position,
  to: Position,
  fromZone: WorldZone,
  toZone: WorldZone,
  fromSlot?: number,
  toSlot?: number,
): Position[] {
  if (environment === 'factory25d') return factory25dWaypoints(from, to);
  const layout = WORLD_LAYOUTS[environment];
  const points: Position[] = [];
  const isLowerRoom = (point: Position) => point.y > ROOM_WALL_Y;
  const isWindowReturn = environment === 'arcade'
    && from.y < STANDARD_WORK_ROW_Y
    && isLowerRoom(to);
  if (fromZone !== 'work' && toZone !== 'work' && fromZone !== 'manual' && !isWindowReturn) return [];
  const doorFor = (zone: WorldZone) => zone === 'idle' ? LOUNGE_DOOR_X : COUNTER_DOOR_X;
  // Agents walk the aisle to the right of a cabinet unless that aisle would run into the
  // wall planters (x >= 762), in which case they use the aisle on its left.
  const gapFor = (slotIndex: number): number => {
    const slot = layout.workSlots[slotIndex] ?? layout.workSlots[0];
    const rightGap = slot.x + 42;
    return rightGap + AGENT_HALF_WIDTH <= ROOM_AISLE_MAX_X ? rightGap : slot.x - 42;
  };

  // A dropped avatar can begin anywhere. If it is above the main aisle, first reach the
  // nearest clear channel between cabinets, then descend below both workstation rows.
  if ((fromZone === 'manual' && from.y < STANDARD_AISLE_Y) || isWindowReturn) {
    const safeGaps = Array.from(new Set(layout.workSlots.map((_, index) => gapFor(index))));
    const nearestGap = safeGaps.reduce((best, candidate) =>
      Math.abs(candidate - from.x) < Math.abs(best - from.x) ? candidate : best,
    );
    pushDistinct(points, { x: nearestGap, y: from.y });
    pushDistinct(points, { x: nearestGap, y: STANDARD_AISLE_Y });
  }

  if (fromZone === 'work' && fromSlot !== undefined) {
    const gapX = gapFor(fromSlot);
    pushDistinct(points, { x: gapX, y: from.y });
    if (toZone === 'work') pushDistinct(points, { x: gapX, y: STANDARD_AISLE_Y });
  }

  if (isWindowReturn) {
    const doorX = doorFor(toZone);
    pushDistinct(points, { x: doorX, y: ROOM_DOOR_TOP_Y });
    pushDistinct(points, { x: doorX, y: ROOM_DOOR_BOTTOM_Y });
    pushDistinct(points, { x: doorX, y: to.y });
  } else if (environment === 'arcade' && isLowerRoom(from) && !isLowerRoom(to)) {
    const doorX = doorFor(fromZone);
    pushDistinct(points, { x: doorX, y: from.y });
    pushDistinct(points, { x: doorX, y: ROOM_DOOR_BOTTOM_Y });
    pushDistinct(points, { x: doorX, y: ROOM_DOOR_TOP_Y });
  } else if (environment === 'arcade' && !isLowerRoom(from) && isLowerRoom(to)) {
    const doorX = doorFor(toZone);
    pushDistinct(points, { x: doorX, y: ROOM_DOOR_TOP_Y });
    pushDistinct(points, { x: doorX, y: ROOM_DOOR_BOTTOM_Y });
    pushDistinct(points, { x: doorX, y: to.y });
  } else if (environment === 'arcade' && isLowerRoom(from) && isLowerRoom(to) && fromZone !== toZone) {
    const fromDoorX = doorFor(fromZone);
    const toDoorX = doorFor(toZone);
    pushDistinct(points, { x: fromDoorX, y: from.y });
    pushDistinct(points, { x: fromDoorX, y: ROOM_DOOR_TOP_Y });
    pushDistinct(points, { x: toDoorX, y: ROOM_DOOR_TOP_Y });
    pushDistinct(points, { x: toDoorX, y: to.y });
  }

  if (toZone === 'work' && toSlot !== undefined) {
    const gapX = gapFor(toSlot);
    if (fromZone === 'work' || (environment === 'arcade' && isLowerRoom(from))) pushDistinct(points, { x: gapX, y: STANDARD_AISLE_Y });
    else if (fromZone === 'manual' && from.y < STANDARD_AISLE_Y) pushDistinct(points, { x: gapX, y: STANDARD_AISLE_Y });
    else pushDistinct(points, { x: gapX, y: from.y });
    pushDistinct(points, { x: gapX, y: to.y });
  }

  // `to` itself belongs to WorldMovement, so only return genuine intermediates.
  const intermediates = points.filter(point => point.x !== to.x || point.y !== to.y);
  return environment === 'arcade' ? arcadePlantWaypoints(from, intermediates, to) : intermediates;
}

export function routeDistance(from: Position, waypoints: Position[], to: Position): number {
  const path = [from, ...waypoints, to];
  return path.slice(1).reduce(
    (sum, point, index) => sum + Math.hypot(point.x - path[index].x, point.y - path[index].y),
    0,
  );
}
