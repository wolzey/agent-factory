import type { BoardAgent } from './factory25dBoardData';

import { WORKSTATIONS } from '@shared/factory25d-layout';
export * from '@shared/factory25d-layout';
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
