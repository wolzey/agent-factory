import {
  MAX_HEARTBEAT_SESSION_IDS,
  MAX_SESSION_ID_LENGTH,
  MAX_TRACKED_HEARTBEAT_SESSIONS,
  REMOTE_HEARTBEAT_TTL_MS,
} from '../shared/constants.js';

interface HeartbeatEntry {
  expiresAt: number;
  ownerId: string | undefined;
}

/** Sessions a machine reports as still running.
 *
 *  SessionRegistryWatcher reads ~/.claude/sessions on the machine the server
 *  happens to run on, which is the agents' machine only when the server is
 *  local. This is the same signal, pushed over HTTP, so a hosted server can
 *  tell "idle but open" from "gone" instead of reaping both at 30 minutes.
 *
 *  Entries expire on their own: a machine that goes away stops being able to
 *  hold its sessions alive, without needing to say goodbye. */
export class RemoteSessionRegistry {
  private entries = new Map<string, HeartbeatEntry>();

  constructor(
    private ttlMs: number = REMOTE_HEARTBEAT_TTL_MS,
    private maxTracked: number = MAX_TRACKED_HEARTBEAT_SESSIONS,
    private now: () => number = Date.now,
  ) {}

  /** Record a heartbeat. Returns how many ids it kept alive. */
  heartbeat(sessionIds: unknown, ownerId?: string): number {
    const ids = this.sanitize(sessionIds);
    this.prune();

    let accepted = 0;
    for (const id of ids) {
      // Refreshing an id already tracked is always allowed; the cap only stops
      // an unbounded set of new ones from accumulating.
      if (!this.entries.has(id) && this.entries.size >= this.maxTracked) continue;
      this.entries.set(id, { expiresAt: this.now() + this.ttlMs, ownerId });
      accepted += 1;
    }
    return accepted;
  }

  /** True while the installation that owns this session is still reporting it.
   *
   *  An owned session is held open only by its own installation, so nobody can
   *  pin someone else's agent on screen by replaying session ids out of world
   *  state. Sessions from before installation credentials are unowned and
   *  accept any report, which is the same trust /api/hooks already gives them. */
  isAlive(sessionId: string, sessionOwnerId?: string): boolean {
    const entry = this.entries.get(sessionId);
    if (entry === undefined) return false;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(sessionId);
      return false;
    }
    if (sessionOwnerId !== undefined && entry.ownerId !== sessionOwnerId) return false;
    return true;
  }

  get size(): number {
    this.prune();
    return this.entries.size;
  }

  private prune(): void {
    const now = this.now();
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(id);
    }
  }

  /** Bounded, deduplicated, non-empty strings -- the body may be unauthenticated. */
  private sanitize(sessionIds: unknown): string[] {
    if (!Array.isArray(sessionIds)) return [];
    const cleaned = new Set<string>();
    for (const candidate of sessionIds) {
      if (cleaned.size >= MAX_HEARTBEAT_SESSION_IDS) break;
      if (typeof candidate !== 'string') continue;
      const id = candidate.trim();
      if (!id || id.length > MAX_SESSION_ID_LENGTH) continue;
      cleaned.add(id);
    }
    return Array.from(cleaned);
  }
}
