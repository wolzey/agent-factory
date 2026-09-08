import { createHash, generateKeyPairSync, verify } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubApp, registerGitHubRoutes } from '../server/github/app.js';
import { contributionCacheScope, githubRegistrationUrl, loadGitHubConfig, type GitHubConfig } from '../server/github/config.js';
import { ContributionService } from '../server/contributions.js';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const config: GitHubConfig = { organization: 'example', repositories: ['example/one'], baseBranch: 'main',
  identities: [{ githubLogin: 'octocat', factoryUsernames: ['Octo'] }], publicUrl: 'https://factory.example',
  appId: '123', appSlug: 'factory-example', privateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
const now = Date.parse('2026-09-01T00:00:00Z');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const installation = { id: 456, app_id: 123, account: { login: 'example', type: 'Organization' }, suspended_at: null };
const token = { token: 'private-installation-token', expires_at: new Date(now + 3600_000).toISOString() };
const directories: string[] = [];

/** The access-token request body a deployment with this configuration sends. */
async function tokenBodyFor(deployment: GitHubConfig) {
  const read = vi.fn<typeof fetch>().mockResolvedValueOnce(json(installation)).mockResolvedValueOnce(json(token));
  await new GitHubApp(deployment, read, () => now).token(new AbortController().signal);
  return read.mock.calls[1][1]!.body;
}
afterEach(() => { directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })); vi.useRealTimers(); });

function configured(overrides: Record<string, unknown> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'github-config-')); directories.push(dir);
  const path = join(dir, 'config.json');
  writeFileSync(path, JSON.stringify({ ...config, ...overrides }));
  return { AF_GITHUB_CONFIG_PATH: path, AF_PUBLIC_URL: config.publicUrl };
}

describe('deployment configuration', () => {
  it('defaults to no integration and no static counts', () => {
    expect(loadGitHubConfig({})).toBeUndefined();
    expect(new ContributionService().snapshot()).toMatchObject({ repository: '', identities: [], contributors: [], refresh: 'unconfigured' });
  });
  it('requires explicit configuration and rejects tenant/query/redirect ambiguity', () => {
    expect(() => loadGitHubConfig({ AF_GITHUB_APP_ID: '123' })).toThrow('AF_GITHUB_CONFIG_PATH');
    for (const overrides of [{ organization: 'other' }, { repositories: ['example/one org:other'] }, { baseBranch: 'main is:open' },
      { repositories: ['example/one', 'other/two'] }, { repositories: ['example/one', 'example/one'] }, { repositories: [] },
      { identities: [{ githubLogin: 'one', factoryUsernames: ['same'] }, { githubLogin: 'two', factoryUsernames: ['Same'] }] }]) {
      expect(() => loadGitHubConfig(configured(overrides))).toThrow('Invalid GitHub');
    }
    for (const url of ['http://factory.example', 'https://user:secret@factory.example', 'https://factory.example/path', 'https://factory.example/?redirect=bad']) {
      expect(() => loadGitHubConfig({ ...configured(), AF_PUBLIC_URL: url })).toThrow('AF_PUBLIC_URL');
    }
    expect(() => loadGitHubConfig({ ...configured(), AF_GITHUB_APP_ID: '123' })).toThrow('configured together');
  });
  it('loads PEM secrets from an environment or a secret file and separates cache scopes', () => {
    const env = configured();
    const loaded = loadGitHubConfig({ ...env, AF_GITHUB_APP_ID: '123', AF_GITHUB_PRIVATE_KEY: config.privateKey!.replace(/\n/g, '\\n') })!;
    expect(loaded.privateKey).toBe(config.privateKey);
    const keyPath = join(directories.at(-1)!, 'app.pem'); writeFileSync(keyPath, config.privateKey!);
    expect(loadGitHubConfig({ ...env, AF_GITHUB_APP_ID: '123', AF_GITHUB_PRIVATE_KEY_PATH: keyPath })?.privateKey).toBe(config.privateKey);
    for (const change of [{ publicUrl: 'https://other.example' }, { repositories: ['example/two'] },
      { repositories: ['example/one', 'example/two'] }, { baseBranch: 'develop' }, { appId: '789' }]) {
      expect(contributionCacheScope({ ...config, ...change })).not.toBe(contributionCacheScope(config));
    }
  });
  it('keeps the cache scope of a deployment that still counts the one repository it always did', () => {
    // The scope is a hash of what the counts are for. An upgrade that leaves the
    // configuration meaning the same thing must not send a deployment back to an
    // empty cache -- during a GitHub outage that publishes no totals at all.
    const legacy = createHash('sha256').update(JSON.stringify([config.publicUrl, config.organization,
      'example/one', config.baseBranch, config.appId ?? null])).digest('hex');

    expect(contributionCacheScope(config)).toBe(legacy);
    expect(contributionCacheScope({ ...config, repositories: ['example/one', 'example/two'] })).not.toBe(legacy);
  });

  it('generates deployment-specific setup navigation with read-only permissions and no OAuth or webhook', () => {
    const url = new URL(githubRegistrationUrl(config, 'Example Factory'));
    expect(url.pathname).toBe('/organizations/example/settings/apps/new');
    expect(url.searchParams.get('setup_url')).toBe('https://factory.example/api/github/setup');
    expect(url.searchParams.get('pull_requests')).toBe('read');
    expect(url.searchParams.get('public')).toBe('false');
    expect(url.searchParams.get('webhook_active')).toBe('false');
    expect(url.searchParams.get('request_oauth_on_install')).toBe('false');
    expect(url.searchParams.has('callback_urls[]')).toBe(false);
    expect(url.href).not.toContain('PRIVATE');
  });
});

describe('GitHub App installation boundary', () => {
  it('signs a valid JWT, verifies the org and narrows the token to the configured repositories', async () => {
    const read = vi.fn<typeof fetch>().mockResolvedValueOnce(json(installation)).mockResolvedValueOnce(json(token));
    const github = new GitHubApp(config, read, () => now);
    const signal = new AbortController().signal;
    const first = github.token(signal);
    expect(github.token(signal)).toBe(first);
    expect(await first).toBe(token.token);
    expect(await github.token(signal)).toBe(token.token);
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[0][0]).toBe('https://api.github.com/orgs/example/installation');
    const jwt = (read.mock.calls[0][1]!.headers as Record<string, string>).Authorization.slice(7);
    const [header, payload, signature] = jwt.split('.');
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({ iat: now / 1000 - 60, exp: now / 1000 + 540, iss: '123' });
    expect(verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), keys.publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
    expect(read.mock.calls[1][0]).toBe('https://api.github.com/app/installations/456/access_tokens');
    expect(JSON.parse(read.mock.calls[1][1]!.body as string)).toEqual({ repositories: ['one'], permissions: { pull_requests: 'read' } });
    expect(JSON.parse((await tokenBodyFor({ ...config, repositories: ['example/one', 'example/two'] })) as string))
      .toEqual({ repositories: ['one', 'two'], permissions: { pull_requests: 'read' } });
    expect(read.mock.calls.every(([, options]) => options?.redirect === 'error')).toBe(true);
  });
  it.each([
    { ...installation, account: { login: 'another', type: 'Organization' } },
    { ...installation, account: { login: 'example', type: 'User' } },
    { ...installation, app_id: 789 }, { ...installation, suspended_at: '2026-09-01' }, { ...installation, id: '456' },
  ])('refuses a mismatched or suspended installation', async body => {
    const read = vi.fn<typeof fetch>().mockResolvedValue(json(body));
    await expect(new GitHubApp(config, read, () => now).token(new AbortController().signal)).rejects.toThrow('does not match');
    expect(read).toHaveBeenCalledOnce();
  });
  it('renews expiring tokens and invalidates rejected tokens', async () => {
    let clock = now;
    const read = vi.fn<typeof fetch>().mockImplementation(async url => String(url).endsWith('/installation')
      ? json(installation) : json({ ...token, expires_at: new Date(clock + 3600_000).toISOString() }));
    const github = new GitHubApp(config, read, () => clock), signal = new AbortController().signal;
    await github.token(signal); clock += 3540_000;
    await github.token(signal); expect(read).toHaveBeenCalledTimes(4);
    github.invalidate(); await github.token(signal); expect(read).toHaveBeenCalledTimes(6);
  });
  it('feeds live counts to the production service without publishing credentials and recovers after revocation', async () => {
    const read = vi.fn<typeof fetch>().mockResolvedValueOnce(json(installation)).mockResolvedValueOnce(json(token))
      .mockResolvedValueOnce(json({ total_count: 7, incomplete_results: false, items: [] }))
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json(installation)).mockResolvedValueOnce(json(token))
      .mockResolvedValueOnce(json({ total_count: 8, incomplete_results: false, items: [] }));
    const github = new GitHubApp(config, read, () => now);
    const counts = new ContributionService({ ...config, tokenProvider: github, fetch: read, now: () => now });
    try {
      expect(await counts.refresh()).toMatchObject({ contributors: [{ githubLogin: 'octocat', mergedPullRequests: 7 }] });
      expect((read.mock.calls[2][1]?.headers as Record<string, string>).Authorization).toBe(`Bearer ${token.token}`);
      expect(await counts.refresh()).toMatchObject({ refresh: 'unavailable', contributors: [{ mergedPullRequests: 7 }] });
      expect(await counts.refresh()).toMatchObject({ refresh: 'configured', contributors: [{ mergedPullRequests: 8 }] });
      expect(JSON.stringify(counts.snapshot())).not.toContain(token.token);
      expect(JSON.stringify(counts.snapshot())).not.toContain('PRIVATE KEY');
    } finally { counts.dispose(); }
  });
  it('stops the batch on installation failure and bounds stalled token requests', async () => {
    const read = vi.fn<typeof fetch>().mockResolvedValue(json({}, 404));
    const counts = new ContributionService({ ...config, identities: [...config.identities, { githubLogin: 'two' }],
      tokenProvider: new GitHubApp(config, read, () => now), fetch: read });
    expect(await counts.refresh()).toMatchObject({ refresh: 'unavailable', contributors: [] });
    expect(read).toHaveBeenCalledOnce(); counts.dispose();
    vi.useFakeTimers();
    const slow = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
    const stalled = new ContributionService({ ...config, tokenProvider: new GitHubApp(config, slow, () => now), fetch: slow });
    const refresh = stalled.refresh();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await refresh).toMatchObject({ refresh: 'unavailable' });
    expect(slow.mock.calls[0][1]?.signal?.aborted).toBe(true);
    slow.mockResolvedValueOnce(json(installation)).mockResolvedValueOnce(json(token))
      .mockResolvedValueOnce(json({ total_count: 1, incomplete_results: false, items: [] }));
    expect(await stalled.refresh()).toMatchObject({ refresh: 'configured', contributors: [{ mergedPullRequests: 1 }] });
    stalled.dispose();
  });
  it('does not let callback query parameters or Host headers attach or redirect to another tenant', async () => {
    const app = Fastify(); registerGitHubRoutes(app, config);
    try {
      const response = await app.inject({ url: '/api/github/setup?installation_id=999&code=secret&redirect_uri=https://evil.example', headers: { host: 'evil.example' } });
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('https://factory.example/');
      const status = await app.inject('/api/github');
      expect(status.json()).toEqual({ configured: true, organization: 'example', installUrl: 'https://github.com/apps/factory-example/installations/new' });
      expect(status.body).not.toContain('PRIVATE KEY');
    } finally { await app.close(); }
  });
});
