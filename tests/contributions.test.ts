import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ContributionService,
  createContributionFilePersistence,
  registerContributionRoutes,
} from '../server/contributions.js';
import type { ContributionRecord } from '../shared/factory-contributions.js';

const seed: ContributionRecord[] = [{ githubLogin: 'tingeym', mergedPullRequests: 542, checkedAt: 1_000 }];
const identities = [{ githubLogin: 'tingeym' }, { githubLogin: 'newcomer' }];
const validCount = (count: number) => new Response(JSON.stringify({ total_count: count, incomplete_results: false, items: [] }));
const services: ContributionService[] = [];

function service(options: ConstructorParameters<typeof ContributionService>[0] = {}) {
  const value = new ContributionService({ seed, identities, repository: 'fluid-commerce/fluid-mono', now: () => 5_000, ...options });
  services.push(value);
  return value;
}

afterEach(() => {
  for (const value of services) value.dispose();
  services.length = 0;
  vi.useRealTimers();
});

describe('authored Fluid main contribution totals', () => {
  it('serves an honest historical baseline without a token or invented zero counts', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const counts = service({ fetch });
    counts.start();
    expect(await counts.refresh()).toEqual({ repository: 'fluid-commerce/fluid-mono', repositories: ['fluid-commerce/fluid-mono'], baseBranch: 'main', contributors: seed, identities: identities.map(identity => ({ ...identity, factoryUsernames: [] })), refresh: 'unconfigured' });
    expect(fetch).not.toHaveBeenCalled();
    const snapshot = counts.snapshot();
    snapshot.contributors[0].mergedPullRequests = 0;
    expect(counts.snapshot().contributors[0].mergedPullRequests).toBe(542);
  });

  it('reads only authored merged PR counts from the fixed repository and accepts verified zero', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(validCount(543)).mockResolvedValueOnce(validCount(0));
    const counts = service({ token: 'private-token', fetch });
    const snapshot = await counts.refresh();
    expect(snapshot.contributors).toEqual([
      { githubLogin: 'tingeym', mergedPullRequests: 543, checkedAt: 5_000 },
      { githubLogin: 'newcomer', mergedPullRequests: 0, checkedAt: 5_000 },
    ]);
    expect(snapshot.refresh).toBe('configured');
    expect(fetch).toHaveBeenCalledTimes(2);
    const [request, init] = fetch.mock.calls[0];
    const url = new URL(String(request));
    expect(url.origin + url.pathname).toBe('https://api.github.com/search/issues');
    expect(url.searchParams.get('q')).toBe('repo:fluid-commerce/fluid-mono is:pr is:merged base:main author:tingeym');
    expect(url.searchParams.get('per_page')).toBe('1');
    expect(init).toMatchObject({ method: 'GET', redirect: 'error', headers: { Authorization: 'Bearer private-token' } });
    expect(JSON.stringify(snapshot)).not.toContain('private-token');
  });

  it('counts one author across every configured repository in a single search', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(validCount(7));
    const counts = service({
      token: 'private-token',
      fetch,
      repository: undefined,
      repositories: ['fluid-commerce/fluid-mono', 'Fluid-Commerce/fluid', 'fluid-commerce/fluid-integrations'],
    });

    const snapshot = await counts.refresh();

    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.searchParams.get('q')).toBe(
      'repo:fluid-commerce/fluid-mono repo:fluid-commerce/fluid repo:fluid-commerce/fluid-integrations is:pr is:merged base:main author:tingeym');
    // One request per author, not per author per repository.
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(snapshot.repositories).toEqual(['fluid-commerce/fluid-mono', 'fluid-commerce/fluid', 'fluid-commerce/fluid-integrations']);
    expect(snapshot.repository).toBe('fluid-commerce/fluid-mono');
  });

  it('refuses a repository list that is malformed, duplicated, or unbounded', () => {
    for (const repositories of [['fluid-commerce/fluid-mono', 'fluid-commerce/fluid-mono'], ['fluid-commerce/one two'],
      ['fluid-commerce/one org:other'], Array.from({ length: 11 }, (_, index) => `fluid-commerce/repo-${index}`)]) {
      expect(() => service({ repository: undefined, repositories })).toThrow('Invalid contribution scope');
    }
  });

  it.each([401, 403, 429])('preserves the last count and stops the batch on HTTP %s', async status => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('private server body', { status }));
    const counts = service({ token: 'private-token', fetch });
    expect(await counts.refresh()).toMatchObject({ contributors: seed, refresh: 'unavailable' });
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.stringify(counts.snapshot())).not.toContain('private');
  });

  it.each([
    { total_count: 0, incomplete_results: true, items: [] },
    { total_count: 0, items: [] },
    { total_count: -1, incomplete_results: false, items: [] },
    { total_count: 1.5, incomplete_results: false, items: [] },
    { total_count: '0', incomplete_results: false, items: [] },
    { total_count: null, incomplete_results: false, items: [] },
    { total_count: Number.MAX_SAFE_INTEGER + 1, incomplete_results: false, items: [] },
    { total_count: 0, incomplete_results: false },
    null,
  ])('does not overwrite known history with incomplete/malformed GitHub output: %j', async body => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response(JSON.stringify(body)));
    const counts = service({ token: 'token', fetch });
    expect(await counts.refresh()).toMatchObject({ contributors: seed, refresh: 'unavailable' });
  });

  it('preserves successes in a partial batch and recovers after a transient failure', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error('private failure body'))
      .mockResolvedValueOnce(validCount(7))
      .mockResolvedValueOnce(validCount(550))
      .mockResolvedValueOnce(validCount(8));
    const counts = service({ token: 'token', fetch });
    expect(await counts.refresh()).toMatchObject({ refresh: 'unavailable', contributors: [seed[0], { githubLogin: 'newcomer', mergedPullRequests: 7, checkedAt: 5_000 }] });
    expect(await counts.refresh()).toMatchObject({ refresh: 'configured', contributors: [
      { githubLogin: 'tingeym', mergedPullRequests: 550, checkedAt: 5_000 },
      { githubLogin: 'newcomer', mergedPullRequests: 8, checkedAt: 5_000 },
    ] });
  });

  it('deduplicates concurrent refreshes, polls hourly, and clears scheduling on disposal', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => validCount(543));
    const counts = service({ token: 'token', fetch });
    counts.start(); counts.start();
    const first = counts.refresh();
    expect(counts.refresh()).toBe(first);
    await first;
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3_599_999);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(4);
    counts.dispose(); counts.dispose(); counts.start();
    await vi.advanceTimersByTimeAsync(7_200_000);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out a hanging response body and keeps known history', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue({ ok: true, json: () => new Promise(() => {}) } as Response);
    const counts = service({ identities: [identities[0]], token: 'token', fetch });
    const refresh = counts.refresh();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await refresh).toMatchObject({ contributors: seed, refresh: 'unavailable' });
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts an in-flight request on disposal and does not start remaining authors', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() => new Promise(() => {}));
    const counts = service({ token: 'token', fetch });
    const refresh = counts.refresh();
    await vi.advanceTimersByTimeAsync(0);
    counts.dispose();
    await refresh;
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(counts.snapshot().contributors).toEqual(seed);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('loads only newer known cached records and persists successful public fields', async () => {
    let saved: ContributionRecord[] = [];
    const persistence = {
      load: async () => [
        { githubLogin: 'TINGEYM', mergedPullRequests: 544, checkedAt: 2_000 },
        { githubLogin: 'stranger', mergedPullRequests: 9_000, checkedAt: 3_000 },
      ],
      save: async (rows: ContributionRecord[]) => { saved = rows; },
    };
    const baseline = service({ persistence });
    expect((await baseline.refresh()).contributors).toEqual([{ githubLogin: 'tingeym', mergedPullRequests: 544, checkedAt: 2_000 }]);
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => validCount(545));
    const live = service({ token: 'private-token', fetch, persistence });
    await live.refresh();
    expect(saved).toEqual(live.snapshot().contributors);
    expect(JSON.stringify(saved)).not.toContain('private-token');
  });

  it('does not let old or corrupt caches erase the checked-in baseline', async () => {
    for (const loaded of [
      [{ githubLogin: 'tingeym', mergedPullRequests: 1, checkedAt: 999 }],
      [{ githubLogin: 'tingeym', mergedPullRequests: -1, checkedAt: 6_000 }],
      [{ ...seed[0], checkedAt: 6_000 }, { ...seed[0], checkedAt: 7_000 }],
    ]) {
      const counts = service({ persistence: { load: async () => loaded, save: async () => {} } });
      expect((await counts.refresh()).contributors).toEqual(seed);
    }
  });

  it('keeps successful live data usable if disk writes fail', async () => {
    const counts = service({ token: 'token', fetch: async () => validCount(560), persistence: {
      load: async () => { throw new Error('private path'); },
      save: async () => { throw new Error('private path'); },
    } });
    expect(await counts.refresh()).toMatchObject({ refresh: 'configured', contributors: [{ githubLogin: 'tingeym', mergedPullRequests: 560 }, { githubLogin: 'newcomer', mergedPullRequests: 560 }] });
  });

  it('rejects ambiguous seed records and unsafe identity qualifiers', () => {
    expect(() => service({ seed: [...seed, { ...seed[0], githubLogin: 'TINGEYM' }] })).toThrow('Invalid contribution record');
    expect(() => service({ identities: [{ githubLogin: 'tingeym is:open' }] })).toThrow('Invalid contribution identity');
  });

  it('exposes only public snapshots through a read-only route without starting external reads', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const counts = service({ token: 'secret', fetch });
    const app = Fastify();
    registerContributionRoutes(app, counts);
    try {
      const response = await app.inject({ method: 'GET', url: '/api/contributions' });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.json()).toEqual(counts.snapshot());
      expect(response.body).not.toContain('secret');
      expect(fetch).not.toHaveBeenCalled();
      expect((await app.inject({ method: 'POST', url: '/api/contributions' })).statusCode).toBe(404);
    } finally { await app.close(); }
  });
});

describe('public contribution disk cache', () => {
  it('writes atomically, strips extra fields, and rejects corrupt/duplicate records', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'factory-contributions-'));
    const path = join(dir, 'nested', 'counts.json');
    const persistence = createContributionFilePersistence(path);
    try {
      expect(await persistence.load()).toEqual([]);
      await persistence.save([{ ...seed[0], credential: 'never-write-this' } as ContributionRecord]);
      expect(await persistence.load()).toEqual(seed);
      expect(await readFile(path, 'utf8')).not.toContain('never-write-this');
      expect(await readdir(join(dir, 'nested'))).toEqual(['counts.json']);
      await persistence.save([{ ...seed[0], mergedPullRequests: 543 }]);
      expect((await persistence.load())[0].mergedPullRequests).toBe(543);
      await writeFile(path, '{invalid');
      await expect(persistence.load()).rejects.toThrow('Contribution cache unavailable');
      await writeFile(path, JSON.stringify([seed[0], seed[0]]));
      await expect(persistence.load()).rejects.toThrow('Contribution cache unavailable');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
