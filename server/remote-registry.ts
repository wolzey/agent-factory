import {
  MAX_HEARTBEAT_SESSION_IDS,
  MAX_HEARTBEAT_SESSIONS_PER_INSTALLATION,
  MAX_SESSION_ID_LENGTH,
  MAX_TRACKED_HEARTBEAT_SESSIONS,
  REMOTE_HEARTBEAT_TTL_MS,
} from '../shared/constants.js';

/** Reports from an installation without a credential. They can only ever hold
 *  open sessions that are themselves unowned, which is the trust /api/hooks
 *  already gives a legacy install. */
const LEGACY_INSTALLATION = '';

/** Sessions a machine reports as still running.
 *
 *  SessionRegistryWatcher reads ~/.claude/sessions on the machine the server
 *  happens to run on, which is the agents' machine only when the server is
 *  local. This is the same signal, pushed over HTTP, so a hosted server can
 *  tell "idle but open" from "gone" instead of reaping both at 30 minutes.
 *
 *  Reports are filed per installation and never merged. Session ids are public
 *  in world state, so a shared id -> owner map would let anyone overwrite the
 *  owner recorded for someone else's session and get it reaped; here a report
 *  can only ever add to the reporter's own shelf.
 *
 *  Entries expire on their own: a machine that goes away stops being able to
 *  hold its sessions alive, without needing to say goodbye. */
export class RemoteSessionRegistry {
  private installations = new Map<string, Map<string, number>>();

  constructor(
    private ttlMs: number = REMOTE_HEARTBEAT_TTL_MS,
    private maxTracked: number = MAX_TRACKED_HEARTBEAT_SESSIONS,
    private now: () => number = Date.now,
    private maxPerInstallation: number = MAX_HEARTBEAT_SESSIONS_PER_INSTALLATION,
  ) {}

  /** Record a heartbeat. Returns how many of the reported ids it is holding. */
  heartbeat(sessionIds: unknown, ownerId?: string): number {
    const installation = ownerId ?? LEGACY_INSTALLATION;
    const ids = this.sanitize(sessionIds);
    this.prune();

    let shelf = this.installations.get(installation);
    if (!shelf) {
      shelf = new Map<string, number>();
      this.installations.set(installation, shelf);
    }

    let accepted = 0;
    for (const id of ids) {
      // Refreshing an id this installation already holds is always allowed; the
      // caps only bound how many new ones can accumulate.
      if (!shelf.has(id)) {
        if (shelf.size >= this.maxPerInstallation) continue;
        if (this.trackedCount() >= this.maxTracked && !this.evictFromLargest(shelf)) continue;
      }
      shelf.set(id, this.now() + this.ttlMs);
      accepted += 1;
    }

    if (shelf.size === 0) this.installations.delete(installation);
    return accepted;
  }

  /** True while the installation that owns this session is still reporting it.
   *
   *  An owned session is only held open by its own installation, so ids read
   *  out of world state cannot be used to pin -- or to drop -- someone else's
   *  agent. A session from before installation credentials is unowned and is
   *  held open by unowned reports, matching how /api/hooks treats it. */
  isAlive(sessionId: string, sessionOwnerId?: string): boolean {
    const shelf = this.installations.get(sessionOwnerId ?? LEGACY_INSTALLATION);
    const expiresAt = shelf?.get(sessionId);
    if (expiresAt === undefined) return false;
    if (expiresAt <= this.now()) {
      shelf!.delete(sessionId);
      return false;
    }
    return true;
  }

  get size(): number {
    this.prune();
    return this.trackedCount();
  }

  private trackedCount(): number {
    let total = 0;
    for (const shelf of this.installations.values()) total += shelf.size;
    return total;
  }

  /** Make room for a new id by dropping the soonest-expiring entry of whichever
   *  installation holds the most. An installation flooding the registry loses
   *  its own entries before it can crowd out a machine reporting real work. */
  private evictFromLargest(requester: Map<string, number>): boolean {
    let largest: Map<string, number> | undefined;
    for (const shelf of this.installations.values()) {
      if (!largest || shelf.size > largest.size) largest = shelf;
    }
    if (!largest || largest.size <= requester.size) return false;

    let oldest: string | undefined;
    let oldestExpiry = Infinity;
    for (const [id, expiresAt] of largest) {
      if (expiresAt < oldestExpiry) {
        oldest = id;
        oldestExpiry = expiresAt;
      }
    }
    if (oldest === undefined) return false;
    largest.delete(oldest);
    return true;
  }

  private prune(): void {
    const now = this.now();
    for (const [installation, shelf] of this.installations) {
      for (const [id, expiresAt] of shelf) {
        if (expiresAt <= now) shelf.delete(id);
      }
      if (shelf.size === 0) this.installations.delete(installation);
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
