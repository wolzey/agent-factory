/**
 * Procedural 8-bit / chiptune sound library for Agent Factory.
 * Every sound is synthesized at runtime via the Web Audio API — no static files.
 */

import type { EmoteType, AgentActivity, EffectType } from '@shared/types';

// ── helpers ──────────────────────────────────────────────────────────

type SoundFn = (ctx: AudioContext, dest: AudioNode) => void;

function createNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function createBrownNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    data[i] = (last + 0.02 * white) / 1.02;
    last = data[i];
  }
  return buf;
}

/** Play a single tone and auto-disconnect. */
function tone(
  ctx: AudioContext, dest: AudioNode,
  type: OscillatorType, freq: number, start: number, dur: number, vol = 0.25,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(vol, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
  osc.connect(gain).connect(dest);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

/** Play a noise burst through an optional filter. */
function noiseBurst(
  ctx: AudioContext, dest: AudioNode,
  start: number, dur: number, vol = 0.2,
  filterFreq?: number, filterType?: BiquadFilterType,
) {
  const src = ctx.createBufferSource();
  src.buffer = createNoiseBuffer(ctx, dur + 0.1);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

  if (filterFreq && filterType) {
    const filt = ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.setValueAtTime(filterFreq, start);
    src.connect(filt).connect(gain).connect(dest);
  } else {
    src.connect(gain).connect(dest);
  }
  src.start(start);
  src.stop(start + dur + 0.05);
}

// ── EMOTE SOUNDS ─────────────────────────────────────────────────────

const emote_dance: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Arpeggiated chiptune groove: C5-E5-G5-C6 repeated twice
  const notes = [523, 659, 784, 1047, 523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    tone(ctx, dest, 'square', freq, t + i * 0.2, 0.18, 0.15);
  });
};

const emote_jump: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Rising sweep
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(800, t + 0.3);
  gain.gain.setValueAtTime(0.25, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + 0.4);

  // Boing on landing
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(600, t + 0.4);
  osc2.frequency.exponentialRampToValueAtTime(200, t + 0.8);
  gain2.gain.setValueAtTime(0.2, t + 0.4);
  gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
  osc2.connect(gain2).connect(dest);
  osc2.start(t + 0.4);
  osc2.stop(t + 0.9);
};

const emote_guitar: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Pentatonic riff with sawtooth + tremolo
  const notes = [330, 392, 440, 494, 587]; // E4-G4-A4-B4-D5
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const trem = ctx.createOscillator();
    const tremGain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t + i * 0.35);

    // Tremolo via gain modulation
    trem.type = 'sine';
    trem.frequency.setValueAtTime(12, t + i * 0.35);
    tremGain.gain.setValueAtTime(0.08, t + i * 0.35);
    trem.connect(tremGain).connect(gain.gain);

    gain.gain.setValueAtTime(0.12, t + i * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.35 + 0.32);

    osc.connect(gain).connect(dest);
    osc.start(t + i * 0.35);
    osc.stop(t + i * 0.35 + 0.35);
    trem.start(t + i * 0.35);
    trem.stop(t + i * 0.35 + 0.35);
  });
};

const emote_gun: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Two shots
  for (let s = 0; s < 2; s++) {
    const offset = t + s * 0.3;
    // Noise burst (crack)
    noiseBurst(ctx, dest, offset, 0.05, 0.3, 3000, 'highpass');
    // Low thump
    tone(ctx, dest, 'square', 80, offset, 0.08, 0.2);
  }
};

const emote_laugh: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Bouncy alternating tones
  for (let i = 0; i < 7; i++) {
    const freq = i % 2 === 0 ? 400 : 500;
    tone(ctx, dest, 'square', freq, t + i * 0.12, 0.1, 0.15);
  }
};

const emote_wave: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, t);
  osc.frequency.linearRampToValueAtTime(600, t + 0.35);
  osc.frequency.linearRampToValueAtTime(300, t + 0.7);
  gain.gain.setValueAtTime(0.2, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + 0.8);
};

const emote_sleep: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, t);

  // Slow breathing amplitude
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(0.8, t);
  lfoGain.gain.setValueAtTime(0.06, t);
  lfo.connect(lfoGain).connect(gain.gain);

  gain.gain.setValueAtTime(0.08, t);
  gain.gain.setValueAtTime(0.08, t + 1.0);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + 1.3);
  lfo.start(t);
  lfo.stop(t + 1.3);
};

const emote_explode: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Noise burst with descending bandpass
  const src = ctx.createBufferSource();
  src.buffer = createNoiseBuffer(ctx, 0.8);
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.setValueAtTime(4000, t);
  filt.frequency.exponentialRampToValueAtTime(100, t + 0.5);
  filt.Q.setValueAtTime(2, t);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.35, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  src.connect(filt).connect(gain).connect(dest);
  src.start(t);
  src.stop(t + 0.7);

  // Low rumble
  tone(ctx, dest, 'square', 60, t, 0.4, 0.2);
};

const emote_dizzy: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(400, t);

  // Wobble via frequency modulation
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(3, t);
  lfoGain.gain.setValueAtTime(100, t); // ±100Hz wobble
  lfo.connect(lfoGain).connect(osc.frequency);

  gain.gain.setValueAtTime(0.15, t);
  gain.gain.setValueAtTime(0.15, t + 1.2);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);

  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + 1.6);
  lfo.start(t);
  lfo.stop(t + 1.6);
};

const emote_flex: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Ascending power chord
  const notes = [100, 150, 200];
  notes.forEach((freq, i) => {
    tone(ctx, dest, 'square', freq, t + i * 0.18, 0.16, 0.18);
  });
  // Triumphant high note
  tone(ctx, dest, 'square', 400, t + 0.56, 0.2, 0.22);
};

const emote_rage: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Distorted low growl with increasing intensity
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const dist = ctx.createWaveShaperFunction
    ? ctx.createWaveShaper() : null;

  osc.type = 'square';
  osc.frequency.setValueAtTime(80, t);

  // Jittery pitch via rapid scheduling
  for (let i = 0; i < 16; i++) {
    const jitter = 80 + (Math.random() * 40 - 20);
    osc.frequency.setValueAtTime(jitter, t + i * 0.1);
  }

  gain.gain.setValueAtTime(0.08, t);
  gain.gain.linearRampToValueAtTime(0.25, t + 1.2);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 1.6);

  if (dist) {
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = (Math.PI + 200) * x / (Math.PI + 200 * Math.abs(x));
    }
    dist.curve = curve;
    osc.connect(dist).connect(gain).connect(dest);
  } else {
    osc.connect(gain).connect(dest);
  }

  osc.start(t);
  osc.stop(t + 1.65);

  // Stomp at the end
  noiseBurst(ctx, dest, t + 1.4, 0.1, 0.2, 200, 'lowpass');
};

const emote_fart: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = createBrownNoiseBuffer(ctx, 0.5);
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(100, t);
  filt.frequency.exponentialRampToValueAtTime(60, t + 0.3);
  filt.Q.setValueAtTime(5, t);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  src.connect(filt).connect(gain).connect(dest);
  src.start(t);
  src.stop(t + 0.45);
};

export const EMOTE_SOUNDS: Record<EmoteType, SoundFn> = {
  dance: emote_dance,
  jump: emote_jump,
  guitar: emote_guitar,
  gun: emote_gun,
  laugh: emote_laugh,
  wave: emote_wave,
  sleep: emote_sleep,
  explode: emote_explode,
  dizzy: emote_dizzy,
  flex: emote_flex,
  rage: emote_rage,
  fart: emote_fart,
};

// ── STATE TRANSITION SOUNDS ──────────────────────────────────────────

const state_waiting: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Two-tone alert
  tone(ctx, dest, 'square', 800, t, 0.1, 0.18);
  tone(ctx, dest, 'square', 600, t + 0.12, 0.15, 0.18);
};

const state_planning: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Clipboard click: short noise pop + crisp sine
  noiseBurst(ctx, dest, t, 0.02, 0.15);
  tone(ctx, dest, 'sine', 1200, t + 0.02, 0.08, 0.15);
};

const state_thinking: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, t);
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.linearRampToValueAtTime(0.1, t + 0.2);
  gain.gain.setValueAtTime(0.1, t + 0.45);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + 0.75);
};

const state_reading: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Page turn: bandpass noise sweep
  const src = ctx.createBufferSource();
  src.buffer = createNoiseBuffer(ctx, 0.15);
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.setValueAtTime(2000, t);
  filt.frequency.exponentialRampToValueAtTime(500, t + 0.1);
  filt.Q.setValueAtTime(3, t);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  src.connect(filt).connect(gain).connect(dest);
  src.start(t);
  src.stop(t + 0.15);
};

const state_writing: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Keyboard click
  noiseBurst(ctx, dest, t, 0.03, 0.12, 4000, 'highpass');
};

const state_running: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  tone(ctx, dest, 'triangle', 150, t, 0.08, 0.15);
};

const state_searching: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Radar ping arpeggio
  tone(ctx, dest, 'sine', 400, t, 0.06, 0.12);
  tone(ctx, dest, 'sine', 600, t + 0.06, 0.06, 0.12);
  tone(ctx, dest, 'sine', 800, t + 0.12, 0.08, 0.12);
};

const state_chatting: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Double blip
  tone(ctx, dest, 'sine', 600, t, 0.04, 0.12);
  tone(ctx, dest, 'sine', 800, t + 0.04, 0.04, 0.12);
};

const state_compacting: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Compression whoosh
  const src = ctx.createBufferSource();
  src.buffer = createNoiseBuffer(ctx, 0.4);
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.setValueAtTime(3000, t);
  filt.frequency.exponentialRampToValueAtTime(200, t + 0.25);
  filt.Q.setValueAtTime(4, t);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.15, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  src.connect(filt).connect(gain).connect(dest);
  src.start(t);
  src.stop(t + 0.35);
};

const state_stopped: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Descending finality tone
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(400, t);
  osc.frequency.exponentialRampToValueAtTime(100, t + 0.45);
  gain.gain.setValueAtTime(0.18, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + 0.55);
};

const state_idle: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Gentle chime
  tone(ctx, dest, 'sine', 800, t, 0.15, 0.12);
};

export const STATE_SOUNDS: Partial<Record<AgentActivity, SoundFn>> = {
  waiting: state_waiting,
  planning: state_planning,
  thinking: state_thinking,
  reading: state_reading,
  writing: state_writing,
  running: state_running,
  searching: state_searching,
  chatting: state_chatting,
  compacting: state_compacting,
  stopped: state_stopped,
  idle: state_idle,
};

// ── EFFECT SOUNDS ────────────────────────────────────────────────────

const effect_tool_start: SoundFn = (ctx, dest) => {
  tone(ctx, dest, 'triangle', 1000, ctx.currentTime, 0.04, 0.1);
};

const effect_tool_complete: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  tone(ctx, dest, 'sine', 800, t, 0.06, 0.12);
  tone(ctx, dest, 'sine', 1200, t + 0.06, 0.08, 0.12);
};

const effect_error: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Buzz: rapid on/off
  for (let i = 0; i < 3; i++) {
    tone(ctx, dest, 'square', 200, t + i * 0.06, 0.03, 0.15);
  }
};

const effect_session_start: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Ascending jingle
  const notes = [523, 659, 784, 1047]; // C5-E5-G5-C6
  notes.forEach((freq, i) => {
    tone(ctx, dest, 'triangle', freq, t + i * 0.1, 0.1, 0.15);
  });
};

const effect_session_end: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Descending jingle
  const notes = [1047, 784, 659, 523]; // C6-G5-E5-C5
  notes.forEach((freq, i) => {
    tone(ctx, dest, 'triangle', freq, t + i * 0.1, 0.1, 0.15);
  });
};

const effect_subagent_spawn: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(1200, t + 0.1);
  gain.gain.setValueAtTime(0.15, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + 0.15);
};

const effect_subagent_despawn: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1200, t);
  osc.frequency.exponentialRampToValueAtTime(200, t + 0.1);
  gain.gain.setValueAtTime(0.15, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + 0.15);
};

const effect_task_completed: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Victory fanfare
  tone(ctx, dest, 'triangle', 523, t, 0.14, 0.18);       // C5
  tone(ctx, dest, 'triangle', 659, t + 0.15, 0.14, 0.18); // E5
  tone(ctx, dest, 'triangle', 784, t + 0.3, 0.2, 0.2);    // G5
};

const effect_notification: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Soft bell
  tone(ctx, dest, 'sine', 1200, t, 0.2, 0.12);
};

const effect_prompt_received: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Harmony chime
  tone(ctx, dest, 'sine', 1000, t, 0.1, 0.1);
  tone(ctx, dest, 'sine', 1500, t, 0.1, 0.1);
};

const effect_compact: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = createNoiseBuffer(ctx, 0.25);
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.setValueAtTime(2000, t);
  filt.frequency.exponentialRampToValueAtTime(300, t + 0.2);
  filt.Q.setValueAtTime(3, t);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.1, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  src.connect(filt).connect(gain).connect(dest);
  src.start(t);
  src.stop(t + 0.25);
};

const effect_elicitation: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  tone(ctx, dest, 'sine', 600, t, 0.05, 0.1);
  tone(ctx, dest, 'sine', 900, t + 0.06, 0.06, 0.1);
};

export const EFFECT_SOUNDS: Partial<Record<EffectType, SoundFn>> = {
  tool_start: effect_tool_start,
  tool_complete: effect_tool_complete,
  error: effect_error,
  session_start: effect_session_start,
  session_end: effect_session_end,
  subagent_spawn: effect_subagent_spawn,
  subagent_despawn: effect_subagent_despawn,
  task_completed: effect_task_completed,
  notification: effect_notification,
  prompt_received: effect_prompt_received,
  compact: effect_compact,
  elicitation: effect_elicitation,
};

// ── SPECIAL SOUNDS ───────────────────────────────────────────────────

export const deathStandard: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Descending tone
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(500, t);
  osc.frequency.exponentialRampToValueAtTime(80, t + 0.4);
  gain.gain.setValueAtTime(0.2, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + 0.55);

  // Thud
  noiseBurst(ctx, dest, t + 0.35, 0.08, 0.15, 150, 'lowpass');
};

export const deathGraphic: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Dramatic slash
  noiseBurst(ctx, dest, t, 0.06, 0.3, 3000, 'highpass');
  // Wet impact
  const src = ctx.createBufferSource();
  src.buffer = createBrownNoiseBuffer(ctx, 0.3);
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(300, t + 0.08);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.2, t + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  src.connect(filt).connect(gain).connect(dest);
  src.start(t + 0.08);
  src.stop(t + 0.4);

  // Descending groan
  const osc = ctx.createOscillator();
  const g2 = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(300, t + 0.1);
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.6);
  g2.gain.setValueAtTime(0.12, t + 0.1);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
  osc.connect(g2).connect(dest);
  osc.start(t + 0.1);
  osc.stop(t + 0.7);
};

export const zombieRise: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Eerie ascending groan
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();

  osc.type = 'square';
  osc.frequency.setValueAtTime(60, t);
  osc.frequency.exponentialRampToValueAtTime(200, t + 0.8);

  // Vibrato
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(5, t);
  lfoGain.gain.setValueAtTime(15, t);
  lfo.connect(lfoGain).connect(osc.frequency);

  gain.gain.setValueAtTime(0.001, t);
  gain.gain.linearRampToValueAtTime(0.15, t + 0.3);
  gain.gain.setValueAtTime(0.15, t + 0.6);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);

  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + 1.0);
  lfo.start(t);
  lfo.stop(t + 1.0);
};

export const gunDeathVictim: SoundFn = (ctx, dest) => {
  const t = ctx.currentTime;
  // Quick descending yelp
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, t);
  osc.frequency.exponentialRampToValueAtTime(150, t + 0.25);
  gain.gain.setValueAtTime(0.18, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + 0.35);
};
