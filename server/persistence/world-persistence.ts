import type { WorldSnapshot } from '../../shared/types.js';
import type { PersistenceStatus, WorldRepository } from './world-repository.js';

// Ordinary changes are mostly movement and activity, which a restart rebuilds; lifecycle
// changes (joins, removals, chat, avatars) ask for an immediate checkpoint instead.
const DEFAULT_CHECKPOINT_DELAY_MS = 15_000;
const RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 60_000;
// libsql sets no request timeout, so a hung database would otherwise stall every later save.
const SAVE_TIMEOUT_MS = 15_000;
const STALE_AFTER_MS = 60_000;

/** A snapshot, or a function that builds one when the write starts, so it is always the newest. */
export type SnapshotSource = WorldSnapshot | (() => WorldSnapshot);

export class WorldPersistence {
  private pending: SnapshotSource | null = null;
  private pendingImmediate = false;
  private pendingSince: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  // One write at a time. Checkpoints that arrive meanwhile collapse into `pending`, so a
  // slow database delays saves instead of queueing a copy of the world for each revision.
  private inFlight: Promise<void> | null = null;
  private writingSince: number | null = null;
  private failures = 0;
  private closed = false;

  constructor(
    private repository: WorldRepository,
    private checkpointDelayMs = DEFAULT_CHECKPOINT_DELAY_MS,
  ) {}

  schedule(source: SnapshotSource, immediate = false): void {
    if (this.closed) return;
    this.keepNewest(source, Date.now());
    if (immediate) this.pendingImmediate = true;
    this.pump();
  }

  async flush(): Promise<void> {
    while (this.inFlight) await this.inFlight;
    this.clearTimer();
    this.startWrite();
    await this.inFlight;
  }

  status(): PersistenceStatus {
    const status = this.repository.status();
    const oldest = Math.min(this.writingSince ?? Infinity, this.pendingSince ?? Infinity);
    const behindMs = Date.now() - oldest;
    if (behindMs <= STALE_AFTER_MS) return status;
    return { ...status, healthy: false, lastError: status.lastError ?? `World saves are ${Math.round(behindMs / 1000)}s behind` };
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.flush();
    await this.repository.close();
  }

  private keepNewest(source: SnapshotSource, since: number): void {
    const pending = this.pending;
    // A builder always produces the current world, so it wins; between snapshots the later revision does.
    if (!pending || typeof source === 'function' || (typeof pending !== 'function' && source.revision >= pending.revision)) {
      this.pending = source;
    }
    this.pendingSince = Math.min(this.pendingSince ?? since, since);
  }

  private pump(): void {
    if (!this.pending || this.inFlight) return; // A finishing write pumps again.
    // While the database is failing, immediate checkpoints wait out the backoff too.
    if (this.pendingImmediate && !this.failures) {
      this.clearTimer();
      this.startWrite();
    } else if (!this.timer) {
      const delay = this.failures
        ? Math.min(RETRY_DELAY_MS * 2 ** (this.failures - 1), MAX_RETRY_DELAY_MS)
        : this.checkpointDelayMs;
      this.timer = setTimeout(() => {
        this.timer = null;
        this.startWrite();
      }, delay);
    }
  }

  private startWrite(): void {
    const source = this.pending;
    if (!source || this.inFlight) return;
    this.pending = null;
    this.pendingImmediate = false;
    this.writingSince = this.pendingSince;
    this.pendingSince = null;

    let snapshot: WorldSnapshot;
    try {
      snapshot = typeof source === 'function' ? source() : source;
    } catch (error) {
      console.warn('[persistence] Failed to build a world snapshot:', error);
      this.writingSince = null;
      return;
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`save timed out after ${SAVE_TIMEOUT_MS}ms`)), SAVE_TIMEOUT_MS);
    });
    this.inFlight = Promise.race([this.repository.save(snapshot), timedOut])
      .then(() => {
        this.failures = 0;
        this.writingSince = null;
      }, (error) => {
        console.warn(`[persistence] Failed to save world revision ${snapshot.revision}:`, error);
        this.failures++;
        // Retry from the same source: a builder then saves the newest world, not this one.
        if (!this.closed) this.keepNewest(source, this.writingSince ?? Date.now());
        this.writingSince = null;
      })
      .finally(() => {
        clearTimeout(timeout);
        this.inFlight = null;
        if (!this.closed) this.pump();
      });
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
