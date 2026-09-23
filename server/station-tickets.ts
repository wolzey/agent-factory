import type { StationTicketPayout, StationTicketState, StationTicketVisit, StationTicketWallet, WorldAgent } from '../shared/types.js';
import { WORKSTATIONS } from '../shared/factory25d-layout.js';
import { zoneForActivity } from '../shared/world-layouts.js';

import { TICKET_ACTIVE_MS, TICKET_COLLECT_MS, ticketOwnerKey } from '../shared/station-tickets.js';
export { TICKET_ACTIVE_MS, TICKET_COLLECT_MS, ticketOwnerKey } from '../shared/station-tickets.js';
// A missing Stop hook must not leave a machine farming credit indefinitely.
export const TICKET_HOOK_GRACE_MS = 5 * 60_000;
type Sample = { at: number; after: number; until: number; slotIndex: number; ownerKey: string; username: string; eligible: boolean };
const finiteCount = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** Only server hook state and server time enter this ledger. Browsers never submit earnings. */
export class StationTickets {
  private wallets = new Map<string, StationTicketWallet>();
  private visits = new Map<string, StationTicketVisit>();
  private samples = new Map<string, Sample>();
  version = 0;
  /** Changes only with wallets, which is all browsers read; visit time accrues far more often. */
  walletVersion = 0;
  snapshot(): StationTicketState { return structuredClone({ wallets: [...this.wallets.values()], visits: [...this.visits.values()] }); }
  restore(state?: StationTicketState) {
    this.wallets.clear(); this.visits.clear(); this.samples.clear();
    for (const wallet of state?.wallets ?? []) if (typeof wallet.key === 'string' && typeof wallet.username === 'string'
      && Number.isSafeInteger(wallet.balance) && wallet.balance >= 0 && finiteCount(wallet.remainderMs) && wallet.remainderMs < TICKET_ACTIVE_MS) this.wallets.set(wallet.key, { ...wallet });
    for (const visit of state?.visits ?? []) if (typeof visit.sessionId === 'string' && typeof visit.ownerKey === 'string'
      && typeof visit.username === 'string' && WORKSTATIONS[visit.slotIndex] && finiteCount(visit.activeMs)) this.visits.set(visit.sessionId, { ...visit });
    this.version++; this.walletVersion++;
  }
  private sample(agent: WorldAgent, now: number, grabbed: boolean): Sample {
    const slotIndex = agent.world.slotIndex ?? -1;
    // Date.now can move backward after a clock correction. Keep the accounting
    // boundary at the newest observed time, while payout/attention use wall time.
    const at = Math.max(now, this.samples.get(agent.sessionId)?.at ?? now);
    return { at, after: Math.max(at, agent.world.movement?.arrivesAt ?? at), until: (agent.ticketHookAt ?? agent.lastEventAt) + TICKET_HOOK_GRACE_MS,
      slotIndex, ownerKey: ticketOwnerKey(agent), username: agent.username,
      eligible: agent.world.zone === 'work' && !!WORKSTATIONS[slotIndex] && zoneForActivity(agent.activity) === 'work'
        && !agent.attention && !agent.manualControl && !grabbed && !(agent.ticketPayout && now < agent.ticketPayout.collectAt) };
  }
  /** Re-arm after routing; no interval is accrued twice at the same timestamp. */
  track(agent: WorldAgent, now: number, grabbed = false) {
    if (!Number.isFinite(now)) return;
    this.samples.set(agent.sessionId, this.sample(agent, now, grabbed));
  }
  observe(agent: WorldAgent, now: number, grabbed = false): StationTicketPayout | undefined {
    if (!Number.isFinite(now)) return;
    const previous = this.samples.get(agent.sessionId), next = this.sample(agent, now, grabbed);
    let visit = this.visits.get(agent.sessionId);
    if (previous?.eligible) {
      const elapsed = Math.max(0, Math.min(now, previous.until) - Math.max(previous.at, previous.after));
      if (elapsed > 0) {
        visit ??= { sessionId: agent.sessionId, ownerKey: previous.ownerKey, username: previous.username, slotIndex: previous.slotIndex, activeMs: 0 };
        visit.activeMs += elapsed; this.visits.set(agent.sessionId, visit); this.version++;
      }
    }
    this.samples.set(agent.sessionId, next);
    if (visit && (!next.eligible || next.until <= now || visit.slotIndex !== next.slotIndex || visit.ownerKey !== next.ownerKey)) {
      return this.collect(agent.sessionId, now);
    }
  }
  /** Idempotent: consuming the visit and updating its wallet are one synchronous operation. */
  collect(sessionId: string, now: number): StationTicketPayout | undefined {
    if (!Number.isFinite(now)) return;
    const visit = this.visits.get(sessionId); if (!visit) return;
    this.visits.delete(sessionId);
    const wallet = this.wallets.get(visit.ownerKey) ?? { key: visit.ownerKey, username: visit.username, balance: 0, remainderMs: 0 };
    const total = wallet.remainderMs + visit.activeMs, count = Math.floor(total / TICKET_ACTIVE_MS);
    wallet.balance += count; wallet.remainderMs = total - count * TICKET_ACTIVE_MS;
    this.wallets.set(wallet.key, wallet); this.version++; this.walletVersion++;
    if (count) return { id: `${sessionId}:${now}:${wallet.balance}`, slotIndex: visit.slotIndex, count, startedAt: now, collectAt: now + TICKET_COLLECT_MS };
  }
  forget(sessionId: string, now: number) {
    if (!Number.isFinite(now)) return;
    const payout = this.collect(sessionId, now); this.samples.delete(sessionId); return payout;
  }
}
