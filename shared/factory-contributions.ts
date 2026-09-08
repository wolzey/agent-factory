export interface ContributionRecord {
  githubLogin: string;
  mergedPullRequests: number;
  checkedAt: number;
}
export interface ContributionSnapshot {
  /** The first configured repository, kept so an older client still reads a scope. */
  repository: string;
  repositories: string[];
  baseBranch: string;
  contributors: ContributionRecord[];
  identities?: ContributionIdentity[];
  refresh: 'configured' | 'unconfigured' | 'unavailable';
}
export interface ContributionIdentity { githubLogin: string; factoryUsernames: string[] }
export const CONTRIBUTION_REPOSITORY = 'fluid-commerce/fluid-mono';
export const CONTRIBUTION_BRANCH = 'main';

/** Level 2 needs one merge, level 3 three, level 4 six. No expiry or activity decay. */
export function contributionLevel(count: number) {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('Invalid contribution count');
  const level = Math.floor((1 + Math.sqrt(1 + 8 * count)) / 2);
  const floor = level * (level - 1) / 2, next = level * (level + 1) / 2;
  return { level, earned: count - floor, required: level, remaining: next - count, next };
}

export function readContribution(value: unknown): ContributionRecord | undefined {
  if (!value || typeof value !== 'object') return;
  const record = value as Partial<ContributionRecord>;
  if (typeof record.githubLogin !== 'string' || !/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(record.githubLogin)
    || !Number.isSafeInteger(record.mergedPullRequests) || record.mergedPullRequests! < 0
    || !Number.isSafeInteger(record.checkedAt) || record.checkedAt! <= 0) return;
  return { githubLogin: record.githubLogin, mergedPullRequests: record.mergedPullRequests!, checkedAt: record.checkedAt! };
}

/** Explicit aliases only: a task title or a similar display name never earns another person's credit. */
export function contributionFor(username: string, identities: readonly ContributionIdentity[], records: readonly ContributionRecord[]) {
  const key = username.trim().toLowerCase();
  const matches = identities.filter(identity => [identity.githubLogin, ...identity.factoryUsernames]
    .some(name => name.toLowerCase() === key));
  if (matches.length !== 1) return;
  return records.find(record => record.githubLogin.toLowerCase() === matches[0].githubLogin.toLowerCase());
}

/** Bounded, explicit aliases; never infer account ownership from display names. */
export function readContributionIdentities(value: unknown): ContributionIdentity[] | undefined {
  if (!Array.isArray(value) || value.length > 25) return;
  const names = new Set<string>();
  const identities: ContributionIdentity[] = [];
  for (const row of value) {
    if (!row || typeof row.githubLogin !== 'string' || !/^[a-z\d][a-z\d-]{0,38}$/i.test(row.githubLogin)
      || !Array.isArray(row.factoryUsernames) || row.factoryUsernames.length > 20) return;
    const aliases = [row.githubLogin, ...row.factoryUsernames];
    if (aliases.some(name => typeof name !== 'string' || !name.trim() || name.length > 100 || name !== name.trim())) return;
    const normalized = [...new Set(aliases.map(name => name.toLowerCase()))];
    if (normalized.some(name => names.has(name))) return;
    normalized.forEach(name => names.add(name));
    identities.push({ githubLogin: row.githubLogin.toLowerCase(), factoryUsernames: [...row.factoryUsernames] });
  }
  return identities;
}

/** Bounded, deduplicated repositories for one deployment. Counts are summed
 *  across them in a single search, so the list is capped: every entry costs
 *  query length against GitHub's limit. */
export function readContributionRepositories(value: unknown, branch: unknown): string[] | undefined {
  const candidates = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(candidates) || !candidates.length || candidates.length > 10) return;
  const repositories: string[] = [];
  for (const candidate of candidates) {
    if (!validContributionScope(candidate, branch)) return;
    const repository = (candidate as string).toLowerCase();
    if (repositories.includes(repository)) return;
    repositories.push(repository);
  }
  return repositories;
}

export function validContributionScope(repository: unknown, branch: unknown): boolean {
  return typeof repository === 'string' && /^[a-z\d][a-z\d-]{0,38}\/[a-z\d_.-]{1,100}$/i.test(repository)
    && typeof branch === 'string' && /^[a-z\d_./-]{1,200}$/i.test(branch)
    && !branch.startsWith('-');
}
