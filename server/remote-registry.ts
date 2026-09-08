import {
  MAX_HEARTBEAT_SESSION_IDS,
  MAX_SESSION_ID_LENGTH,
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
  private readonly startedAt: number;
  /** Fail closed: until a server wires the world state in, a report holds nothing. */
  private admits: (sessionId: string, ownerId?: string) => boolean = () => false;

  constructor(
    private ttlMs: number = REMOTE_HEARTBEAT_TTL_MS,
    private now: () => number = Date.now,
  ) {
    this.startedAt = this.now();
  }

  /** Which reports are worth holding: a session the server already knows, whose
   *  owner is the installation reporting it.
   *
   *  This is the admission boundary. Without it a report of invented ids fills
   *  the registry -- and installation credentials are self-minted, so a
   *  per-installation cap alone is no bound at all. Ids that name nothing the
   *  server has cost nothing to refuse: a session the server does not know
   *  cannot be reaped either. */
  setAdmissionCheck(fn: (sessionId: string, ownerId?: string) => boolean) {
    this.admits = fn;
  }

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

    // Admission is the whole bound. A separate capacity of its own would be a
    // scarce resource anyone can exhaust -- installation credentials are
    // self-minted -- and refusing a real machine's report gets its live session
    // reaped. Holding at most one entry per session the server already has is
    // bounded by the world itself.
    let accepted = 0;
    for (const id of ids) {
      if (!this.admits(id, ownerId)) continue;
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

  /** True for the first TTL after startup.
   *
   *  A restarted server restores sessions with their old lastEventAt but an
   *  empty registry, and the first stale sweep runs 30 seconds in -- before a
   *  reporter on a 30-second cycle is guaranteed to have checked in. Without
   *  this window the restart itself reaps every remotely-held session. */
  warmingUp(): boolean {
    return this.now() - this.startedAt < this.ttlMs;
  }

  get size(): number {
    this.prune();
    let total = 0;
    for (const shelf of this.installations.values()) total += shelf.size;
    return total;
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
