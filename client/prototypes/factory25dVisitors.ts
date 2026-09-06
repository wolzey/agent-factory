import type { TeamMember } from '@shared/team';

/** Keep the current outing stable across presence polls. A new day's visit can
 * feature different people from the same saved roster, including offline people. */
export function mountainVisitors(members: readonly TeamMember[], currentIds: readonly string[] = [],
  day = Math.floor(Date.now() / 86_400_000)): TeamMember[] {
  const byId = new Map(members.map(member => [member.id, member]));
  const pool = [...byId.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (!pool.length) return [];
  const start = ((day % pool.length) + pool.length) % pool.length;
  const ordered = [...currentIds, ...pool.slice(start).map(member => member.id), ...pool.slice(0, start).map(member => member.id)];
  return [...new Set(ordered)].flatMap(id => byId.has(id) ? [byId.get(id)!] : []).slice(0, 2);
}
