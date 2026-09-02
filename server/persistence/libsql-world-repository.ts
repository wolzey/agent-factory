import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import type { WorldSnapshot } from '../../shared/types.js';
import {
  WORLD_SCHEMA_VERSION,
  parseWorldSnapshot,
  type PersistenceStatus,
  type WorldRepository,
} from './world-repository.js';

const DEFAULT_LOCAL_URL = 'file:.data/agent-factory.db';

export interface LibSqlRepositoryOptions {
  url?: string;
  authToken?: string;
  production?: boolean;
}

export class LibSqlWorldRepository implements WorldRepository {
  private client: Client | null = null;
  private persistenceStatus: PersistenceStatus = {
    healthy: true,
    lastSavedRevision: null,
    lastError: null,
  };

  constructor(private options: LibSqlRepositoryOptions = {}) {}

  async initialize(): Promise<void> {
    const production = this.options.production ?? process.env.NODE_ENV === 'production';
    const url = this.options.url ?? process.env.TURSO_DATABASE_URL ?? (production ? undefined : DEFAULT_LOCAL_URL);
    const authToken = this.options.authToken ?? process.env.TURSO_AUTH_TOKEN;

    if (!url) {
      throw new Error('TURSO_DATABASE_URL is required in production');
    }
    if (production && !authToken) {
      throw new Error('TURSO_AUTH_TOKEN is required in production');
    }
    if (url.startsWith('file:')) {
      const filePath = url.slice('file:'.length);
      mkdirSync(dirname(resolve(filePath)), { recursive: true });
    }

    this.client = createClient({ url, authToken });
    try {
      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS world_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          schema_version INTEGER NOT NULL,
          revision INTEGER NOT NULL,
          snapshot TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      this.markHealthy();
    } catch (error) {
      this.markFailed(error);
      throw error;
    }
  }

  async load(): Promise<WorldSnapshot | null> {
    const client = this.requireClient();
    try {
      const result = await client.execute({
        sql: 'SELECT schema_version, revision, snapshot FROM world_state WHERE id = 1',
        args: [],
      });
      const row = result.rows[0];
      if (!row) {
        this.markHealthy();
        return null;
      }
      if (Number(row.schema_version) !== WORLD_SCHEMA_VERSION) {
        throw new Error(`Unsupported database schema version: ${String(row.schema_version)}`);
      }
      const snapshot = parseWorldSnapshot(String(row.snapshot));
      if (snapshot.revision !== Number(row.revision)) {
        throw new Error('Stored world revision does not match its database revision');
      }
      this.persistenceStatus.lastSavedRevision = snapshot.revision;
      this.markHealthy();
      return snapshot;
    } catch (error) {
      this.markFailed(error);
      throw error;
    }
  }

  async save(snapshot: WorldSnapshot): Promise<void> {
    const client = this.requireClient();
    try {
      await client.execute({
        sql: `
          INSERT INTO world_state (id, schema_version, revision, snapshot, updated_at)
          VALUES (1, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            schema_version = excluded.schema_version,
            revision = excluded.revision,
            snapshot = excluded.snapshot,
            updated_at = excluded.updated_at
          WHERE excluded.revision >= world_state.revision
        `,
        args: [WORLD_SCHEMA_VERSION, snapshot.revision, JSON.stringify(snapshot), Date.now()],
      });
      this.persistenceStatus.lastSavedRevision = Math.max(
        this.persistenceStatus.lastSavedRevision ?? 0,
        snapshot.revision,
      );
      this.markHealthy();
    } catch (error) {
      this.markFailed(error);
      throw error;
    }
  }

  status(): PersistenceStatus {
    return { ...this.persistenceStatus };
  }

  async close(): Promise<void> {
    this.client?.close();
    this.client = null;
  }

  private requireClient(): Client {
    if (!this.client) throw new Error('World repository has not been initialized');
    return this.client;
  }

  private markHealthy(): void {
    this.persistenceStatus.healthy = true;
    this.persistenceStatus.lastError = null;
  }

  private markFailed(error: unknown): void {
    this.persistenceStatus.healthy = false;
    this.persistenceStatus.lastError = error instanceof Error ? error.message : String(error);
  }
}
