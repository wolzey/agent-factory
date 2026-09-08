import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { GitHubConfig } from './config.js';

export interface InstallationTokenProvider {
  token(signal: AbortSignal): Promise<string>;
  invalidate(): void;
}

/** Installation credentials stay in memory and are restricted to one configured repository. */
export class GitHubApp implements InstallationTokenProvider {
  private readonly key: KeyObject;
  private cached?: { token: string; expiresAt: number };
  private pending?: Promise<string>;

  constructor(private readonly config: GitHubConfig,
    private readonly read: typeof fetch = globalThis.fetch,
    private readonly now: () => number = Date.now) {
    try {
      this.key = createPrivateKey(config.privateKey!);
      if (this.key.asymmetricKeyType !== 'rsa') throw new Error();
    } catch { throw new Error('GitHub App private key must be a valid RSA PEM key'); }
    if (!config.appId) throw new Error('GitHub App ID is required');
  }

  invalidate(): void { this.cached = undefined; }

  token(signal: AbortSignal): Promise<string> {
    if (signal.aborted) return Promise.reject(new Error('GitHub request cancelled'));
    if (this.cached && this.cached.expiresAt - 60_000 > this.now()) return Promise.resolve(this.cached.token);
    if (this.pending) return this.pending;
    let onAbort: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new Error('GitHub request cancelled'));
      signal.addEventListener('abort', onAbort, { once: true });
    });
    const pending = Promise.race([this.createToken(signal), cancelled]).finally(() => {
      signal.removeEventListener('abort', onAbort);
      if (this.pending === pending) this.pending = undefined;
    });
    this.pending = pending;
    return pending;
  }

  private async createToken(signal: AbortSignal): Promise<string> {
    const seconds = Math.floor(this.now() / 1000);
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const payload = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: seconds - 60, exp: seconds + 540, iss: this.config.appId })}`;
    const jwt = `${payload}.${sign('RSA-SHA256', Buffer.from(payload), this.key).toString('base64url')}`;
    const installation = await this.request(`/orgs/${this.config.organization}/installation`, jwt, signal);
    if (!Number.isSafeInteger(installation.id) || installation.id <= 0
      || String(installation.app_id) !== this.config.appId
      || installation.account?.type !== 'Organization'
      || installation.account?.login?.toLowerCase() !== this.config.organization
      || installation.suspended_at !== null) throw new Error('GitHub installation does not match this deployment');
    if (signal.aborted) throw new Error('GitHub request cancelled');
    const result = await this.request(`/app/installations/${installation.id}/access_tokens`, jwt, signal, {
      // Every counted repository, and nothing else: the token stays as narrow as
      // the configuration it serves.
      repositories: this.config.repositories.map(repository => repository.split('/')[1]),
      permissions: { pull_requests: 'read' },
    });
    const expiresAt = Date.parse(result.expires_at);
    if (typeof result.token !== 'string' || !result.token || !Number.isFinite(expiresAt)
      || expiresAt <= this.now() + 60_000 || signal.aborted) throw new Error('Invalid GitHub installation token');
    this.cached = { token: result.token, expiresAt };
    return result.token;
  }

  private async request(path: string, jwt: string, signal: AbortSignal, body?: object) {
    const response = await this.read(`https://api.github.com${path}`, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal,
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${jwt}`,
        'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`GitHub installation unavailable (${response.status})`);
    const result = await response.json();
    if (!result || typeof result !== 'object') throw new Error('Invalid GitHub response');
    return result;
  }
}

export function registerGitHubRoutes(app: FastifyInstance, config?: GitHubConfig): void {
  app.get('/api/github', (_request, reply) => reply.header('Cache-Control', 'no-store').send({
    configured: Boolean(config?.appId),
    organization: config?.organization ?? null,
    installUrl: config?.appSlug ? `https://github.com/apps/${config.appSlug}/installations/new` : null,
  }));
  // This is navigation only. Query parameters never bind installations, change config,
  // trigger credential exchange, or request a refresh. The scheduled worker verifies GitHub.
  app.get('/api/github/setup', (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return config ? reply.redirect(`${config.publicUrl}/`) : reply.code(503).send({ error: 'GitHub is not configured' });
  });
}
