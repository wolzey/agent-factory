import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '../server-config.json');

const DEVICE_SECRET_PATTERN = /^afd1_[A-Za-z0-9_-]{43}$/;
const SESSION_TOKEN_PREFIX = 'afs1';
export const BROWSER_SESSION_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export interface AuthPrincipal {
  ownerId: string;
  username: string;
}

export type DeviceAuthorization =
  | { kind: 'legacy' }
  | { kind: 'invalid' }
  | { kind: 'authenticated'; ownerId: string };

interface BrowserSessionClaims extends AuthPrincipal {
  issuedAt: number;
  expiresAt: number;
}

export class AuthService {
  constructor(
    private secret: string,
    private now: () => number = Date.now,
  ) {}

  authenticateDevice(authorization: string | undefined): DeviceAuthorization {
    if (authorization === undefined) return { kind: 'legacy' };
    const match = /^Bearer (.+)$/.exec(authorization);
    if (!match || !DEVICE_SECRET_PATTERN.test(match[1])) return { kind: 'invalid' };
    return { kind: 'authenticated', ownerId: this.deriveOwnerId(match[1]) };
  }

  issueBrowserSession(principal: AuthPrincipal): string {
    const issuedAt = this.now();
    const claims: BrowserSessionClaims = {
      ...principal,
      issuedAt,
      expiresAt: issuedAt + BROWSER_SESSION_MAX_AGE_SECONDS * 1_000,
    };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = this.sign(`${SESSION_TOKEN_PREFIX}.${payload}`).toString('base64url');
    return `${SESSION_TOKEN_PREFIX}.${payload}.${signature}`;
  }

  verifyBrowserSession(token: string | undefined): AuthPrincipal | null {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== SESSION_TOKEN_PREFIX) return null;

    let provided: Buffer;
    try {
      provided = Buffer.from(parts[2], 'base64url');
    } catch {
      return null;
    }
    const expected = this.sign(`${parts[0]}.${parts[1]}`);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

    try {
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8')) as Partial<BrowserSessionClaims>;
      if (typeof claims.ownerId !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(claims.ownerId)) return null;
      if (typeof claims.username !== 'string' || !claims.username || claims.username.length > 100) return null;
      if (!Number.isSafeInteger(claims.issuedAt) || !Number.isSafeInteger(claims.expiresAt)) return null;
      if ((claims.expiresAt ?? 0) <= this.now()) return null;
      return { ownerId: claims.ownerId, username: claims.username };
    } catch {
      return null;
    }
  }

  private deriveOwnerId(deviceSecret: string): string {
    return createHmac('sha256', this.secret)
      .update(`agent-factory-device:${deviceSecret}`)
      .digest('base64url');
  }

  private sign(value: string): Buffer {
    return createHmac('sha256', this.secret).update(value).digest();
  }
}

export function loadOrCreateSecret(): string {
  const envSecret = process.env.AF_TOKEN_SECRET;
  if (envSecret) return envSecret;

  try {
    if (existsSync(CONFIG_PATH)) {
      const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
      if (config.tokenSecret) return config.tokenSecret;
    }
  } catch {
    // Fall through to generation.
  }

  const secret = randomBytes(32).toString('hex');
  try {
    let config: Record<string, unknown> = {};
    if (existsSync(CONFIG_PATH)) {
      config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    }
    config.tokenSecret = secret;
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
  } catch {
    // An in-memory secret still supports the current process.
  }

  return secret;
}
