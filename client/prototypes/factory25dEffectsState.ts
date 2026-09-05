import type { EmoteType, FacingDirection, RpsChoice, RpsOutcome, TimedWorldEvent, TombstoneState, WorldAgent, WorldSnapshot, WSMessageToClient } from '@shared/types';
import { positionAt } from '@shared/world-layouts';

export type AgentEffect = {
  id: number; sessionId: string; kind: EmoteType | 'shot' | 'hit' | 'commit' | 'merge' | 'return' | 'arrive' | 'rps';
  startedAt: number; duration: number; facing: FacingDirection; choice?: RpsChoice; outcome?: RpsOutcome;
};
export type ShotEffect = { id: number; sessionId: string; targetSessionIds: string[]; startedAt: number; duration: number; facing: FacingDirection };
export type EffectPose = { x: number; lift: number; angle: number; scaleX: number; scaleY: number; opacity: number };
const emotes = new Set<EmoteType>(['dance', 'jump', 'guitar', 'gun', 'laugh', 'wave', 'sleep', 'explode', 'dizzy', 'flex', 'rage', 'fart']);
const renderedEffects = new Set(['emote', 'shoot', 'rps', 'commit', 'pr_merge', 'session_start']);
const durations: Record<AgentEffect['kind'], number> = { dance: 2800, jump: 1050, guitar: 3200, gun: 800, laugh: 2000,
  wave: 1800, sleep: 3400, explode: 1900, dizzy: 2600, flex: 1900, rage: 2300, fart: 2400,
  shot: 650, hit: 1600, commit: 2500, merge: 3400, return: 1800, arrive: 800, rps: 3900 };
const isChoice = (value: unknown): value is RpsChoice => value === 'rock' || value === 'paper' || value === 'scissors';
const isOutcome = (value: unknown): value is RpsOutcome => value === 'win' || value === 'lose' || value === 'draw';
export const effectProgress = (effect: { startedAt: number; duration: number }, now: number) => Math.max(0, Math.min(1, (now - effect.startedAt) / effect.duration));
export const effectSeed = (id: string) => [...id].reduce((hash, letter) => (Math.imul(hash, 31) + letter.charCodeAt(0)) >>> 0, 7);
export const smoothEffect = (t: number) => { const p = Math.max(0, Math.min(1, t)); return p * p * (3 - 2 * p); };

/** All effects use the shared server clock. Nothing here changes an agent's world state. */
export class FactoryEffectsState {
  readonly effects = new Map<string, AgentEffect>();
  readonly shots: ShotEffect[] = [];
  readonly tombstones = new Map<string, TombstoneState>();
  readonly events = new Map<string, TimedWorldEvent>();
  private agents = new Map<string, FacingDirection>();
  private worldAgents = new Map<string, WorldAgent>();
  private pairs = new Map<string, number>();
  private pending: { message: Extract<WSMessageToClient, { type: 'effect' }>; receivedAt: number }[] = [];
  private serial = 0;

  sync(snapshot: WorldSnapshot, now = snapshot.serverTime) {
    const activeIds = new Set(snapshot.agents.map(agent => agent.sessionId));
    for (const agent of snapshot.agents) {
      if (!this.agents.has(agent.sessionId) && this.tombstones.has(agent.sessionId)) this.start(agent.sessionId, 'return', now);
    }
    this.agents = new Map(snapshot.agents.map(agent => [agent.sessionId, agent.manualControl?.facing ?? agent.world.facing]));
    this.worldAgents = new Map(snapshot.agents.map(agent => [agent.sessionId, agent]));
    for (const id of this.effects.keys()) if (!activeIds.has(id)) this.effects.delete(id);
    this.tombstones.clear();
    for (const stone of snapshot.tombstones) if (stone.expiresAt > now && !activeIds.has(stone.sessionId)) this.tombstones.set(stone.sessionId, stone);
    this.events.clear();
    for (const event of snapshot.events) if (event.expiresAt > now && event.effect === 'vortex') this.events.set(event.id, event);
    this.flush(now);
  }

  enqueue(message: WSMessageToClient, receivedAt: number) {
    if (message.type !== 'effect' || !renderedEffects.has(message.effect)) return;
    this.pending.push({ message, receivedAt });
    if (this.pending.length > 64) this.pending.splice(0, this.pending.length - 64);
  }

  /** Drain after roster reconciliation, retaining only brief waits for missing actors. */
  flush(now: number) {
    const pending = this.pending.splice(0);
    for (const item of pending) if (now - item.receivedAt < 5000) this.receive(item.message, item.receivedAt);
    this.prune(now);
  }

  receive(message: WSMessageToClient, now: number) {
    // Global effects live in snapshot.events, including reconnects. Do not restart
    // them from the redundant global_effect broadcast or from snapshot receipt time.
    if (message.type !== 'effect' || !renderedEffects.has(message.effect)) return;
    const opponent = message.effect === 'rps' ? message.data?.opponentSessionId : undefined;
    if (!this.agents.has(message.sessionId) || (typeof opponent === 'string' && !this.agents.has(opponent))) {
      this.enqueue(message, now); return;
    }
    const id = message.sessionId, data = message.data;
    const direction = data?.facing;
    const facing: FacingDirection = direction === 'up' || direction === 'down' || direction === 'left' || direction === 'right'
      ? direction : this.agents.get(id) ?? 'right';
    if (message.effect === 'rps') {
      const other = data?.opponentSessionId;
      if (typeof other !== 'string' || !this.agents.has(other) || other === id || !isChoice(data?.firstChoice) ||
        !isChoice(data?.secondChoice) || !isOutcome(data?.firstOutcome) || !isOutcome(data?.secondOutcome)) return;
      const pair = JSON.stringify([id, other].sort());
      if ((this.pairs.get(pair) ?? 0) > now) return;
      const startedAt = typeof data.startedAt === 'number' && Number.isFinite(data.startedAt) ? data.startedAt : now;
      if (startedAt + durations.rps <= now) return;
      this.pairs.set(pair, startedAt + durations.rps);
      Object.assign(this.start(id, 'rps', startedAt), { choice: data.firstChoice, outcome: data.firstOutcome });
      Object.assign(this.start(other, 'rps', startedAt), { choice: data.secondChoice, outcome: data.secondOutcome });
      return;
    }
    if (message.effect === 'shoot' || (message.effect === 'emote' && data?.emote === 'gun')) {
      this.start(id, message.effect === 'shoot' ? 'shot' : 'gun', now, facing);
      // Only server-selected targets react. An absent list is not permission for
      // this browser to guess targets from its projected room coordinates.
      const targets = Array.isArray(data?.targetSessionIds)
        ? [...new Set(data.targetSessionIds.filter((value): value is string => typeof value === 'string' && value !== id && this.agents.has(value)))] : [];
      const duration = message.effect === 'shoot' ? 180 : 300;
      this.shots.push({ id: ++this.serial, sessionId: id, targetSessionIds: targets, startedAt: now, duration, facing });
      if (this.shots.length > 24) this.shots.splice(0, this.shots.length - 24);
      for (const target of targets) this.start(target, 'hit', now + duration, facing);
    } else if (message.effect === 'emote' && emotes.has(data?.emote as EmoteType)) {
      this.start(id, data!.emote as EmoteType, now, facing);
      if (data?.emote === 'fart') {
        const position = (agent: WorldAgent) => agent.manualControl ?? (agent.world.movement ? positionAt(agent.world.movement, now) : agent.world.position);
        const source = position(this.worldAgents.get(id)!);
        for (const [otherId, agent] of this.worldAgents) {
          const point = position(agent);
          if (otherId !== id && !agent.manualControl && agent.activity !== 'stopped' && Math.hypot(point.x - source.x, point.y - source.y) < 150) this.start(otherId, 'dizzy', now + 500);
        }
      }
    } else if (message.effect === 'commit' || message.effect === 'pr_merge') {
      this.start(id, message.effect === 'commit' ? 'commit' : 'merge', now);
    } else if (message.effect === 'session_start' && this.effects.get(id)?.kind !== 'return') this.start(id, 'arrive', now);
  }

  private start(sessionId: string, kind: AgentEffect['kind'], startedAt: number, facing = this.agents.get(sessionId) ?? 'right') {
    const effect: AgentEffect = { id: ++this.serial, sessionId, kind, startedAt, duration: durations[kind], facing };
    this.effects.set(sessionId, effect);
    return effect;
  }

  prune(now: number) {
    this.pending = this.pending.filter(item => now - item.receivedAt < 5000);
    for (const [id, effect] of this.effects) if (effect.startedAt + effect.duration <= now) this.effects.delete(id);
    for (let i = this.shots.length - 1; i >= 0; i--) if (this.shots[i].startedAt + this.shots[i].duration + 160 <= now || !this.agents.has(this.shots[i].sessionId)) this.shots.splice(i, 1);
    for (const [id, stone] of this.tombstones) if (stone.expiresAt <= now) this.tombstones.delete(id);
    for (const [id, event] of this.events) if (event.expiresAt <= now) this.events.delete(id);
    for (const [pair, until] of this.pairs) if (until <= now) this.pairs.delete(pair);
  }
  get vortex() { return [...this.events.values()].sort((a, b) => b.startedAt - a.startedAt)[0]; }
  clear() { this.effects.clear(); this.shots.length = 0; this.tombstones.clear(); this.events.clear(); this.pairs.clear(); this.agents.clear(); this.worldAgents.clear(); this.pending.length = 0; }
}

export function effectPose(effect: AgentEffect | undefined, now: number, reducedMotion = false): EffectPose {
  const pose: EffectPose = { x: 0, lift: 0, angle: 0, scaleX: 1, scaleY: 1, opacity: 1 };
  if (!effect || now < effect.startedAt || now >= effect.startedAt + effect.duration || reducedMotion) return pose;
  const p = effectProgress(effect, now), t = (now - effect.startedAt) / 1000;
  const envelope = Math.sin(Math.PI * p), bounce = Math.abs(Math.sin(t * 10));
  switch (effect.kind) {
    case 'dance': case 'merge': pose.x = Math.sin(t * 9) * .07 * envelope; pose.angle = Math.sin(t * 9) * .14 * envelope; pose.lift = bounce * .1 * envelope; break;
    case 'jump': pose.lift = Math.sin(Math.PI * p) * .55; pose.scaleX = 1 + Math.cos(p * Math.PI * 2) * .09 * envelope; pose.scaleY = 1 - Math.cos(p * Math.PI * 2) * .09 * envelope; break;
    case 'guitar': pose.angle = Math.sin(t * 14) * .045 * envelope; pose.lift = bounce * .025; break;
    case 'shot': case 'gun': pose.x = (effect.facing === 'left' ? 1 : -1) * Math.sin(p * Math.PI) * .07; break;
    case 'laugh': pose.scaleY = 1 - bounce * .08 * envelope; pose.angle = Math.sin(t * 14) * .035; break;
    case 'wave': pose.angle = Math.sin(t * 8) * .05 * envelope; break;
    case 'sleep': pose.angle = -.22 * envelope; pose.scaleY = 1 - .18 * envelope; break;
    case 'explode': {
      const reform = smoothEffect((p - .55) / .45);
      const scale = p < .25 ? 1 + p * 1.4 : .05 + reform * .95;
      pose.scaleX = pose.scaleY = scale; pose.opacity = p < .25 ? 1 : .15 + reform * .85; break;
    }
    case 'dizzy': pose.angle = Math.sin(t * 6) * .2 * envelope; pose.x = Math.cos(t * 6) * .07 * envelope; break;
    case 'flex': pose.scaleX = 1 + envelope * .15; pose.scaleY = 1 + envelope * .05; break;
    case 'rage': pose.x = Math.sin(t * 22) * .028 * envelope; pose.scaleY = 1 + envelope * .08; break;
    case 'fart': pose.angle = -.12 * envelope; pose.scaleY = 1 - .06 * envelope; break;
    case 'hit': pose.angle = (effect.facing === 'left' ? -1 : 1) * Math.PI / 2 * envelope; pose.lift = envelope * .06; pose.scaleY = 1 - .2 * envelope; break;
    case 'return': case 'arrive': pose.scaleY = .15 + .85 * smoothEffect(p); pose.lift = Math.sin(p * Math.PI) * .06; break;
    case 'commit': pose.lift = envelope * .13; break;
    case 'rps':
      if (t < 1.66) pose.lift = bounce * .07;
      else if (t > 2.32 && effect.outcome === 'win') pose.lift = bounce * .16 * envelope;
      else if (t > 2.32 && effect.outcome === 'lose') { pose.angle = .13 * envelope; pose.scaleY = 1 - .12 * envelope; }
      break;
  }
  return pose;
}

export function rpsPhase(effect: AgentEffect, now: number): RpsChoice | RpsOutcome {
  const age = now - effect.startedAt;
  return age < 620 ? 'rock' : age < 1140 ? 'paper' : age < 1660 ? 'scissors' : age < 2320 ? effect.choice ?? 'rock' : effect.outcome ?? 'draw';
}

export function vortexStrength(event: TimedWorldEvent, now: number) {
  const p = effectProgress({ startedAt: event.startedAt, duration: event.expiresAt - event.startedAt }, now);
  return smoothEffect(p / .16) * (1 - smoothEffect((p - .8) / .2));
}
