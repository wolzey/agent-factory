/**
 * SoundBank - Pre-rendered 8-bit sound effects via jsfxr.
 *
 * All sounds are rendered once at boot into AudioBuffers.
 * play() is fire-and-forget: returns void, takes no callbacks,
 * stores no agent references, and never touches agent state.
 */

// @ts-expect-error jsfxr has no type declarations
import { sfxr } from 'jsfxr';

const STORAGE_VOLUME = 'af_volume';
const STORAGE_MUTED = 'af_muted';
const MAX_CONCURRENT = 8;
const STATE_DEBOUNCE_MS = 500;

// ── Hand-tuned jsfxr presets ────────────────────────────────────────
// Design/audition at https://sfxr.me — paste JSON here.
// wave_type: 0=square, 1=sawtooth, 2=sine, 3=noise

const PRESETS: Record<string, Record<string, unknown>> = {
  // ── State transitions ─────────────────────────────────────────────

  // Short crisp click (keyboard / generic work activity)
  state_working: {
    oldParams: true, wave_type: 3,
    p_env_attack: 0, p_env_sustain: 0.012, p_env_punch: 0, p_env_decay: 0.038,
    p_base_freq: 0.65, p_freq_ramp: 0, p_freq_dramp: 0,
    p_vib_strength: 0, p_vib_speed: 0,
    p_arp_mod: 0, p_arp_speed: 0,
    p_duty: 0, p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0, p_pha_ramp: 0,
    p_lpf_freq: 1, p_lpf_ramp: 0, p_lpf_resonance: 0,
    p_hpf_freq: 0.45, p_hpf_ramp: 0,
    sound_vol: 0.15, sample_rate: 44100, sample_size: 8,
  },

  // Ascending 3-note alert jingle (replaces Web Speech "Help!")
  state_waiting: {
    oldParams: true, wave_type: 0,
    p_env_attack: 0, p_env_sustain: 0.17, p_env_punch: 0.35, p_env_decay: 0.18,
    p_base_freq: 0.28, p_freq_ramp: 0.12, p_freq_dramp: 0,
    p_vib_strength: 0, p_vib_speed: 0,
    p_arp_mod: 0.42, p_arp_speed: 0.52,
    p_duty: 0.48, p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0, p_pha_ramp: 0,
    p_lpf_freq: 1, p_lpf_ramp: 0, p_lpf_resonance: 0,
    p_hpf_freq: 0, p_hpf_ramp: 0,
    sound_vol: 0.2, sample_rate: 44100, sample_size: 8,
  },

  // Soft blip (between tool calls)
  state_thinking: {
    oldParams: true, wave_type: 2,
    p_env_attack: 0, p_env_sustain: 0.06, p_env_punch: 0, p_env_decay: 0.12,
    p_base_freq: 0.42, p_freq_ramp: 0.02, p_freq_dramp: 0,
    p_vib_strength: 0, p_vib_speed: 0,
    p_arp_mod: 0, p_arp_speed: 0,
    p_duty: 0, p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0, p_pha_ramp: 0,
    p_lpf_freq: 1, p_lpf_ramp: 0, p_lpf_resonance: 0,
    p_hpf_freq: 0, p_hpf_ramp: 0,
    sound_vol: 0.1, sample_rate: 44100, sample_size: 8,
  },

  // Gentle high chime (resting)
  state_idle: {
    oldParams: true, wave_type: 2,
    p_env_attack: 0.01, p_env_sustain: 0.08, p_env_punch: 0, p_env_decay: 0.25,
    p_base_freq: 0.55, p_freq_ramp: 0, p_freq_dramp: 0,
    p_vib_strength: 0.12, p_vib_speed: 0.35,
    p_arp_mod: 0, p_arp_speed: 0,
    p_duty: 0, p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0, p_pha_ramp: 0,
    p_lpf_freq: 0.8, p_lpf_ramp: 0, p_lpf_resonance: 0.2,
    p_hpf_freq: 0, p_hpf_ramp: 0,
    sound_vol: 0.1, sample_rate: 44100, sample_size: 8,
  },

  // Descending two-note finality (session stopping)
  state_stopped: {
    oldParams: true, wave_type: 0,
    p_env_attack: 0, p_env_sustain: 0.12, p_env_punch: 0, p_env_decay: 0.2,
    p_base_freq: 0.35, p_freq_ramp: -0.18, p_freq_dramp: 0,
    p_vib_strength: 0, p_vib_speed: 0,
    p_arp_mod: -0.3, p_arp_speed: 0.5,
    p_duty: 0.5, p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0, p_pha_ramp: 0,
    p_lpf_freq: 1, p_lpf_ramp: 0, p_lpf_resonance: 0,
    p_hpf_freq: 0, p_hpf_ramp: 0,
    sound_vol: 0.18, sample_rate: 44100, sample_size: 8,
  },

  // ── Effect sounds ─────────────────────────────────────────────────

  // Ascending 4-note jingle (new session)
  effect_session_start: {
    oldParams: true, wave_type: 1,
    p_env_attack: 0, p_env_sustain: 0.15, p_env_punch: 0.4, p_env_decay: 0.22,
    p_base_freq: 0.3, p_freq_ramp: 0.18, p_freq_dramp: 0,
    p_vib_strength: 0, p_vib_speed: 0,
    p_arp_mod: 0.35, p_arp_speed: 0.45,
    p_duty: 1, p_duty_ramp: 0,
    p_repeat_speed: 0.42,
    p_pha_offset: 0, p_pha_ramp: 0,
    p_lpf_freq: 1, p_lpf_ramp: 0, p_lpf_resonance: 0,
    p_hpf_freq: 0, p_hpf_ramp: 0,
    sound_vol: 0.2, sample_rate: 44100, sample_size: 8,
  },

  // Descending jingle (session end)
  effect_session_end: {
    oldParams: true, wave_type: 1,
    p_env_attack: 0, p_env_sustain: 0.14, p_env_punch: 0.2, p_env_decay: 0.3,
    p_base_freq: 0.45, p_freq_ramp: -0.15, p_freq_dramp: 0,
    p_vib_strength: 0, p_vib_speed: 0,
    p_arp_mod: -0.3, p_arp_speed: 0.5,
    p_duty: 1, p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0, p_pha_ramp: 0,
    p_lpf_freq: 0.9, p_lpf_ramp: -0.1, p_lpf_resonance: 0,
    p_hpf_freq: 0, p_hpf_ramp: 0,
    sound_vol: 0.18, sample_rate: 44100, sample_size: 8,
  },

  // Low warning buzz (error)
  effect_error: {
    oldParams: true, wave_type: 1,
    p_env_attack: 0, p_env_sustain: 0.15, p_env_punch: 0.5, p_env_decay: 0.1,
    p_base_freq: 0.12, p_freq_ramp: 0, p_freq_dramp: 0,
    p_vib_strength: 0.35, p_vib_speed: 0.55,
    p_arp_mod: 0, p_arp_speed: 0,
    p_duty: 1, p_duty_ramp: 0,
    p_repeat_speed: 0.4,
    p_pha_offset: 0, p_pha_ramp: 0,
    p_lpf_freq: 0.6, p_lpf_ramp: 0, p_lpf_resonance: 0.3,
    p_hpf_freq: 0, p_hpf_ramp: 0,
    sound_vol: 0.18, sample_rate: 44100, sample_size: 8,
  },

  // Two-tone success ping (tool done)
  effect_tool_complete: {
    oldParams: true, wave_type: 2,
    p_env_attack: 0, p_env_sustain: 0.05, p_env_punch: 0.2, p_env_decay: 0.15,
    p_base_freq: 0.5, p_freq_ramp: 0, p_freq_dramp: 0,
    p_vib_strength: 0, p_vib_speed: 0,
    p_arp_mod: 0.25, p_arp_speed: 0.6,
    p_duty: 0, p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0, p_pha_ramp: 0,
    p_lpf_freq: 1, p_lpf_ramp: 0, p_lpf_resonance: 0,
    p_hpf_freq: 0, p_hpf_ramp: 0,
    sound_vol: 0.12, sample_rate: 44100, sample_size: 8,
  },

  // Triumphant ascending fanfare (task done)
  effect_task_completed: {
    oldParams: true, wave_type: 0,
    p_env_attack: 0, p_env_sustain: 0.2, p_env_punch: 0.5, p_env_decay: 0.25,
    p_base_freq: 0.32, p_freq_ramp: 0.15, p_freq_dramp: 0,
    p_vib_strength: 0, p_vib_speed: 0,
    p_arp_mod: 0.38, p_arp_speed: 0.4,
    p_duty: 0.45, p_duty_ramp: 0,
    p_repeat_speed: 0.38,
    p_pha_offset: 0, p_pha_ramp: 0,
    p_lpf_freq: 1, p_lpf_ramp: 0, p_lpf_resonance: 0,
    p_hpf_freq: 0, p_hpf_ramp: 0,
    sound_vol: 0.22, sample_rate: 44100, sample_size: 8,
  },

  // Soft bell (notification)
  effect_notification: {
    oldParams: true, wave_type: 2,
    p_env_attack: 0, p_env_sustain: 0.06, p_env_punch: 0, p_env_decay: 0.3,
    p_base_freq: 0.58, p_freq_ramp: 0, p_freq_dramp: 0,
    p_vib_strength: 0.08, p_vib_speed: 0.25,
    p_arp_mod: 0, p_arp_speed: 0,
    p_duty: 0, p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0, p_pha_ramp: 0,
    p_lpf_freq: 0.7, p_lpf_ramp: 0, p_lpf_resonance: 0.15,
    p_hpf_freq: 0, p_hpf_ramp: 0,
    sound_vol: 0.12, sample_rate: 44100, sample_size: 8,
  },

  // ── Emote sounds ──────────────────────────────────────────────────

  // Gunshot crack
  emote_gun: {
    oldParams: true, wave_type: 3,
    p_env_attack: 0, p_env_sustain: 0.06, p_env_punch: 0.7, p_env_decay: 0.15,
    p_base_freq: 0.15, p_freq_ramp: -0.3, p_freq_dramp: 0,
    p_vib_strength: 0, p_vib_speed: 0,
    p_arp_mod: 0, p_arp_speed: 0,
    p_duty: 0, p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0, p_pha_ramp: 0,
    p_lpf_freq: 0.5, p_lpf_ramp: -0.2, p_lpf_resonance: 0.3,
    p_hpf_freq: 0.1, p_hpf_ramp: 0,
    sound_vol: 0.25, sample_rate: 44100, sample_size: 8,
  },

  // Explosion burst
  emote_explode: {
    oldParams: true, wave_type: 3,
    p_env_attack: 0, p_env_sustain: 0.2, p_env_punch: 0.6, p_env_decay: 0.35,
    p_base_freq: 0.12, p_freq_ramp: -0.08, p_freq_dramp: 0,
    p_vib_strength: 0, p_vib_speed: 0,
    p_arp_mod: 0, p_arp_speed: 0,
    p_duty: 0, p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: -0.15, p_pha_ramp: -0.08,
    p_lpf_freq: 0.45, p_lpf_ramp: -0.12, p_lpf_resonance: 0.2,
    p_hpf_freq: 0, p_hpf_ramp: 0,
    sound_vol: 0.25, sample_rate: 44100, sample_size: 8,
  },

  // Arpeggiated dance groove
  emote_dance: {
    oldParams: true, wave_type: 0,
    p_env_attack: 0, p_env_sustain: 0.08, p_env_punch: 0.3, p_env_decay: 0.12,
    p_base_freq: 0.35, p_freq_ramp: 0, p_freq_dramp: 0,
    p_vib_strength: 0, p_vib_speed: 0,
    p_arp_mod: 0.5, p_arp_speed: 0.35,
    p_duty: 0.4, p_duty_ramp: 0.05,
    p_repeat_speed: 0.3,
    p_pha_offset: 0, p_pha_ramp: 0,
    p_lpf_freq: 1, p_lpf_ramp: 0, p_lpf_resonance: 0,
    p_hpf_freq: 0, p_hpf_ramp: 0,
    sound_vol: 0.18, sample_rate: 44100, sample_size: 8,
  },

  // Brown noise fart
  emote_fart: {
    oldParams: true, wave_type: 3,
    p_env_attack: 0, p_env_sustain: 0.18, p_env_punch: 0.3, p_env_decay: 0.2,
    p_base_freq: 0.06, p_freq_ramp: 0.03, p_freq_dramp: 0,
    p_vib_strength: 0.5, p_vib_speed: 0.3,
    p_arp_mod: 0, p_arp_speed: 0,
    p_duty: 0, p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0, p_pha_ramp: 0,
    p_lpf_freq: 0.2, p_lpf_ramp: 0.05, p_lpf_resonance: 0.5,
    p_hpf_freq: 0, p_hpf_ramp: 0,
    sound_vol: 0.2, sample_rate: 44100, sample_size: 8,
  },

  // Bouncy ha-ha laugh
  emote_laugh: {
    oldParams: true, wave_type: 0,
    p_env_attack: 0, p_env_sustain: 0.06, p_env_punch: 0.4, p_env_decay: 0.08,
    p_base_freq: 0.38, p_freq_ramp: 0, p_freq_dramp: 0,
    p_vib_strength: 0.45, p_vib_speed: 0.65,
    p_arp_mod: 0.2, p_arp_speed: 0.3,
    p_duty: 0.5, p_duty_ramp: 0,
    p_repeat_speed: 0.25,
    p_pha_offset: 0, p_pha_ramp: 0,
    p_lpf_freq: 1, p_lpf_ramp: 0, p_lpf_resonance: 0,
    p_hpf_freq: 0, p_hpf_ramp: 0,
    sound_vol: 0.15, sample_rate: 44100, sample_size: 8,
  },

  // ── Special sounds ────────────────────────────────────────────────

  // Standard death: descending tone + thud
  death_standard: {
    oldParams: true, wave_type: 2,
    p_env_attack: 0, p_env_sustain: 0.15, p_env_punch: 0.3, p_env_decay: 0.3,
    p_base_freq: 0.35, p_freq_ramp: -0.25, p_freq_dramp: 0,
    p_vib_strength: 0, p_vib_speed: 0,
    p_arp_mod: 0, p_arp_speed: 0,
    p_duty: 0, p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0, p_pha_ramp: 0,
    p_lpf_freq: 0.7, p_lpf_ramp: -0.15, p_lpf_resonance: 0.2,
    p_hpf_freq: 0, p_hpf_ramp: 0,
    sound_vol: 0.22, sample_rate: 44100, sample_size: 8,
  },

  // Graphic death: harsh slash + wet impact
  death_graphic: {
    oldParams: true, wave_type: 3,
    p_env_attack: 0, p_env_sustain: 0.08, p_env_punch: 0.8, p_env_decay: 0.25,
    p_base_freq: 0.25, p_freq_ramp: -0.4, p_freq_dramp: 0,
    p_vib_strength: 0, p_vib_speed: 0,
    p_arp_mod: -0.4, p_arp_speed: 0.35,
    p_duty: 0, p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: -0.2, p_pha_ramp: -0.15,
    p_lpf_freq: 0.5, p_lpf_ramp: -0.2, p_lpf_resonance: 0.4,
    p_hpf_freq: 0, p_hpf_ramp: 0,
    sound_vol: 0.25, sample_rate: 44100, sample_size: 8,
  },

  // Zombie rise: eerie ascending groan with vibrato
  zombie_rise: {
    oldParams: true, wave_type: 1,
    p_env_attack: 0.1, p_env_sustain: 0.3, p_env_punch: 0, p_env_decay: 0.35,
    p_base_freq: 0.08, p_freq_ramp: 0.2, p_freq_dramp: 0,
    p_vib_strength: 0.5, p_vib_speed: 0.25,
    p_arp_mod: 0, p_arp_speed: 0,
    p_duty: 1, p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0.1, p_pha_ramp: 0.08,
    p_lpf_freq: 0.4, p_lpf_ramp: 0.15, p_lpf_resonance: 0.5,
    p_hpf_freq: 0, p_hpf_ramp: 0,
    sound_vol: 0.22, sample_rate: 44100, sample_size: 8,
  },

  // Gun victim yelp: fast descending
  gun_victim: {
    oldParams: true, wave_type: 0,
    p_env_attack: 0, p_env_sustain: 0.06, p_env_punch: 0.5, p_env_decay: 0.12,
    p_base_freq: 0.55, p_freq_ramp: -0.45, p_freq_dramp: 0,
    p_vib_strength: 0, p_vib_speed: 0,
    p_arp_mod: 0, p_arp_speed: 0,
    p_duty: 0.5, p_duty_ramp: 0,
    p_repeat_speed: 0,
    p_pha_offset: 0, p_pha_ramp: 0,
    p_lpf_freq: 1, p_lpf_ramp: 0, p_lpf_resonance: 0,
    p_hpf_freq: 0, p_hpf_ramp: 0,
    sound_vol: 0.2, sample_rate: 44100, sample_size: 8,
  },
};

export class SoundBank {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private volume: number;
  private muted: boolean;
  private activeCount = 0;
  private stateDebounce = new Map<string, number>();
  private ready = false;

  constructor() {
    this.volume = parseFloat(localStorage.getItem(STORAGE_VOLUME) ?? '0.3');
    this.muted = localStorage.getItem(STORAGE_MUTED) === 'true';
  }

  async initialize(): Promise<void> {
    try {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
      this.applyVolume();

      // Unlock AudioContext on first user gesture
      const unlock = () => {
        if (this.ctx?.state === 'suspended') {
          this.ctx.resume();
        }
        document.removeEventListener('click', unlock);
        document.removeEventListener('keydown', unlock);
      };
      document.addEventListener('click', unlock);
      document.addEventListener('keydown', unlock);

      // Pre-render all sounds into AudioBuffers
      for (const [key, params] of Object.entries(PRESETS)) {
        try {
          const source = sfxr.toWebAudio(params, this.ctx);
          if (source?.buffer) {
            this.buffers.set(key, source.buffer);
          }
        } catch {
          console.warn(`[SoundBank] Failed to render: ${key}`);
        }
      }

      this.ready = true;
    } catch (e) {
      console.warn('[SoundBank] Initialization failed:', e);
    }
  }

  /**
   * Fire-and-forget sound playback.
   * Returns void. No callbacks. No side effects on agent state.
   */
  play(key: string, sessionId?: string): void {
    if (!this.ready || this.muted || !this.ctx || !this.gain) return;
    if (this.activeCount >= MAX_CONCURRENT) return;

    // Per-agent debouncing for state sounds
    if (key.startsWith('state_') && sessionId) {
      const now = Date.now();
      const last = this.stateDebounce.get(sessionId) ?? 0;
      if (now - last < STATE_DEBOUNCE_MS) return;
      this.stateDebounce.set(sessionId, now);

      // Prune stale entries to prevent unbounded growth
      if (this.stateDebounce.size > 50) {
        for (const [id, ts] of this.stateDebounce) {
          if (now - ts > 60_000) this.stateDebounce.delete(id);
        }
      }
    }

    const buffer = this.buffers.get(key);
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);

    this.activeCount++;
    source.onended = () => {
      this.activeCount = Math.max(0, this.activeCount - 1);
      source.disconnect();
    };

    source.start(0);
  }

  // ── Volume / Mute ─────────────────────────────────────────────────

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    localStorage.setItem(STORAGE_VOLUME, String(this.volume));
    this.applyVolume();
  }

  getVolume(): number {
    return this.volume;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    localStorage.setItem(STORAGE_MUTED, String(m));
    this.applyVolume();
  }

  isMuted(): boolean {
    return this.muted;
  }

  private applyVolume(): void {
    if (!this.gain || !this.ctx) return;
    this.gain.gain.setValueAtTime(
      this.muted ? 0 : this.volume,
      this.ctx.currentTime,
    );
  }
}
