import type { AvatarConfig, WorldAgent, WorldDelta } from '../shared/types.js';
import type { StoredTeamMember, TeamSnapshot } from '../shared/team.js';
import { DEFAULT_AVATAR } from '../shared/constants.js';

export interface TeamRepository {
  loadTeamMembers(): Promise<StoredTeamMember[]>;
  saveTeamMembers(members: StoredTeamMember[]): Promise<void>;
}

/** Durable people, ephemeral presence. A browser or any owned session lights one card. */
export class TeamRoster {
  private members = new Map<string, StoredTeamMember>();
  private browsers = new Map<object, string>();
  private dirty = new Map<string, StoredTeamMember>();
  private pending: Promise<void> = Promise.resolve();
  private healthy = true;
  constructor(private repository: TeamRepository, private agents: () => WorldAgent[],
    private profile: (ownerId: string) => AvatarConfig | undefined, private now = Date.now) {}

  async initialize() {
    for (const member of await this.repository.loadTeamMembers()) this.members.set(member.id, member);
    this.agents().forEach(agent => this.observe(agent));
    await this.flush();
  }
  private remember(member: StoredTeamMember) {
    const previous = this.members.get(member.id);
    const next = { ...member, lastSeen: Math.max(previous?.lastSeen ?? 0, member.lastSeen) };
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    this.members.set(next.id, next); this.dirty.set(next.id, structuredClone(next));
  }
  observe(agent: WorldAgent) {
    const name = agent.username.trim();
    if (!name || name === 'unknown') return;
    // Never collapse different owners because their display names happen to match.
    this.remember({ id: agent.ownerId ?? `legacy:${name}`, name, avatar: agent.avatar,
      lastSeen: Math.min(this.now(), agent.lastEventAt) });
  }
  sync(delta: WorldDelta) {
    for (const change of delta.changes) if (change.kind === 'agent_upsert') this.observe(change.agent);
  }
  connect(browser: object, principal: { ownerId: string; username: string }) {
    this.browsers.set(browser, principal.ownerId);
    this.remember({ id: principal.ownerId, name: principal.username,
      avatar: this.profile(principal.ownerId) ?? this.members.get(principal.ownerId)?.avatar ?? DEFAULT_AVATAR,
      lastSeen: this.now() });
  }
  disconnect(browser: object) {
    const id = this.browsers.get(browser); this.browsers.delete(browser);
    const member = id && this.members.get(id);
    if (member) this.remember({ ...member, lastSeen: this.now() });
  }
  snapshot(): TeamSnapshot {
    const online = new Set(this.browsers.values()), counts = new Map<string, number>();
    for (const agent of this.agents()) if (agent.activity !== 'stopped') {
      const id = agent.ownerId ?? `legacy:${agent.username.trim()}`;
      online.add(id); counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return { serverTime: this.now(), historyAvailable: this.healthy,
      members: [...this.members.values()].map(member => ({ ...structuredClone(member),
        avatar: structuredClone(this.profile(member.id) ?? member.avatar), online: online.has(member.id), agents: counts.get(member.id) ?? 0,
      })).sort((a, b) => Number(b.online) - Number(a.online) || b.lastSeen - a.lastSeen || a.name.localeCompare(b.name)) };
  }
  flush(): Promise<void> {
    // Preserve new changes while an older batch is in flight; retry failed batches.
    this.pending = this.pending.then(async () => {
      for (const id of new Set(this.browsers.values())) {
        const member = this.members.get(id);
        if (member && this.now() - member.lastSeen >= 30_000) this.remember({ ...member, lastSeen: this.now() });
      }
      if (!this.dirty.size) return;
      const batch = [...this.dirty.values()]; this.dirty.clear();
      try { await this.repository.saveTeamMembers(batch); this.healthy = true; }
      catch {
        this.healthy = false;
        for (const member of batch) if (!this.dirty.has(member.id)) this.dirty.set(member.id, member);
      }
    });
    return this.pending;
  }
}
