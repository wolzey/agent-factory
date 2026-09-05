import type { BoardAgent } from './factory25dBoardData';

export const INDOOR_COLUMNS = [-5.5, -3.3, -1.1, 1.1, 3.3, 5.5];
export const INDOOR_ROWS = [-3.8, 0.33];
export const INTERIOR_Z = 1.95;
export type Workstation = { id: string; room: 'factory' | 'patio'; x: number; z: number; label: string };
export const INDOOR_STATIONS: Workstation[] = INDOOR_ROWS.flatMap((z, row) =>
  INDOOR_COLUMNS.map((x, column) => ({ id: `inside-${row * 6 + column}`, room: 'factory', x, z: z + INTERIOR_Z, label: 'arcade station' })),
);
export const PATIO_STATIONS: Workstation[] = [
  { id: 'patio-0', room: 'patio', x: 11, z: -1.2, label: 'railing desk' },
  { id: 'patio-1', room: 'patio', x: 16, z: -1.2, label: 'railing desk' },
  { id: 'patio-2', room: 'patio', x: 21, z: -1.2, label: 'railing desk' },
  { id: 'patio-3', room: 'patio', x: 12.3, z: 3.8, label: 'picnic worktable' },
  { id: 'patio-4', room: 'patio', x: 15, z: 3.8, label: 'picnic worktable' },
  { id: 'patio-5', room: 'patio', x: 20, z: 4.5, label: 'solar console' },
];
// Presentation of the existing server slot IDs: two indoor spots then one
// outside. No second roster, server migration, or independent seat claim.
export const WORKSTATIONS: Workstation[] = PATIO_STATIONS.flatMap((station, i) => [
  ...INDOOR_STATIONS.slice(i * 2, i * 2 + 2), station,
]);
export function isWorking(activity: string) {
  return ['thinking', 'reading', 'writing', 'running', 'searching', 'chatting', 'planning', 'compacting'].includes(activity);
}
export class StationAssignments {
  private slots = new Map<string, number>();
  update(agents: BoardAgent[]) {
    const workers = agents.filter(agent => isWorking(agent.activity));
    const next = new Map<string, number>(), occupied = new Set<number>();
    // Server-authored assignments always win; retain stable fallback assignments
    // for old snapshots that do not yet include world state.
    for (const agent of workers) if (agent.slot !== null && agent.slot !== undefined && !occupied.has(agent.slot)) {
      next.set(agent.id, agent.slot); occupied.add(agent.slot);
    }
    for (const agent of workers) if (!next.has(agent.id)) {
      let slot = this.slots.get(agent.id) ?? 0;
      if (occupied.has(slot)) { slot = 0; while (occupied.has(slot)) slot++; }
      next.set(agent.id, slot); occupied.add(slot);
    }
    this.slots = next;
    return new Map(workers.map(agent => [agent.id, WORKSTATIONS[next.get(agent.id)!] ?? null]));
  }
}

/** Shared crossing through the actual side doorway, with aisles clear of desks. */
export function routeToStation(from: { x: number; z: number }, target: { x: number; z: number }) {
  const fromPatio = from.x > 8, toPatio = target.x > 8;
  if (fromPatio === toPatio) {
    const aisle = toPatio ? 1.1 : -0.5;
    return [{ x: from.x, z: aisle }, { x: target.x, z: aisle }, target];
  }
  const door = [{ x: 7.2, z: -2.5 }, { x: 8.7, z: -2.5 }];
  if (fromPatio) door.reverse();
  return [
    { x: from.x, z: fromPatio ? 1.1 : -0.5 },
    { x: fromPatio ? 8.7 : 7.2, z: fromPatio ? 1.1 : -0.5 },
    ...door,
    { x: toPatio ? 8.7 : 7.2, z: toPatio ? 1.1 : -0.5 },
    { x: target.x, z: toPatio ? 1.1 : -0.5 }, target,
  ];
}
