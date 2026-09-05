import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { WorldAgent, WorldSnapshot } from '../shared/types';
import { DEFAULT_AVATAR } from '../shared/constants';
import { FactoryEffectsState, effectPose, rpsPhase, vortexStrength } from '../client/prototypes/factory25dEffectsState';
import { createFactoryEffects } from '../client/prototypes/factory25dEffects';

function agent(sessionId: string): WorldAgent {
  return { sessionId, username: sessionId, avatar: { ...DEFAULT_AVATAR, hairStyle: 4 }, cwd: '/factory', activity: 'idle',
    currentTool: null, subagents: [], startedAt: 0, lastEventAt: 1000,
    world: { zone: 'idle', position: { x: 400, y: 300 }, facing: 'right' } };
}
function snapshot(agents = [agent('a'), agent('b'), agent('c')]): WorldSnapshot {
  return { schemaVersion: 1, revision: 1, serverTime: 1000, environment: 'factory25d', agents, tombstones: [], events: [], chat: [] };
}
const neutral = { x: 0, lift: 0, angle: 0, scaleX: 1, scaleY: 1, opacity: 1 };
afterEach(() => vi.unstubAllGlobals());

describe('2.5D shared effects', () => {
  it('reconciles a same-batch new actor before consuming effects, without replaying or changing their timestamp', () => {
    const state = new FactoryEffectsState(); state.sync(snapshot([agent('a')]));
    state.enqueue({ type: 'effect', sessionId: 'b', effect: 'session_start' }, 1010);
    state.enqueue({ type: 'effect', sessionId: 'b', effect: 'emote', data: { emote: 'wave' } }, 1012);
    state.enqueue({ type: 'effect', sessionId: 'a', effect: 'shoot', data: { targetSessionIds: ['c'] } }, 1015);
    // One animation frame sees the latest combined delta, including the new target.
    state.sync({ ...snapshot(), revision: 2, serverTime: 1032 });
    const wave = state.effects.get('b')!;
    expect(wave.kind).toBe('wave'); expect(wave.startedAt).toBe(1012);
    expect(state.shots[0].targetSessionIds).toEqual(['c']); expect(state.effects.get('c')?.startedAt).toBe(1195);
    state.flush(1048); state.sync({ ...snapshot(), revision: 3, serverTime: 1064 });
    expect(state.effects.get('b')).toBe(wave); expect(state.shots.length).toBe(1);
  });

  it('briefly waits for an RPS opponent and discards stale or excess queued effects', () => {
    const state = new FactoryEffectsState(); state.sync(snapshot([agent('a')]));
    state.receive({ type: 'effect', sessionId: 'a', effect: 'rps', data: { startedAt: 1000, opponentSessionId: 'b',
      firstChoice: 'paper', secondChoice: 'rock', firstOutcome: 'win', secondOutcome: 'lose' } }, 1005);
    state.flush(1020); expect(state.effects.size).toBe(0);
    state.sync({ ...snapshot(), revision: 2, serverTime: 1050 });
    expect(state.effects.get('a')?.startedAt).toBe(1000); expect(state.effects.get('b')?.startedAt).toBe(1000);
    state.clear();
    for (let i = 0; i < 100; i++) state.enqueue({ type: 'effect', sessionId: String(i), effect: 'emote', data: { emote: 'dance' } }, 2000);
    state.sync({ ...snapshot(Array.from({ length: 100 }, (_, i) => agent(String(i)))), serverTime: 2100 });
    expect(state.effects.size).toBe(64); expect(state.effects.has('0')).toBe(false); expect(state.effects.has('99')).toBe(true);
    state.clear(); state.receive({ type: 'effect', sessionId: 'late', effect: 'emote', data: { emote: 'wave' } }, 3000);
    state.sync({ ...snapshot([agent('late')]), serverTime: 5100 });
    expect(state.effects.size).toBe(0); // The wave's own lifetime elapsed; no fresh replay.
    state.clear(); state.receive({ type: 'effect', sessionId: 'late', effect: 'emote', data: { emote: 'dance' } }, 3000);
    state.sync({ ...snapshot([agent('late')]), serverTime: 9000 }); expect(state.effects.size).toBe(0);
  });

  it('animates only server-selected shot targets, with impact after projectile travel', () => {
    const state = new FactoryEffectsState(), world = snapshot(), before = structuredClone(world);
    state.sync(world);
    state.receive({ type: 'effect', sessionId: 'a', effect: 'shoot', data: { facing: 'left', targetSessionIds: ['b', 'b', 'missing', 'a'] } }, 1100);
    expect(state.shots[0].targetSessionIds).toEqual(['b']);
    expect(state.effects.has('c')).toBe(false);
    const hit = state.effects.get('b')!;
    expect(effectPose(hit, 1200)).toEqual(neutral);
    expect(effectPose(hit, 1450).angle).toBeLessThan(0);
    expect(effectPose(hit, hit.startedAt + hit.duration)).toEqual(neutral);
    expect(world).toEqual(before);
    state.clear(); state.sync(world);
    state.receive({ type: 'effect', sessionId: 'a', effect: 'shoot' }, 1100);
    expect([...state.effects.keys()]).toEqual(['a']);
  });

  it('uses one RPS countdown and the server result for both players, ignoring duplicate pairs', () => {
    const state = new FactoryEffectsState(); state.sync(snapshot());
    const round = { type: 'effect' as const, effect: 'rps' as const, sessionId: 'a', data: {
      opponentSessionId: 'b', firstChoice: 'scissors', secondChoice: 'paper', firstOutcome: 'win', secondOutcome: 'lose' } };
    state.receive(round, 1200);
    const first = state.effects.get('a')!, second = state.effects.get('b')!;
    state.receive(round, 1400);
    expect(state.effects.get('a')).toBe(first);
    expect(first.startedAt).toBe(second.startedAt);
    for (const time of [1300, 1900, 2500]) expect(rpsPhase(first, time)).toBe(rpsPhase(second, time));
    expect(rpsPhase(first, 3000)).toBe('scissors'); expect(rpsPhase(second, 3000)).toBe('paper');
    expect(rpsPhase(first, 3600)).toBe('win'); expect(rpsPhase(second, 3600)).toBe('lose');
    state.prune(5100); expect(state.effects.size).toBe(0);
  });

  it('restores reserved graves from snapshots, revives returning sessions, and respects expiration while asleep', () => {
    const state = new FactoryEffectsState(), world = snapshot([]);
    const grave = { sessionId: 'a', username: 'Ada', avatar: { ...DEFAULT_AVATAR, hairStyle: 7 },
      position: { x: 1120, y: 382 }, slotIndex: 17, createdAt: 900, expiresAt: 10000 };
    world.tombstones = [grave]; state.sync(world);
    expect(state.tombstones.get('a')?.slotIndex).toBe(17);
    expect(state.tombstones.get('a')?.avatar.hairStyle).toBe(7);
    state.sync({ ...world, revision: 2, serverTime: 2000, agents: [agent('a')], tombstones: [] });
    expect(state.tombstones.size).toBe(0); expect(state.effects.get('a')?.kind).toBe('return');
    state.receive({ type: 'effect', sessionId: 'a', effect: 'session_start' }, 2000);
    expect(state.effects.get('a')?.kind).toBe('return');
    state.sync({ ...world, revision: 3, serverTime: 11000 });
    expect(state.tombstones.size).toBe(0); expect(state.effects.size).toBe(0);
  });

  it('uses the server RPS start time despite delivery latency and ignores an already finished round', () => {
    const first = new FactoryEffectsState(), delayed = new FactoryEffectsState(); first.sync(snapshot()); delayed.sync(snapshot());
    const event = { type: 'effect' as const, effect: 'rps' as const, sessionId: 'a', data: {
      startedAt: 1000, opponentSessionId: 'b', firstChoice: 'rock', secondChoice: 'scissors', firstOutcome: 'win', secondOutcome: 'lose' } };
    first.receive(event, 1050); delayed.receive(event, 2100);
    expect(rpsPhase(first.effects.get('a')!, 2400)).toBe(rpsPhase(delayed.effects.get('a')!, 2400));
    expect(delayed.effects.get('a')?.startedAt).toBe(1000);
    delayed.clear(); delayed.sync(snapshot()); delayed.receive(event, 6000); expect(delayed.effects.size).toBe(0);
  });

  it('resumes a vortex at its shared phase and finishes on time without a live removal frame', () => {
    const world = snapshot(); world.events = [{ id: 'storm', effect: 'vortex', seed: 21, startedAt: 1000, expiresAt: 16000 }];
    const original = new FactoryEffectsState(), reconnect = new FactoryEffectsState();
    original.sync(world); reconnect.sync({ ...world, serverTime: 8500 });
    expect(vortexStrength(original.vortex!, 8500)).toBe(vortexStrength(reconnect.vortex!, 8500));
    reconnect.receive({ type: 'global_effect', effect: 'vortex' }, 8500);
    expect(reconnect.vortex?.startedAt).toBe(1000);
    expect(vortexStrength(reconnect.vortex!, 15999)).toBeLessThan(.001);
    reconnect.prune(16000); expect(reconnect.vortex).toBeUndefined();
  });

  it('keeps all emotes finite, restores each pose, and removes movement under reduced motion', () => {
    const state = new FactoryEffectsState(); state.sync(snapshot());
    for (const emote of ['dance', 'jump', 'guitar', 'gun', 'laugh', 'wave', 'sleep', 'explode', 'dizzy', 'flex', 'rage', 'fart']) {
      state.receive({ type: 'effect', sessionId: 'a', effect: 'emote', data: { emote } }, 1000);
      const effect = state.effects.get('a')!; expect(effect.kind).toBe(emote);
      for (const progress of [0, .2, .5, .8, 1]) {
        const now = 1000 + progress * effect.duration, pose = effectPose(effect, now);
        expect(Object.values(pose).every(Number.isFinite)).toBe(true);
        expect(pose.scaleX).toBeGreaterThan(0); expect(pose.scaleY).toBeGreaterThan(0);
        expect(effectPose(effect, now, true)).toEqual(neutral);
      }
      expect(effectPose(effect, 1000 + effect.duration)).toEqual(neutral);
    }
    state.prune(10000); expect(state.effects.size).toBe(0); expect(state.shots.length).toBe(0);
  });

  it('bounds repeated projectile effects and cleans all state after sessions disappear', () => {
    const state = new FactoryEffectsState(); state.sync(snapshot());
    for (let i = 0; i < 100; i++) state.receive({ type: 'effect', sessionId: 'a', effect: 'shoot', data: { targetSessionIds: ['b'] } }, 1000 + i);
    expect(state.shots.length).toBe(24); expect(state.effects.size).toBe(2);
    state.sync(snapshot([])); expect(state.shots.length).toBe(0); expect(state.effects.size).toBe(0);
  });

  it('keeps the neighboring dizzy reaction near the farting agent using shared world positions', () => {
    const state = new FactoryEffectsState(), world = snapshot();
    world.agents[1].world.position.x += 90; world.agents[2].world.position.x += 160;
    state.sync(world); state.receive({ type: 'effect', sessionId: 'a', effect: 'emote', data: { emote: 'fart' } }, 1000);
    expect(state.effects.get('a')?.kind).toBe('fart'); expect(state.effects.get('b')?.kind).toBe('dizzy');
    expect(state.effects.get('b')?.startedAt).toBe(1500); expect(state.effects.has('c')).toBe(false);
  });

  it('removes expired scene decorations and disposes instanced celebrations without orphaning objects', () => {
    vi.stubGlobal('document', { createElement: () => ({ width: 1, height: 1, getContext: () => ({ fillStyle: '', fillRect() {} }) }) });
    const factory = new THREE.Scene(), patio = new THREE.Scene(), renderer = createFactoryEffects(factory, patio);
    const state = new FactoryEffectsState(); state.sync(snapshot());
    state.receive({ type: 'effect', sessionId: 'a', effect: 'pr_merge' }, 1000);
    renderer.update(state, 1700, new Map([['a', { x: 15, y: 0, z: 4 }]]), 'factory25d');
    expect(factory.children.length).toBe(0); expect(patio.children.length).toBe(1);
    let instanceDisposed = false;
    patio.traverse(object => { if (object instanceof THREE.InstancedMesh) object.addEventListener('dispose', () => { instanceDisposed = true; }); });
    renderer.update(state, 5000, new Map(), 'factory25d');
    expect(patio.children.length).toBe(0); expect(instanceDisposed).toBe(true);
    renderer.dispose(); expect(factory.children.length + patio.children.length).toBe(0);
  });
});
