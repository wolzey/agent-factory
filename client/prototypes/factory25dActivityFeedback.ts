import type { AgentActivity, WorldAgent, WorldSnapshot, WSMessageToClient } from '@shared/types';
import { WORKSTATIONS } from '@shared/factory25d-layout';
import { onFactoryMessage } from './factory25dBoardData';
import './factory25dActivityFeedback.css';

type EffectMessage = Extract<WSMessageToClient, { type: 'effect' }>;
type NoticeKind = 'notification' | 'error' | 'permission' | 'compact' | 'info';
export interface ActivityNotice {
  kind: NoticeKind;
  text: string;
  at: number;
  until: number;
}
export interface StationFeedback {
  active: boolean;
  /** The existing factory's cumulative tool-use heat, kept separate from errors. */
  heat: number;
  pulse: number;
  error: number;
  color: string;
  status: 'idle' | 'working' | 'error';
}
type AgentFeedback = {
  agent: WorldAgent;
  lastStation?: { id: string; at: number };
  notice?: ActivityNotice;
  waitingFor?: 'permission' | 'input';
};
type StationEvent = { sessionId: string; toolAt?: number; errorAt?: number };
const boundedText = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 1000) : '';
const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const decay = (at: number | undefined, now: number, duration: number) => at === undefined ? 0 : clamp(1 - (now - at) / duration);

export function activityStatus(activity: AgentActivity, tool?: string | null, waitingFor?: 'permission' | 'input') {
  switch (activity) {
    case 'thinking': return { kind: activity, glyph: '···', label: 'Thinking' };
    case 'waiting': return { kind: activity, glyph: '?', label: waitingFor === 'permission' ? 'Waiting for permission' : waitingFor === 'input' ? 'Waiting for your input' : 'Waiting for permission or input' };
    case 'planning': return { kind: activity, glyph: '≡', label: 'Planning' };
    case 'compacting': return { kind: activity, glyph: '↻', label: 'Compacting context' };
    case 'reading': case 'writing': case 'running': case 'searching': case 'chatting':
      return { kind: 'working', glyph: '▤', label: [activity[0].toUpperCase() + activity.slice(1), tool].filter(Boolean).join(' · ') };
    case 'stopped': return { kind: activity, glyph: '', label: 'Session ended' };
    default: return { kind: 'idle', glyph: '', label: 'Taking a break' };
  }
}

function heatColor(heat: number) {
  // Warm amber means sustained work. Reserve red for a real failure event.
  const cool = [102, 185, 190], warm = [219, 173, 104];
  return `#${cool.map((channel, i) => Math.round(channel + (warm[i] - channel) * heat).toString(16).padStart(2, '0')).join('')}`;
}

/** The model uses one receipt clock so reconnects and server clock skew cannot prolong effects. */
export class ActivityFeedbackModel {
  private agents = new Map<string, AgentFeedback>();
  private stationEvents = new Map<string, StationEvent>();
  private pending: Array<{ message: EffectMessage; at: number }> = [];
  constructor(private now: () => number = () => performance.now()) {}

  sync(snapshot: WorldSnapshot): ActivityNotice[] {
    const now = this.now(), ids = new Set(snapshot.agents.map(agent => agent.sessionId));
    for (const id of this.agents.keys()) if (!ids.has(id)) this.agents.delete(id);
    for (const [id, event] of this.stationEvents) if (!ids.has(event.sessionId)) this.stationEvents.delete(id);
    for (const agent of snapshot.agents) {
      const entry = this.agents.get(agent.sessionId) ?? { agent };
      if (agent.activity !== 'waiting') entry.waitingFor = undefined;
      entry.agent = agent;
      if (agent.world.zone === 'work' && !agent.manualControl && agent.activity !== 'stopped') {
        const station = WORKSTATIONS[agent.world.slotIndex ?? -1];
        if (station) {
          entry.lastStation = { id: station.id, at: now };
          // A newly assigned worker must never inherit the previous worker's error.
          if (this.stationEvents.get(station.id)?.sessionId !== agent.sessionId) this.stationEvents.delete(station.id);
        }
      }
      this.agents.set(agent.sessionId, entry);
    }
    const pending = this.pending; this.pending = [];
    const notices: ActivityNotice[] = [];
    for (const item of pending) if (now - item.at <= 2000 && this.agents.has(item.message.sessionId)) {
      const notice = this.effect(item.message, item.at); if (notice) notices.push(notice);
    }
    return notices;
  }

  effect(message: EffectMessage, at = this.now()): ActivityNotice | undefined {
    const entry = this.agents.get(message.sessionId);
    if (!entry) {
      // The first effect can arrive in the same socket batch as its new agent.
      this.pending.push({ message, at }); this.pending = this.pending.slice(-32);
      return;
    }
    const { effect, data } = message;
    if (effect === 'elicitation') entry.waitingFor = data?.type === 'permission' ? 'permission' : 'input';
    const station = entry.lastStation;
    if (station && at - station.at < 10_000 && ['tool_start', 'tool_complete', 'error'].includes(effect)) {
      const previous = this.stationEvents.get(station.id);
      const event = previous?.sessionId === message.sessionId ? previous : { sessionId: message.sessionId };
      if (effect === 'error') event.errorAt = at;
      else { event.toolAt = at; if (effect === 'tool_complete') event.errorAt = undefined; }
      this.stationEvents.set(station.id, event);
    }
    let text = '', kind: NoticeKind = 'info', duration = 6000;
    if (effect === 'error') {
      const tool = boundedText(data?.tool), reason = boundedText(data?.reason) || boundedText(data?.message);
      text = [tool, reason || 'Something went wrong'].filter(Boolean).join(': '); kind = 'error'; duration = 10_000;
    } else if (effect === 'notification') {
      text = boundedText(data?.message); kind = 'notification';
    } else if (effect === 'elicitation') {
      text = entry.waitingFor === 'permission' ? 'Permission requested' : 'Your input is needed'; kind = 'permission';
    } else if (effect === 'compact') {
      text = data?.phase === 'post' ? 'Context compacted' : 'Compacting context'; kind = 'compact';
    } else if (effect === 'info_flash') {
      const labels: Record<string, string> = { instructions: 'Instructions loaded', config: 'Configuration updated', cwd: 'Working folder changed', file_changed: 'File changed' };
      text = labels[boundedText(data?.type)] ?? '';
    }
    if (!text) return;
    text = text.slice(0, 1000);
    if (entry.notice?.text === text && entry.notice.kind === kind && at - entry.notice.at < 1500) return;
    const notice = { kind, text, at, until: at + duration };
    entry.notice = notice;
    return notice;
  }

  get(id: string) {
    const entry = this.agents.get(id); if (!entry) return;
    return {
      status: activityStatus(entry.agent.activity, entry.agent.currentTool, entry.waitingFor),
      notice: entry.notice,
      visibleNotice: entry.notice && this.now() < entry.notice.until ? entry.notice : undefined,
      tools: Math.max(0, entry.agent.toolUseCount ?? 0),
    };
  }

  stationStates(): Map<string, StationFeedback> {
    const now = this.now();
    const result = new Map(WORKSTATIONS.map(station => [station.id, {
      active: false, heat: 0, pulse: 0, error: 0, color: heatColor(0), status: 'idle',
    } as StationFeedback]));
    for (const { agent } of this.agents.values()) {
      if (agent.world.zone !== 'work' || agent.manualControl || agent.activity === 'stopped') continue;
      const station = WORKSTATIONS[agent.world.slotIndex ?? -1], state = station && result.get(station.id);
      if (state) { state.active = true; state.heat = clamp((agent.toolUseCount ?? 0) / 20); state.status = 'working'; state.color = heatColor(state.heat); }
    }
    for (const [id, event] of this.stationEvents) {
      const state = result.get(id); if (!state) continue;
      state.pulse = decay(event.toolAt, now, 1400);
      state.error = decay(event.errorAt, now, 6500);
      if (state.error > 0) { state.status = 'error'; state.color = '#da8278'; }
      if (state.pulse === 0 && state.error === 0) this.stationEvents.delete(id);
    }
    return result;
  }

  clear() { this.agents.clear(); this.stationEvents.clear(); this.pending = []; }
}

type LabelEntry = { session: WorldAgent; label: { element: HTMLElement } };
type FeedbackElements = { label: HTMLElement; badge: HTMLElement; notice: HTMLElement; details: HTMLElement; detailText: string };

/** Status bubbles follow the existing name labels, including their room visibility and occlusion. */
export function createActivityFeedback(parent: HTMLElement) {
  const model = new ActivityFeedbackModel(), elements = new Map<string, FeedbackElements>();
  const pendingEffects: Array<{ message: EffectMessage; at: number }> = [];
  const announcer = document.createElement('div');
  announcer.className = 'factory-activity-announcer';
  announcer.setAttribute('role', 'status'); announcer.setAttribute('aria-live', 'polite'); announcer.setAttribute('aria-atomic', 'true');
  parent.append(announcer);
  let snapshot: WorldSnapshot | undefined;
  let lastAnnouncement = -Infinity;
  function announce(notice: ActivityNotice | undefined, name?: string) {
    if (!notice || document.hidden || performance.now() >= notice.until || !['permission', 'error', 'notification'].includes(notice.kind)) return;
    // Keep the shared room quiet for assistive technology during event bursts too.
    if (performance.now() - lastAnnouncement < 1500) return;
    lastAnnouncement = performance.now();
    announcer.textContent = [name, notice.text].filter(Boolean).join(': ');
  }
  const stopMessages = onFactoryMessage(message => {
    if (message.type !== 'effect') return;
    // Flush after sync: an effect and its station reassignment can share a socket batch.
    pendingEffects.push({ message, at: performance.now() });
    if (pendingEffects.length > 64) pendingEffects.shift();
  });
  function remove(element: FeedbackElements) { element.badge.remove(); element.notice.remove(); element.details.remove(); }
  return {
    model,
    sync(next: WorldSnapshot | undefined, entries: Iterable<LabelEntry>) {
      if (!next) return;
      if (next !== snapshot) { snapshot = next; for (const notice of model.sync(next)) announce(notice); }
      const ids = new Set<string>();
      for (const { session, label } of entries) {
        if (!model.get(session.sessionId)) continue;
        ids.add(session.sessionId);
        const previous = elements.get(session.sessionId);
        if (previous?.label === label.element) continue;
        if (previous) remove(previous);
        const badge = document.createElement('span'); badge.className = 'agent-status-bubble'; badge.setAttribute('role', 'img');
        const notice = document.createElement('span'); notice.className = 'agent-event-notice'; notice.setAttribute('aria-hidden', 'true');
        const details = document.createElement('span'); details.className = 'agent-feedback-detail';
        label.element.append(badge, notice);
        (label.element.querySelector('.agent-details') ?? label.element).append(details);
        elements.set(session.sessionId, { label: label.element, badge, notice, details, detailText: '' });
      }
      for (const [id, element] of elements) if (!ids.has(id)) { remove(element); elements.delete(id); }
    },
    update() {
      for (const { message, at } of pendingEffects.splice(0)) {
        const notice = model.effect(message, at);
        const agent = snapshot?.agents.find(agent => agent.sessionId === message.sessionId);
        announce(notice, agent?.sessionName || agent?.username);
      }
      for (const [id, element] of elements) {
        const state = model.get(id); if (!state) continue;
        const { status, visibleNotice, notice } = state;
        const glyph = visibleNotice?.kind === 'error' ? '!' : visibleNotice?.kind === 'notification' ? 'i' : status.glyph;
        element.badge.hidden = !glyph;
        const kind = visibleNotice?.kind === 'error' ? 'error' : status.kind;
        if (element.badge.dataset.kind !== kind) element.badge.dataset.kind = kind;
        if (element.badge.textContent !== glyph) element.badge.textContent = glyph;
        const description = visibleNotice ? `${status.label}. ${visibleNotice.text}` : status.label;
        if (element.badge.getAttribute('aria-label') !== description) { element.badge.setAttribute('aria-label', description); element.badge.title = description; }
        element.notice.hidden = !visibleNotice;
        if (visibleNotice && element.notice.textContent !== visibleNotice.text) { element.notice.textContent = visibleNotice.text; element.notice.dataset.kind = visibleNotice.kind; }
        const detailText = [status.label, `${state.tools} tool calls`, notice ? `Latest ${notice.kind}: ${notice.text}` : ''].filter(Boolean).join(' · ');
        if (element.detailText !== detailText) { element.details.textContent = detailText; element.detailText = detailText; }
      }
    },
    stationStates: () => model.stationStates(),
    dispose() { stopMessages(); elements.forEach(remove); elements.clear(); pendingEffects.length = 0; model.clear(); announcer.remove(); },
  };
}
