import { createHash, randomBytes } from 'node:crypto';
import type { AuthPrincipal } from './auth.js';

export const HANDOFF_TTL_MS = 60_000;
const DEFAULT_MAX_HANDOFFS = 1_000;
const CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

interface PendingHandoff {
  principal: AuthPrincipal;
  expiresAt: number;
}

export class AuthHandoffManager {
  private pending = new Map<string, PendingHandoff>();

  constructor(
    private now: () => number = Date.now,
    private maxHandoffs = DEFAULT_MAX_HANDOFFS,
  ) {}

  create(principal: AuthPrincipal): { code: string; expiresIn: number } {
    this.removeExpired();
    while (this.pending.size >= this.maxHandoffs) {
      const oldest = this.pending.keys().next().value as string | undefined;
      if (!oldest) break;
      this.pending.delete(oldest);
    }

    const code = randomBytes(32).toString('base64url');
    this.pending.set(this.key(code), {
      principal,
      expiresAt: this.now() + HANDOFF_TTL_MS,
    });
    return { code, expiresIn: Math.floor(HANDOFF_TTL_MS / 1_000) };
  }

  consume(code: string): AuthPrincipal | null {
    if (!CODE_PATTERN.test(code)) return null;
    const key = this.key(code);
    const handoff = this.pending.get(key);
    this.pending.delete(key);
    if (!handoff || handoff.expiresAt <= this.now()) return null;
    return handoff.principal;
  }

  private removeExpired(): void {
    const timestamp = this.now();
    for (const [key, handoff] of this.pending) {
      if (handoff.expiresAt <= timestamp) this.pending.delete(key);
    }
  }

  private key(code: string): string {
    return createHash('sha256').update(code).digest('base64url');
  }
}
