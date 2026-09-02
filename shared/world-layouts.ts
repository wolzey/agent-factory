import type { AgentActivity, EnvironmentType, Position, WorldMovement, WorldZone } from './types.js';

export interface WorldLayoutSpec {
  entrance: Position;
  workSlots: Position[];
  waitingSlots: Position[];
  idleSlots: Position[];
}

const STANDARD_LAYOUT: WorldLayoutSpec = {
  entrance: { x: 400, y: 470 },
  workSlots: Array.from({ length: 12 }, (_, index) => ({
    x: 80 + (index % 6) * 120,
    y: 110 + Math.floor(index / 6) * 110,
  })),
  waitingSlots: Array.from({ length: 4 }, (_, index) => ({
    x: 60 + index * 90,
    y: 390,
  })),
  idleSlots: [
    { x: 550, y: 424 },
    { x: 570, y: 424 },
    { x: 690, y: 424 },
    { x: 710, y: 424 },
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

  const base = slots[0] ?? (zone === 'work'
    ? { x: 80, y: 110 }
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

export function positionAt(movement: WorldMovement, timestamp: number): Position {
  if (timestamp <= movement.startedAt) return { ...movement.from };
  if (timestamp >= movement.arrivesAt) return { ...movement.to };
  const duration = movement.arrivesAt - movement.startedAt;
  const progress = duration <= 0 ? 1 : (timestamp - movement.startedAt) / duration;
  return {
    x: movement.from.x + (movement.to.x - movement.from.x) * progress,
    y: movement.from.y + (movement.to.y - movement.from.y) * progress,
  };
}
