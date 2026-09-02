import type { WorldDelta, WorldSnapshot } from '@shared/types';

export type DeltaResult = 'applied' | 'gap' | 'stale';

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class WorldStore {
  private current: WorldSnapshot | null = null;

  get snapshot(): WorldSnapshot | null {
    return this.current ? clone(this.current) : null;
  }

  replace(snapshot: WorldSnapshot): void {
    this.current = clone(snapshot);
  }

  apply(delta: WorldDelta): DeltaResult {
    if (!this.current) return 'gap';
    if (delta.revision <= this.current.revision) return 'stale';
    if (delta.previousRevision !== this.current.revision) return 'gap';

    const agents = new Map(this.current.agents.map(agent => [agent.sessionId, agent]));
    const tombstones = new Map(this.current.tombstones.map(tombstone => [tombstone.sessionId, tombstone]));
    const events = new Map(this.current.events.map(event => [event.id, event]));
    const chat = [...this.current.chat];

    for (const change of delta.changes) {
      switch (change.kind) {
        case 'agent_upsert':
          agents.set(change.agent.sessionId, clone(change.agent));
          break;
        case 'agent_remove':
          agents.delete(change.sessionId);
          break;
        case 'tombstone_upsert':
          tombstones.set(change.tombstone.sessionId, clone(change.tombstone));
          break;
        case 'tombstone_remove':
          tombstones.delete(change.sessionId);
          break;
        case 'chat_append':
          chat.push(clone(change.chat));
          if (chat.length > 100) chat.splice(0, chat.length - 100);
          break;
        case 'event_upsert':
          events.set(change.event.id, clone(change.event));
          break;
        case 'event_remove':
          events.delete(change.eventId);
          break;
      }
    }

    this.current = {
      ...this.current,
      revision: delta.revision,
      serverTime: delta.serverTime,
      agents: Array.from(agents.values()),
      tombstones: Array.from(tombstones.values()),
      chat,
      events: Array.from(events.values()),
    };
    return 'applied';
  }
}
