import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readContributionIdentities, readContributionRepositories, type ContributionIdentity } from '../../shared/factory-contributions.js';

export interface GitHubConfig {
  organization: string;
  repositories: string[];
  baseBranch: string;
  identities: ContributionIdentity[];
  publicUrl: string;
  appId?: string;
  privateKey?: string;
  appSlug?: string;
}

/** All tenant routing comes from operator configuration, never Host headers or callbacks. */
export function loadGitHubConfig(env: NodeJS.ProcessEnv = process.env): GitHubConfig | undefined {
  if (!env.AF_GITHUB_CONFIG_PATH) {
    if (Object.keys(env).some(key => key.startsWith('AF_GITHUB_') && env[key])) {
      throw new Error('AF_GITHUB_CONFIG_PATH is required for GitHub integration');
    }
    return;
  }
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(readFileSync(env.AF_GITHUB_CONFIG_PATH, 'utf8')); }
  catch { throw new Error('Unable to read GitHub deployment configuration'); }
  if (!raw || typeof raw !== 'object') throw new Error('Invalid GitHub deployment configuration');
  const { organization, repository, repositories, baseBranch = 'main' } = raw;
  const identities = readContributionIdentities(raw.identities);
  // One deployment counts merges across several repositories of the same
  // organization; `repository` stays accepted so an existing config keeps working.
  const scoped = readContributionRepositories(repositories ?? repository, baseBranch);
  if (typeof organization !== 'string' || !/^[a-z\d][a-z\d-]{0,38}$/i.test(organization)
    || !scoped
    || scoped.some(entry => entry.split('/')[0] !== organization.toLowerCase())
    || !identities?.length) throw new Error('Invalid GitHub organization, repository, branch, or identities');
  let url: URL;
  try { url = new URL(env.AF_PUBLIC_URL ?? ''); } catch { throw new Error('AF_PUBLIC_URL must be the deployment origin'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/'
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('AF_PUBLIC_URL must be an HTTPS origin (HTTP is allowed for localhost)');
  }
  const appId = env.AF_GITHUB_APP_ID?.trim();
  if (appId && !/^[1-9]\d*$/.test(appId)) throw new Error('Invalid AF_GITHUB_APP_ID');
  if (env.AF_GITHUB_PRIVATE_KEY && env.AF_GITHUB_PRIVATE_KEY_PATH) throw new Error('Configure only one GitHub private key source');
  let privateKey = env.AF_GITHUB_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (env.AF_GITHUB_PRIVATE_KEY_PATH) {
    try { privateKey = readFileSync(env.AF_GITHUB_PRIVATE_KEY_PATH, 'utf8'); }
    catch { throw new Error('Unable to read GitHub App private key'); }
  }
  if (Boolean(appId) !== Boolean(privateKey)) throw new Error('GitHub App ID and private key must be configured together');
  const appSlug = env.AF_GITHUB_APP_SLUG;
  if (appSlug && !/^[a-z\d-]+$/.test(appSlug)) throw new Error('Invalid AF_GITHUB_APP_SLUG');
  return { organization: organization.toLowerCase(), repositories: scoped,
    baseBranch: baseBranch as string, identities, publicUrl: url.origin, appId, privateKey, appSlug };
}

export function contributionCacheScope(config: GitHubConfig): string {
  // A deployment that counted one repository before and still counts that one
  // repository keeps its scope: hashing ['x'] where 'x' was hashed before would
  // strand its verified totals behind an empty cache for a configuration that
  // did not actually change.
  const scope = config.repositories.length === 1 ? config.repositories[0] : config.repositories;
  return createHash('sha256').update(JSON.stringify([config.publicUrl, config.organization,
    scope, config.baseBranch, config.appId ?? null])).digest('hex');
}

export function githubRegistrationUrl(config: GitHubConfig, name: string): string {
  const url = new URL(`https://github.com/organizations/${config.organization}/settings/apps/new`);
  url.search = new URLSearchParams({ name, url: config.publicUrl,
    description: 'Read merged pull request counts for this Agent Factory deployment.',
    setup_url: `${config.publicUrl}/api/github/setup`, setup_on_update: 'true',
    public: 'false', webhook_active: 'false', request_oauth_on_install: 'false', pull_requests: 'read' }).toString();
  return url.href;
}
