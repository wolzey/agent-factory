import type { WorldSnapshot } from '../../shared/types.js';
import type { PersistenceStatus, WorldRepository } from './world-repository.js';

const DEFAULT_CHECKPOINT_DELAY_MS = 1_000;
const RETRY_DELAY_MS = 2_000;

export class WorldPersistence {
  private pending: WorldSnapshot | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(
    private repository: WorldRepository,
    private checkpointDelayMs = DEFAULT_CHECKPOINT_DELAY_MS,
  ) {}

  schedule(snapshot: WorldSnapshot, immediate = false): void {
    if (this.closed) return;
    if (!this.pending || snapshot.revision >= this.pending.revision) {
      this.pending = snapshot;
    }

    if (immediate) {
      this.clearTimer();
      this.enqueuePending();
    } else if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.enqueuePending();
      }, this.checkpointDelayMs);
    }
  }

  async flush(): Promise<void> {
    this.clearTimer();
    this.enqueuePending();
    await this.writeChain;
  }

  status(): PersistenceStatus {
    return this.repository.status();
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.flush();
    await this.repository.close();
  }

  private enqueuePending(): void {
    const snapshot = this.pending;
    if (!snapshot) return;
    this.pending = null;

    this.writeChain = this.writeChain.then(async () => {
      try {
        await this.repository.save(snapshot);
      } catch (error) {
        console.warn(`[persistence] Failed to save world revision ${snapshot.revision}:`, error);
        if (!this.closed && (!this.pending || snapshot.revision > this.pending.revision)) {
          this.pending = snapshot;
        }
        if (!this.closed && !this.timer) {
          this.timer = setTimeout(() => {
            this.timer = null;
            this.enqueuePending();
          }, RETRY_DELAY_MS);
        }
      }
    });
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
