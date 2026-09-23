import type { FastifyRequest } from 'fastify';

/** Agents shown at once. Crowd movement costs grow faster than the number of agents. */
export const MAX_LIVE_AGENTS = 150;
/** New sessions one client address may start per window; an office of teammates shares an address. */
const NEW_SESSIONS_PER_WINDOW = 60;
const WINDOW_MS = 10 * 60_000;

/**
 * The hook endpoint is public, and device credentials are self-issued (any well-formed secret
 * derives its own owner), so neither identifies a person. Bound how fast one client address can
 * add agents, and how many can exist at once.
 */
export class SessionCreationLimits {
  private recent = new Map<string, number[]>();

  constructor(
    readonly maxLiveAgents = MAX_LIVE_AGENTS,
    private readonly perWindow = NEW_SESSIONS_PER_WINDOW,
    private readonly windowMs = WINDOW_MS,
    private readonly now = () => Date.now(),
  ) {}

  /** Records a new session for `client` and reports whether it is within the limit. */
  allow(client: string): boolean {
    const now = this.now(), cutoff = now - this.windowMs;
    const times = (this.recent.get(client) ?? []).filter(at => at > cutoff);
    const allowed = times.length < this.perWindow;
    if (allowed) times.push(now);
    this.recent.set(client, times);
    if (this.recent.size > 5_000) {
      for (const [key, list] of this.recent) if (!list.some(at => at > cutoff)) this.recent.delete(key);
    }
    return allowed;
  }
}

/** Render's Cloudflare edge overwrites CF-Connecting-IP with the connecting client's address. */
export function clientAddress(request: FastifyRequest): string {
  const forwarded = request.headers['cf-connecting-ip'];
  return typeof forwarded === 'string' && forwarded ? forwarded : request.ip;
}
