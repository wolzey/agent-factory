import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '../server-config.json');

export class TokenAuth {
  private secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  generateToken(username: string): string {
    const userPart = Buffer.from(username).toString('base64url');
    const hmac = createHmac('sha256', this.secret).update(username).digest('hex');
    return `${userPart}.${hmac}`;
  }

  validateToken(token: string): string | null {
    const dotIndex = token.indexOf('.');
    if (dotIndex < 1) return null;

    const userPart = token.slice(0, dotIndex);
    const hmacPart = token.slice(dotIndex + 1);

    let username: string;
    try {
      username = Buffer.from(userPart, 'base64url').toString('utf-8');
    } catch {
      return null;
    }

    if (!username) return null;

    const expected = createHmac('sha256', this.secret).update(username).digest('hex');
    if (hmacPart !== expected) return null;

    return username;
  }
}

export function loadOrCreateSecret(): string {
  // 1. Environment variable
  const envSecret = process.env.AF_TOKEN_SECRET;
  if (envSecret) return envSecret;

  // 2. server-config.json
  try {
    if (existsSync(CONFIG_PATH)) {
      const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
      if (config.tokenSecret) return config.tokenSecret;
    }
  } catch {
    // Fall through to generation
  }

  // 3. Generate and persist
  const secret = randomBytes(32).toString('hex');
  try {
    let config: Record<string, unknown> = {};
    if (existsSync(CONFIG_PATH)) {
      config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    }
    config.tokenSecret = secret;
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
  } catch {
    // If we can't persist, still return the generated secret for this session
  }

  return secret;
}
