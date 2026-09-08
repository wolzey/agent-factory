import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  readContribution, readContributionIdentities, readContributionRepositories, type ContributionIdentity,
  type ContributionRecord,
  type ContributionSnapshot,
} from '../shared/factory-contributions.js';
import type { InstallationTokenProvider } from './github/app.js';

const REFRESH_INTERVAL_MS = 60 * 60 * 1_000;
const REQUEST_TIMEOUT_MS = 10_000;
const LOGIN = /^[a-z\d](?:[a-z\d-]{0,38})$/i;

export interface ContributionPersistence {
  load(): Promise<ContributionRecord[]>;
  save(records: ContributionRecord[]): Promise<void>;
}

export interface ContributionServiceOptions {
  identities?: readonly { githubLogin: string; factoryUsernames?: string[] }[];
  repository?: string;
  repositories?: readonly string[];
  baseBranch?: string;
  tokenProvider?: InstallationTokenProvider;
  seed?: readonly ContributionRecord[];
  token?: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  persistence?: ContributionPersistence;
}

function recordsFromUnknown(value: unknown): ContributionRecord[] {
  if (!Array.isArray(value)) throw new TypeError('Invalid contribution records');
  const seen = new Set<string>();
  return value.map((row: unknown) => {
    const candidate = readContribution(row);
    if (!candidate) throw new TypeError('Invalid contribution record');
    const login = candidate.githubLogin.toLowerCase();
    if (seen.has(login)) throw new TypeError('Invalid contribution record');
    seen.add(login);
    // Whitelist the public fields even when an adapter provides extra properties.
    return { ...candidate, githubLogin: login };
  });
}

/** Atomic local cache containing only the public count records, never authentication. */
export function createContributionFilePersistence(path: string): ContributionPersistence {
  return {
    async load() {
      try {
        return recordsFromUnknown(JSON.parse(await readFile(path, 'utf8')));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw new Error('Contribution cache unavailable');
      }
    },
    async save(records) {
      const publicRecords = recordsFromUnknown(records);
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(publicRecords), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        await rename(temporary, path);
      } finally {
        await unlink(temporary).catch(() => undefined);
      }
    },
  };
}

export class ContributionService {
  private readonly records = new Map<string, ContributionRecord>();
  private readonly logins: string[];
  private readonly token: string;
  private readonly tokenProvider?: InstallationTokenProvider;
  private readonly repositories: string[];
  private readonly baseBranch: string;
  private readonly identities: ContributionIdentity[];
  private readonly read: typeof globalThis.fetch;
  private readonly now: () => number;
  private readonly persistence?: ContributionPersistence;
  private readonly ready: Promise<void>;
  private readonly activeReads = new Set<AbortController>();
  private refreshState: ContributionSnapshot['refresh'];
  private pending: Promise<ContributionSnapshot> | undefined;
  private interval: ReturnType<typeof setInterval> | undefined;
  private disposed = false;

  constructor(options: ContributionServiceOptions = {}) {
    this.baseBranch = options.baseBranch ?? 'main';
    const configured = options.repositories ?? (options.repository ? [options.repository] : []);
    const repositories = configured.length ? readContributionRepositories([...configured], this.baseBranch) : [];
    if (!repositories) throw new TypeError('Invalid contribution scope');
    this.repositories = repositories;
    const identities = readContributionIdentities((options.identities ?? []).map(identity => ({ ...identity, factoryUsernames: identity.factoryUsernames ?? [] })));
    if (!identities) throw new TypeError('Invalid contribution identity');
    this.identities = identities;
    this.logins = identities.map(identity => identity.githubLogin);
    if (this.logins.length && !this.repositories.length) throw new TypeError('Contribution repository is required');
    this.tokenProvider = options.tokenProvider;
    if (this.logins.some(login => !LOGIN.test(login))) throw new TypeError('Invalid contribution identity');
    for (const record of recordsFromUnknown(options.seed ?? [])) {
      if (this.logins.includes(record.githubLogin)) this.records.set(record.githubLogin, record);
    }
    this.token = options.token?.trim() ?? '';
    this.read = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.persistence = options.persistence;
    this.refreshState = this.token || this.tokenProvider ? 'configured' : 'unconfigured';
    this.ready = this.loadCache();
  }

  snapshot(): ContributionSnapshot {
    return {
      repository: this.repositories[0] ?? '',
      repositories: [...this.repositories],
      baseBranch: this.baseBranch,
      identities: this.identities.map(identity => ({ ...identity, factoryUsernames: [...identity.factoryUsernames] })),
      contributors: this.logins.flatMap(login => {
        const record = this.records.get(login);
        return record ? [{ ...record }] : [];
      }),
      refresh: this.refreshState,
    };
  }

  /** Concurrent calls share one refresh; public reads never trigger GitHub requests. */
  refresh(): Promise<ContributionSnapshot> {
    if (this.disposed) return Promise.resolve(this.snapshot());
    if (this.pending) return this.pending;
    const pending = this.refreshCounts().finally(() => {
      if (this.pending === pending) this.pending = undefined;
    });
    this.pending = pending;
    return pending;
  }

  start(): void {
    if (this.disposed || this.interval) return;
    void this.refresh();
    if (!this.token && !this.tokenProvider) return;
    this.interval = setInterval(() => { void this.refresh(); }, REFRESH_INTERVAL_MS);
    this.interval.unref?.();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.interval) clearInterval(this.interval);
    this.interval = undefined;
    for (const controller of this.activeReads) controller.abort();
    this.activeReads.clear();
  }

  private async loadCache(): Promise<void> {
    if (!this.persistence) return;
    try {
      const loaded = recordsFromUnknown(await this.persistence.load());
      if (this.disposed) return;
      for (const row of loaded) {
        if (!this.logins.includes(row.githubLogin)) continue;
        const previous = this.records.get(row.githubLogin);
        if (!previous || row.checkedAt > previous.checkedAt) this.records.set(row.githubLogin, row);
      }
    } catch {
      // A corrupt/unreadable cache must not replace the checked-in historical baseline.
    }
  }

  private async refreshCounts(): Promise<ContributionSnapshot> {
    await this.ready;
    if (this.disposed || (!this.token && !this.tokenProvider)) return this.snapshot();
    let failed = false;
    let changed = false;
    // Sequential reads stay well within GitHub's search limit for the small known roster.
    for (const githubLogin of this.logins) {
      const result = await this.readCount(githubLogin);
      if (this.disposed) return this.snapshot();
      if (result.count !== undefined) {
        this.records.set(githubLogin, { githubLogin, mergedPullRequests: result.count, checkedAt: this.now() });
        changed = true;
      } else {
        failed = true;
        if (result.stop) break;
      }
    }
    this.refreshState = failed ? 'unavailable' : 'configured';
    if (changed && this.persistence) {
      try { await this.persistence.save(this.snapshot().contributors); } catch {
        // Keep successful live counts in memory; the next refresh retries persistence.
      }
    }
    return this.snapshot();
  }

  private async readCount(login: string): Promise<{ count?: number; stop?: boolean }> {
    const controller = new AbortController();
    this.activeReads.add(controller);
    const cancelled = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error('Contribution read cancelled')), { once: true });
    });
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await Promise.race([
        this.readCountResponse(login, controller.signal),
        cancelled,
      ]);
    } catch {
      return {};
    } finally {
      clearTimeout(timeout);
      this.activeReads.delete(controller);
    }
  }

  private async readCountResponse(login: string, signal: AbortSignal): Promise<{ count?: number; stop?: boolean }> {
    const url = new URL('https://api.github.com/search/issues');
    // Repository qualifiers are OR-ed by GitHub search, so one request returns
    // this author's merges across every configured repository.
    const scope = this.repositories.map(repository => `repo:${repository}`).join(' ');
    url.searchParams.set('q', `${scope} is:pr is:merged base:${this.baseBranch} author:${login}`);
    url.searchParams.set('per_page', '1');
    let token: string;
    try { token = this.tokenProvider ? await this.tokenProvider.token(signal) : this.token; }
    catch { return { stop: true }; }
    if (signal.aborted) return {};
    const response = await this.read(url, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      redirect: 'error',
      signal,
    });
    if (response.status === 401) this.tokenProvider?.invalidate();
    if (!response.ok) return { stop: [401, 403, 429].includes(response.status) };
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object') return {};
    const result = body as { total_count?: unknown; incomplete_results?: unknown; items?: unknown };
    if (result.incomplete_results !== false || !Array.isArray(result.items)
      || !Number.isSafeInteger(result.total_count) || (result.total_count as number) < 0) return {};
    return { count: result.total_count as number };
  }
}

export function registerContributionRoutes(app: FastifyInstance, service: ContributionService): void {
  app.get('/api/contributions', (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return reply.send(service.snapshot());
  });
}
