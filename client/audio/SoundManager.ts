/**
 * Singleton audio engine for Agent Factory.
 * Manages Web Audio API context, volume/mute, polyphony, debouncing,
 * and Web Speech API for the "help!" call at the help desk.
 */

import type { EmoteType, AgentActivity, EffectType } from '@shared/types';
import {
  EMOTE_SOUNDS,
  STATE_SOUNDS,
  EFFECT_SOUNDS,
  deathStandard,
  deathGraphic,
  zombieRise,
  gunDeathVictim,
} from './SoundLibrary';

const STORAGE_KEY_VOLUME = 'af_volume';
const STORAGE_KEY_MUTED = 'af_muted';
const MAX_POLYPHONY = 8;
const STATE_DEBOUNCE_MS = 500;
const HELP_COOLDOWN_MS = 10_000;
const HELP_PHRASES = ['Help!', 'Over here!', 'Hey!', 'Hellooo?'];

export class SoundManager {
  private static instance: SoundManager | null = null;

  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private initialized = false;
  private muted: boolean;
  private volume: number;
  private activeCount = 0;
  private stateDebounce = new Map<string, number>(); // sessionId → last timestamp
  private helpCooldown = new Map<string, number>();   // sessionId → last timestamp
  private activeSpeech = 0;

  private constructor() {
    this.volume = parseFloat(localStorage.getItem(STORAGE_KEY_VOLUME) ?? '0.3');
    this.muted = localStorage.getItem(STORAGE_KEY_MUTED) === 'true';
  }

  static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  /** Call on first user gesture (click / keydown) to unlock the AudioContext. */
  init() {
    if (this.initialized) return;
    this.audioCtx = new AudioContext();
    this.masterGain = this.audioCtx.createGain();
    this.sfxGain = this.audioCtx.createGain();
    this.sfxGain.connect(this.masterGain).connect(this.audioCtx.destination);
    this.applyVolume();
    this.initialized = true;

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  // ── volume / mute ──────────────────────────────────────────────────

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    localStorage.setItem(STORAGE_KEY_VOLUME, String(this.volume));
    this.applyVolume();
  }

  getVolume(): number {
    return this.volume;
  }

  setMuted(m: boolean) {
    this.muted = m;
    localStorage.setItem(STORAGE_KEY_MUTED, String(m));
    this.applyVolume();
  }

  isMuted(): boolean {
    return this.muted;
  }

  private applyVolume() {
    if (!this.masterGain) return;
    this.masterGain.gain.setValueAtTime(
      this.muted ? 0 : this.volume,
      this.audioCtx!.currentTime,
    );
  }

  // ── polyphony guard ────────────────────────────────────────────────

  private canPlay(): boolean {
    return this.initialized && this.activeCount < MAX_POLYPHONY;
  }

  private play(fn: (ctx: AudioContext, dest: AudioNode) => void) {
    if (!this.canPlay() || !this.audioCtx || !this.sfxGain) return;
    this.activeCount++;
    fn(this.audioCtx, this.sfxGain);
    // Auto-decrement after a generous timeout (most sounds < 2s)
    setTimeout(() => { this.activeCount = Math.max(0, this.activeCount - 1); }, 2500);
  }

  // ── public API ─────────────────────────────────────────────────────

  playEmoteSound(emote: EmoteType) {
    const fn = EMOTE_SOUNDS[emote];
    if (fn) this.play(fn);
  }

  playStateSound(activity: AgentActivity, sessionId: string) {
    // Debounce per agent
    const now = Date.now();
    const last = this.stateDebounce.get(sessionId) ?? 0;
    if (now - last < STATE_DEBOUNCE_MS) return;
    this.stateDebounce.set(sessionId, now);

    const fn = STATE_SOUNDS[activity];
    if (fn) this.play(fn);
  }

  playEffectSound(effect: EffectType) {
    const fn = EFFECT_SOUNDS[effect];
    if (fn) this.play(fn);
  }

  playDeathSound(graphic: boolean) {
    this.play(graphic ? deathGraphic : deathStandard);
  }

  playZombieRise() {
    this.play(zombieRise);
  }

  playGunDeathVictim() {
    this.play(gunDeathVictim);
  }

  /** Speak "Help!" (or variant) using Web Speech API. Rate-limited per agent. */
  speakHelp(sessionId: string) {
    if (this.muted || !this.initialized) return;

    // Cooldown per agent
    const now = Date.now();
    const last = this.helpCooldown.get(sessionId) ?? 0;
    if (now - last < HELP_COOLDOWN_MS) return;
    this.helpCooldown.set(sessionId, now);

    // Cap concurrent speech
    if (this.activeSpeech >= 2) return;

    if (typeof speechSynthesis === 'undefined') {
      // Fallback: simple beep-beep
      this.play((ctx, dest) => {
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, t);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.connect(gain).connect(dest);
        osc.start(t);
        osc.stop(t + 0.2);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(1000, t + 0.15);
        gain2.gain.setValueAtTime(0.15, t + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc2.connect(gain2).connect(dest);
        osc2.start(t + 0.15);
        osc2.stop(t + 0.35);
      });
      return;
    }

    const phrase = HELP_PHRASES[Math.floor(Math.random() * HELP_PHRASES.length)];
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.rate = 1.2;
    utterance.pitch = 1.3;
    utterance.volume = Math.min(1, this.volume * 2); // Speech API volume is 0-1

    this.activeSpeech++;
    utterance.onend = () => { this.activeSpeech = Math.max(0, this.activeSpeech - 1); };
    utterance.onerror = () => { this.activeSpeech = Math.max(0, this.activeSpeech - 1); };

    speechSynthesis.speak(utterance);
  }
}
