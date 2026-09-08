import { contributionFor, readContribution, readContributionIdentities, readContributionRepositories, type ContributionIdentity, type ContributionRecord } from '@shared/factory-contributions';
import { factoryHost, isControlPreview } from './factory25dBoardData';

/** One small roster request, shared by every nameplate. Never send private-repo credentials to a browser. */
export function watchContributions(changed: () => void) {
  let records: ContributionRecord[] = [], identities: ContributionIdentity[] = [], scope = '', stopped = false;
  let request: AbortController | undefined;
  const refresh = async () => {
    if (stopped || document.hidden || request) return;
    const controller = new AbortController(); request = controller;
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch('/api/contributions', { signal: controller.signal, credentials: 'omit', cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      if (stopped || !data || !Array.isArray(data.contributors)) return;
      const nextIdentities = readContributionIdentities(data.identities);
      // A deployment may count several repositories; an unconfigured one sends none.
      const nextRepositories = readContributionRepositories(data.repositories ?? data.repository, data.baseBranch);
      if (!nextIdentities || (!nextRepositories
        && !(data.repository === '' && data.contributors.length === 0 && nextIdentities.length === 0))) return;
      const nextScope = JSON.stringify([nextRepositories ?? [], data.baseBranch, nextIdentities]);
      const scopeChanged = scope !== nextScope;
      if (scopeChanged) { records = []; identities = nextIdentities; scope = nextScope; }
      const candidates: ContributionRecord[] = data.contributors.map(readContribution).filter((value: ContributionRecord | undefined): value is ContributionRecord => !!value);
      let updated = scopeChanged;
      for (const identity of identities) {
        const matches = candidates.filter(record => record.githubLogin.toLowerCase() === identity.githubLogin.toLowerCase());
        if (matches.length !== 1) continue;
        const record = matches[0], index = records.findIndex(old => old.githubLogin.toLowerCase() === record.githubLogin.toLowerCase());
        if (index >= 0 && records[index].checkedAt >= record.checkedAt) continue;
        if (index < 0) records.push(record); else records[index] = record;
        updated = true;
      }
      if (updated) changed();
    } catch { /* Keep the last verified total; unavailable never means level one. */ }
    finally { clearTimeout(timeout); if (request === controller) request = undefined; }
  };
  // Isolated previews must not contact another deployment for contribution data.
  const enabled = !isControlPreview() && (!import.meta.env.DEV || factoryHost() === location.origin);
  const timer = enabled ? setInterval(() => void refresh(), 5 * 60_000) : undefined;
  if (enabled) { void refresh(); document.addEventListener('visibilitychange', refresh); }
  return {
    forUser(username: string) { return contributionFor(username, identities, records); },
    dispose() { stopped = true; clearInterval(timer); request?.abort(); document.removeEventListener('visibilitychange', refresh); },
  };
}
