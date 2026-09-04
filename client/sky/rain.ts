/**
 * Per-frame rain for the skyline window, Phaser-free so it can be unit tested.
 *
 * Two independent simulations:
 *  - `BackRainSim` is the weather outside: nearby streaks composited in front of the
 *    landscape, slanted by the wind, and wrapped so there is never a visible reset.
 *  - `GlassRainSim` is the rain on the window itself: drops hit the glass with a
 *    small splat, bead for a moment, then run down under gravity leaving a wet
 *    trail that dries out over a couple of seconds.
 *
 * Both are stepped by the caller with a real `dt`, so they run at whatever frame rate
 * the scene has instead of the slow sky repaint cadence.
 */
import { clamp01, lerpRgb } from './skyPhase';
import type { Rgb, SkyPalette } from './skyPhase';
import { createSeededRandom } from './skylineData';
import type { PixelBuffer } from './skylinePainter';
import type { WeatherVisualState } from './weather';

const TAU = Math.PI * 2;
const MAX_STEP_S = 0.1;

/** Below this the sky is treated as dry: nothing spawns, existing rain runs out. */
export const RAIN_THRESHOLD = 0.02;
/** In front of the nearest 0.15 terrain pass, behind the 0.3 wet-glass pass. */
export const OUTSIDE_RAIN_DEPTH_OFFSET = 0.2;

// ── Glass: drops that hit and run ─────────────────────────────────

export interface GlassDrop {
  x: number;
  y: number;
  /** 1 to 3, in glass pixels. Bigger beads let go sooner and run faster. */
  size: number;
  vy: number;
  /** Seconds since impact. */
  age: number;
  /** Seconds the bead clings before it starts to run. */
  dwell: number;
  wobble: number;
}

export const MAX_GLASS_DROPS = 96;
/** Drops spawned per second per 100px of glass at full rain. */
const GLASS_SPAWN_PER_100PX = 3.8;
const GLASS_SPAWN_FLOOR = 0.5;
/** px/s^2: beads accelerate slowly down glass, well below free fall. */
export const GLASS_GRAVITY = 40;
/** Seconds for a trail to fade to about a third. */
export const GLASS_TRAIL_DECAY_S = 1.8;
/** Seconds the impact splat is drawn for. */
export const GLASS_SPLAT_S = 0.09;

export class GlassRainSim {
  readonly drops: GlassDrop[] = [];
  /** Wetness left behind by running drops, one float per glass pixel. */
  readonly wet: Float32Array;
  private spawnCarry = 0;
  private readonly random: () => number;

  constructor(readonly width: number, readonly height: number, seed = 0x5a1c) {
    this.wet = new Float32Array(width * height);
    this.random = createSeededRandom(seed + 41);
  }

  /** True when there is nothing left to draw. */
  get isDry(): boolean {
    if (this.drops.length > 0) return false;
    for (let i = 0; i < this.wet.length; i++) if (this.wet[i] > 0) return false;
    return true;
  }

  step(dtSeconds: number, weather: WeatherVisualState): void {
    const dt = Math.min(Math.max(dtSeconds, 0), MAX_STEP_S);
    if (dt <= 0) return;

    const decay = Math.exp(-dt / GLASS_TRAIL_DECAY_S);
    for (let i = 0; i < this.wet.length; i++) {
      const value = this.wet[i] * decay;
      this.wet[i] = value < 0.02 ? 0 : value;
    }

    const rain = weather.rain01 > RAIN_THRESHOLD ? clamp01(weather.rain01) : 0;
    if (rain > 0) {
      const rate = (this.width / 100) * (GLASS_SPAWN_FLOOR + rain * GLASS_SPAWN_PER_100PX);
      this.spawnCarry += rate * dt;
      while (this.spawnCarry >= 1 && this.drops.length < MAX_GLASS_DROPS) {
        this.spawnCarry -= 1;
        this.spawn();
      }
      if (this.drops.length >= MAX_GLASS_DROPS) this.spawnCarry = 0;
    } else {
      this.spawnCarry = 0;
    }

    const wind = (weather.wind01 - 0.15) * 6; // px/s sideways push on running beads
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      drop.age += dt;
      if (drop.age < drop.dwell) continue;

      const prevX = drop.x;
      const prevY = drop.y;
      drop.vy = Math.min(drop.vy + GLASS_GRAVITY * (0.55 + drop.size * 0.3) * dt, 34 + drop.size * 15);
      drop.y += drop.vy * dt;
      drop.x += (Math.sin(drop.age * 7 + drop.wobble) * 5 + wind) * dt;
      this.markTrail(prevX, prevY, drop.x, drop.y, drop.size);

      if (drop.y > this.height + 2 || drop.x < -2 || drop.x > this.width + 2) {
        this.drops.splice(i, 1);
      }
    }
  }

  private spawn(): void {
    const roll = this.random();
    const size = roll < 0.58 ? 1 : roll < 0.9 ? 2 : 3;
    this.drops.push({
      x: this.random() * this.width,
      y: this.random() * this.height * 0.92,
      size,
      vy: 0,
      age: 0,
      dwell: (0.35 + this.random() * 1.5) / (0.6 + size * 0.4),
      wobble: this.random() * TAU,
    });
  }

  /** Lay wetness along the segment a running drop just covered so trails have no gaps. */
  private markTrail(x0: number, y0: number, x1: number, y1: number, size: number): void {
    const steps = Math.max(1, Math.ceil(Math.abs(y1 - y0)));
    const strength = size >= 3 ? 1 : size === 2 ? 0.8 : 0.55;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t);
      this.mark(x, y, strength);
      if (size >= 3) this.mark(x + 1, y, strength * 0.6);
    }
  }

  private mark(x: number, y: number, value: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = y * this.width + x;
    if (this.wet[i] < value) this.wet[i] = value;
  }
}

/** Paint the glass rain into a transparent RGBA buffer. */
export function paintGlassRain(pixels: PixelBuffer, sim: GlassRainSim, palette: SkyPalette): void {
  const daylight = 1 - palette.stars;
  const trail = lerpRgb(palette.skyHorizon, [206, 226, 246], 0.5 + daylight * 0.2);
  const body = lerpRgb(palette.skyHorizon, [222, 238, 252], 0.72);
  const highlight: Rgb = [240, 248, 255];
  const shade = lerpRgb(palette.skyTop, body, 0.3);

  const { width, height, wet } = sim;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const w = wet[y * width + x];
      if (w > 0) pixels.set(x, y, trail, Math.round(w * 96));
    }
  }

  for (const drop of sim.drops) {
    const cx = Math.round(drop.x);
    const cy = Math.round(drop.y);
    if (drop.age < GLASS_SPLAT_S) {
      // Impact: a brief cross of spray around the landing point.
      pixels.set(cx, cy, highlight, 200);
      pixels.set(cx - 1, cy, body, 120);
      pixels.set(cx + 1, cy, body, 120);
      pixels.set(cx, cy - 1, body, 120);
      pixels.set(cx, cy + 1, body, 120);
      continue;
    }
    if (drop.size === 1) {
      pixels.set(cx, cy, body, 210);
      continue;
    }
    if (drop.size === 2) {
      pixels.set(cx, cy, body, 225);
      pixels.set(cx + 1, cy, body, 225);
      pixels.set(cx, cy + 1, shade, 205);
      pixels.set(cx + 1, cy + 1, shade, 205);
      pixels.set(cx, cy, highlight, 235);
      continue;
    }
    // Size 3: a fat bead with a bright cap and a shaded belly.
    pixels.set(cx, cy - 1, body, 215);
    pixels.set(cx - 1, cy, body, 230);
    pixels.set(cx, cy, body, 230);
    pixels.set(cx + 1, cy, body, 230);
    pixels.set(cx - 1, cy + 1, shade, 215);
    pixels.set(cx, cy + 1, shade, 215);
    pixels.set(cx + 1, cy + 1, shade, 215);
    pixels.set(cx, cy - 1, highlight, 240);
    pixels.set(cx - 1, cy, highlight, 200);
  }
}

// ── In front of the landscape: falling streaks ────────────────────

export interface BackStreak {
  x: number;
  y: number;
  length: number;
  /** px/s */
  speed: number;
}

/** Streaks per pixel of width at full rain, plus a floor once any rain is falling. */
const BACK_DENSITY_PER_PX = 0.16;
const BACK_DENSITY_FLOOR = 0.02;
/** Horizontal drift in px/s at full wind. */
const BACK_WIND_PX_S = 72;

export class BackRainSim {
  readonly streaks: BackStreak[] = [];
  private readonly random: () => number;

  constructor(readonly width: number, readonly height: number, seed = 0x5a1c) {
    this.random = createSeededRandom(seed + 43);
  }

  /** Pixels of horizontal lean per pixel of fall for the current wind. */
  slant(weather: WeatherVisualState): number {
    return weather.wind01 * 0.55;
  }

  step(dtSeconds: number, weather: WeatherVisualState): void {
    const dt = Math.min(Math.max(dtSeconds, 0), MAX_STEP_S);
    const rain = weather.rain01 > RAIN_THRESHOLD ? clamp01(weather.rain01) : 0;
    const target = rain > 0 ? Math.round(this.width * (BACK_DENSITY_FLOOR + rain * BACK_DENSITY_PER_PX)) : 0;

    while (this.streaks.length < target) this.streaks.push(this.spawn(true));
    if (this.streaks.length > target) this.streaks.length = target;
    if (dt <= 0) return;

    const windX = weather.wind01 * BACK_WIND_PX_S;
    const tempo = 0.62 + rain * 0.28;
    for (const streak of this.streaks) {
      streak.y += streak.speed * tempo * dt;
      streak.x += windX * dt;
      if (streak.x >= this.width) streak.x -= this.width;
      if (streak.y - streak.length > this.height) {
        const fresh = this.spawn(false);
        streak.x = fresh.x;
        streak.y = fresh.y;
        streak.length = fresh.length;
        streak.speed = fresh.speed;
      }
    }
  }

  private spawn(anywhere: boolean): BackStreak {
    const length = 3 + Math.floor(this.random() * 4);
    return {
      x: this.random() * this.width,
      y: anywhere ? this.random() * this.height : -length - this.random() * 6,
      length,
      speed: 95 + this.random() * 55,
    };
  }
}

/** Paint the background streaks into a transparent RGBA buffer. */
export function paintBackRain(
  pixels: PixelBuffer,
  sim: BackRainSim,
  palette: SkyPalette,
  weather: WeatherVisualState,
): void {
  if (sim.streaks.length === 0) return;
  const rain = clamp01(weather.rain01);
  const color = lerpRgb(palette.skyHorizon, [204, 224, 244], 0.5);
  const alpha = Math.round(70 + rain * 90);
  const slant = sim.slant(weather);
  for (const streak of sim.streaks) {
    // The head is the lowest point; the tail trails up and against the wind.
    for (let k = 0; k < streak.length; k++) {
      const x = Math.round(streak.x - slant * k);
      const y = Math.round(streak.y - k);
      const fade = 1 - k / streak.length;
      pixels.set(x, y, color, Math.round(alpha * (0.45 + 0.55 * fade)));
    }
  }
}
