import type { WorldSnapshot } from '../../shared/types.js';

export const WORLD_SCHEMA_VERSION = 1;

export interface PersistenceStatus {
  healthy: boolean;
  lastSavedRevision: number | null;
  lastError: string | null;
}

export interface WorldRepository {
  initialize(): Promise<void>;
  load(): Promise<WorldSnapshot | null>;
  save(snapshot: WorldSnapshot): Promise<void>;
  status(): PersistenceStatus;
  close(): Promise<void>;
}

export function parseWorldSnapshot(raw: string): WorldSnapshot {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Stored world snapshot is not an object');
  }

  const snapshot = parsed as Partial<WorldSnapshot>;
  if (snapshot.schemaVersion !== WORLD_SCHEMA_VERSION) {
    throw new Error(`Unsupported world schema version: ${String(snapshot.schemaVersion)}`);
  }
  if (!Number.isSafeInteger(snapshot.revision) || (snapshot.revision ?? -1) < 0) {
    throw new Error('Stored world snapshot has an invalid revision');
  }
  if (!Array.isArray(snapshot.agents)
    || !Array.isArray(snapshot.tombstones)
    || !Array.isArray(snapshot.chat)
    || !Array.isArray(snapshot.events)) {
    throw new Error('Stored world snapshot is missing collection fields');
  }
  if (!['arcade', 'farm', 'office', 'mining', 'factory25d'].includes(String(snapshot.environment))) {
    throw new Error('Stored world snapshot has an invalid environment');
  }

  return snapshot as WorldSnapshot;
}
