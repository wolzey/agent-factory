import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('keeps one write in flight and then saves only the newest checkpoint', async () => {
    const repository = new GatedRepository();
    const persistence = new WorldPersistence(repository);

    persistence.schedule(snapshot(1), true);
    for (let revision = 2; revision <= 50; revision++) persistence.schedule(snapshot(revision), true);
    expect(repository.started).toEqual([1]);

    repository.release();
    await persistence.flush();
    expect(repository.started).toEqual([1, 50]);
    await persistence.close();
  });

  it('builds the snapshot only when the write starts', async () => {
    const repository = new RecordingRepository();
    const persistence = new WorldPersistence(repository, 60_000);
    let revision = 0, built = 0;
    const current = () => { built++; return snapshot(revision); };

    for (revision = 1; revision <= 20; revision++) persistence.schedule(current);
    revision = 21;
    await persistence.flush();

    expect(built).toBe(1);
    expect(repository.saved).toEqual([21]);
    await persistence.close();
  });

  it('backs off after failures, reports stale saves, then recovers', async () => {
    vi.useFakeTimers();
    try {
      const repository = new RecordingRepository();
      let failing = true;
      const save = repository.save.bind(repository);
      repository.save = async value => { if (failing) throw new Error('database unavailable'); await save(value); };
      const persistence = new WorldPersistence(repository, 1_000);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      persistence.schedule(snapshot(1), true);
      await vi.advanceTimersByTimeAsync(0);
      expect(warn).toHaveBeenCalledTimes(1);

      // Immediate checkpoints wait out the backoff (2s, 4s, 8s, ...) instead of hammering.
      persistence.schedule(snapshot(2), true);
      await vi.advanceTimersByTimeAsync(1_999);
      expect(warn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(warn).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(persistence.status()).toMatchObject({ healthy: false });
      expect(persistence.status().lastError).toMatch(/World saves are \d+s behind/);

      failing = false;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(repository.saved).toEqual([2]);
      expect(persistence.status()).toMatchObject({ healthy: true, lastSavedRevision: 2 });
      warn.mockRestore();
      await persistence.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up on a hung save and retries', async () => {
    vi.useFakeTimers();
    try {
      const repository = new RecordingRepository();
      let hang = true;
      const save = repository.save.bind(repository);
      repository.save = value => (hang ? new Promise<void>(() => {}) : save(value));
      const persistence = new WorldPersistence(repository, 1_000);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      persistence.schedule(snapshot(7), true);
      await vi.advanceTimersByTimeAsync(15_000);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('revision 7'), expect.objectContaining({ message: expect.stringMatching(/timed out/) }));

      hang = false;
      await vi.advanceTimersByTimeAsync(2_000);
      expect(repository.saved).toEqual([7]);
      warn.mockRestore();
      await persistence.close();
    } finally {
      vi.useRealTimers();
    }
  });
});

/** Holds every save open until `release()`, recording which revisions started writing. */
class GatedRepository extends RecordingRepository {
  started: number[] = [];
  private gate: Promise<void>;
  private open!: () => void;
  constructor() {
    super();
    this.gate = new Promise(resolve => { this.open = resolve; });
  }
  release() { this.open(); }
  override async save(value: WorldSnapshot) {
    this.started.push(value.revision);
    await this.gate;
    await super.save(value);
  }
}
