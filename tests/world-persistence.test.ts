import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { WorldSnapshot } from '../shared/types.js';
import { LibSqlWorldRepository } from '../server/persistence/libsql-world-repository.js';
import { WorldPersistence } from '../server/persistence/world-persistence.js';
import type { PersistenceStatus, WorldRepository } from '../server/persistence/world-repository.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function snapshot(revision: number): WorldSnapshot {
  return {
    schemaVersion: 1,
    revision,
    serverTime: 1_000 + revision,
    environment: 'arcade',
    agents: [],
    tombstones: [],
    chat: [],
    events: [],
  };
}

class RecordingRepository implements WorldRepository {
  saved: number[] = [];
  async initialize() {}
  async load() { return null; }
  async save(value: WorldSnapshot) { this.saved.push(value.revision); }
  status(): PersistenceStatus { return { healthy: true, lastSavedRevision: this.saved.at(-1) ?? null, lastError: null }; }
  async close() {}
}

describe('LibSqlWorldRepository', () => {
  it('migrates an empty database and round-trips the newest snapshot', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'agent-factory-'));
    temporaryDirectories.push(directory);
    const url = `file:${join(directory, 'world.db')}`;
    const repository = new LibSqlWorldRepository({ url, production: false });

    await repository.initialize();
    expect(await repository.load()).toBeNull();
    await repository.save(snapshot(2));
    await repository.save(snapshot(1));

    expect(await repository.load()).toMatchObject({ revision: 2, environment: 'arcade' });
    expect(repository.status()).toMatchObject({ healthy: true, lastSavedRevision: 2 });
    await repository.close();
  });
});

describe('WorldPersistence', () => {
  it('coalesces checkpoints and flushes the newest pending revision', async () => {
    const repository = new RecordingRepository();
    const persistence = new WorldPersistence(repository, 60_000);

    persistence.schedule(snapshot(1));
    persistence.schedule(snapshot(2));
    persistence.schedule(snapshot(3));
    await persistence.flush();

    expect(repository.saved).toEqual([3]);
    await persistence.close();
  });

  it('serializes immediate checkpoints in revision order', async () => {
    const repository = new RecordingRepository();
    const persistence = new WorldPersistence(repository);

    persistence.schedule(snapshot(4), true);
    persistence.schedule(snapshot(5), true);
    await persistence.flush();

    expect(repository.saved).toEqual([4, 5]);
    await persistence.close();
  });
});
