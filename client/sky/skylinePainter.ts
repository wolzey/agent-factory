/**
 * Phaser-free pixel compositor for the skyline window. Everything here works on a
 * plain RGBA byte buffer so the same code can be unit tested and rendered headlessly.
 */
import { clamp01, lerp, lerpRgb } from './skyPhase';
import type { Rgb, SkyPalette, SkyState } from './skyPhase';
import { CLEAR_WEATHER, weatheredSkyState } from './weather';
import type { WeatherVisualState } from './weather';
import { DEFAULT_SKYLINE_BOUNDS, createSeededRandom, isQuietBuilding, resolveSkyline, signKind } from './skylineData';
import type { SignFont, SignKind, SkylineBounds, SkylineBuilding, SkylineDataSource, SkylineSign } from './skylineData';

export const DEFAULT_SEED = 0x5a1c;
/** The glass height every size-dependent metric is tuned against. */
const REFERENCE_HEIGHT = 36;
const VALLEY_CENTER = 0.54;
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

/** Size-dependent drawing metrics, derived from the glass height so the art scales with the window. */
export interface SkylineMetrics {
  farRidgeMax: number;
  midRidgeMax: number;
  nearRidgeMax: number;
  sunRadius: number;
  moonRadius: number;
  starCount: number;
  cloudBandHeight: number;
  /** Pixel size of one cloud "row" block. */
  cloudUnit: number;
  /** Pixel size of one city window cell. */
  windowCell: number;
  buildings: SkylineBounds;
}

export function metricsFor(height: number): SkylineMetrics {
  const scale = Math.max(1, height / REFERENCE_HEIGHT);
  const widthScale = Math.pow(scale, 0.6);
  return {
    farRidgeMax: Math.max(8, Math.round(11 * scale)),
    midRidgeMax: Math.max(12, Math.round(20 * scale)),
    nearRidgeMax: Math.max(5, Math.round(7 * scale)),
    sunRadius: Math.max(3, Math.round(3 * scale)),
    moonRadius: Math.max(2, Math.round(2 * scale)),
    starCount: Math.round(64 * scale * 0.8),
    cloudBandHeight: Math.max(14, Math.round(16 * scale)),
    cloudUnit: Math.max(1, Math.round(scale * 0.9)),
    windowCell: scale >= 2 ? 2 : 1,
    buildings: {
      minWidth: Math.round(DEFAULT_SKYLINE_BOUNDS.minWidth * widthScale),
      maxWidth: Math.round(DEFAULT_SKYLINE_BOUNDS.maxWidth * widthScale),
      minHeight: Math.round(DEFAULT_SKYLINE_BOUNDS.minHeight * scale),
      maxHeight: Math.round(DEFAULT_SKYLINE_BOUNDS.maxHeight * scale),
      gap: scale >= 2 ? 2 : 1,
    },
  };
}

export interface Star {
  x: number;
  y: number;
  brightness: number;
}

export interface Cloud {
  x: number;
  y: number;
  width: number;
  /** Pixel size of one cloud row block. */
  unit: number;
}

export interface Ridge {
  heights: Uint8Array;
  /** Per-column offset of the snow line, in pixels. */
  snowNoise: Float32Array;
  /** Per-column extra snow depth for couloirs and drifts. */
  snowFingers: Uint8Array;
}

export interface SkylineGeometry {
  width: number;
  height: number;
  metrics: SkylineMetrics;
  /** Row where the far ridge meets the valley. */
  horizonRow: number;
  /** Row where the near ridge meets the valley. */
  nearBaseRow: number;
  /** Row where the middle ridge meets the valley. */
  midBaseRow: number;
  farRidge: Ridge;
  midRidge: Ridge;
  nearRidge: Ridge;
  stars: Star[];
  clouds: Cloud[];
  buildings: SkylineBuilding[];
  buildingSource: 'custom' | 'default';
}

function softenRidge(ridge: Ridge, passes = 2): Ridge {
  let current = Float32Array.from(ridge.heights);
  for (let pass = 0; pass < passes; pass++) {
    const next = new Float32Array(current.length);
    for (let x = 0; x < current.length; x++) {
      const a = current[Math.max(0, x - 2)];
      const b = current[Math.max(0, x - 1)];
      const c = current[x];
      const d = current[Math.min(current.length - 1, x + 1)];
      const e = current[Math.min(current.length - 1, x + 2)];
      next[x] = (a + 2 * b + 4 * c + 2 * d + e) / 10;
    }
    current = next;
  }
  return {
    ...ridge,
    heights: Uint8Array.from(current, height => Math.round(height)),
  };
}

export function createSkylineGeometry(
  width: number,
  height: number,
  seed: number = DEFAULT_SEED,
  source?: SkylineDataSource | null,
): SkylineGeometry {
  const metrics = metricsFor(height);
  const horizonRow = Math.round(height * 0.72);
  const midBaseRow = Math.round(height * 0.79);
  const nearBaseRow = Math.round(height * 0.88);
  const resolved = resolveSkyline(width, source, seed, metrics.buildings);
  const farRidge = buildProfileRidge(width, seed + 1, metrics.farRidgeMax, [
    [0, 0.4], [0.06, 0.72], [0.12, 0.45], [0.2, 0.66],
    [0.28, 0.38], [0.37, 0.76], [0.45, 0.42], [0.54, 0.64],
    [0.62, 0.36], [0.7, 0.72], [0.78, 0.4], [0.86, 0.68],
    [0.94, 0.44], [1, 0.62],
  ]);
  const midRidge = buildProfileRidge(width, seed + 5, metrics.midRidgeMax, [
    [0, 0.34], [0.07, 0.7], [0.13, 0.48], [0.22, 0.34],
    [0.29, 0.68], [0.35, 0.48], [0.41, 0.88], [0.47, 0.62],
    [0.54, 0.28], [0.62, 0.78], [0.68, 0.52], [0.75, 0.32],
    [0.82, 0.7], [0.88, 0.5], [0.92, 0.82], [1, 0.42],
  ]);
  const nearRidge = buildProfileRidge(width, seed + 2, metrics.nearRidgeMax, [
    [0, 0.52], [0.08, 0.68], [0.18, 0.46], [0.29, 0.62],
    [0.4, 0.44], [0.52, 0.58], [0.64, 0.4], [0.75, 0.64],
    [0.87, 0.45], [1, 0.6],
  ]);
  return {
    width,
    height,
    metrics,
    horizonRow,
    midBaseRow,
    nearBaseRow,
    farRidge,
    midRidge,
    nearRidge,
    stars: buildStars(width, horizonRow - 4, seed + 3, metrics.starCount),
    clouds: buildClouds(width, seed + 4, metrics),
    buildings: resolved.buildings,
    buildingSource: resolved.source,
  };
}

// ── Pixel buffer ──────────────────────────────────────────────────

export class PixelBuffer {
  readonly data: Uint8ClampedArray;

  constructor(readonly width: number, readonly height: number) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  private index(x: number, y: number): number {
    return (y * this.width + x) * 4;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): [number, number, number, number] {
    const i = this.index(x, y);
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  set(x: number, y: number, rgb: Rgb, alpha = 255): void {
    if (!this.inBounds(x, y)) return;
    const i = this.index(x, y);
    this.data[i] = rgb[0];
    this.data[i + 1] = rgb[1];
    this.data[i + 2] = rgb[2];
    this.data[i + 3] = alpha;
  }

  /** Alpha-blend `rgb` over the existing opaque pixel. */
  blend(x: number, y: number, rgb: Rgb, alpha: number): void {
    if (!this.inBounds(x, y) || alpha <= 0) return;
    const i = this.index(x, y);
    const a = Math.min(1, alpha);
    this.data[i] = Math.round(lerp(this.data[i], rgb[0], a));
    this.data[i + 1] = Math.round(lerp(this.data[i + 1], rgb[1], a));
    this.data[i + 2] = Math.round(lerp(this.data[i + 2], rgb[2], a));
    this.data[i + 3] = 255;
  }

  disc(cx: number, cy: number, radius: number, rgb: Rgb, alpha: number): void {
    if (radius < 0) return;
    const r2 = radius * radius + 0.5;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= r2) this.blend(cx + dx, cy + dy, rgb, alpha);
      }
    }
  }

  fillRect(x: number, y: number, w: number, h: number, rgb: Rgb, alpha = 255): void {
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) this.set(px, py, rgb, alpha);
    }
  }
}

// ── Palette helpers ───────────────────────────────────────────────

/** The far ridge sits in atmospheric haze, pulled toward the horizon colour. */
export function farRidgeFill(palette: SkyPalette): Rgb {
  return lerpRgb(palette.farRidge, palette.skyHorizon, 0.1);
}

/** The valley floor behind the city: near-ridge colour sinking into the foreground. */
export function valleyFloor(palette: SkyPalette): Rgb {
  return lerpRgb(palette.nearRidge, [0, 0, 0], 0.22);
}

function ditheredLerp(a: Rgb, b: Rgb, amount: number, x: number, y: number, steps: number): Rgb {
  const scaled = clamp01(amount) * (steps - 1);
  const lower = Math.floor(scaled);
  const mix = scaled - lower;
  const ordered = (BAYER_4X4[y & 3][x & 3] + 0.5) / 16;
  const hash = hash01(x, y, 0x7a11);
  const threshold = ordered * 0.42 + hash * 0.58;
  const level = (lower + (mix > threshold ? 1 : 0)) / (steps - 1);
  return lerpRgb(a, b, level);
}

function hash01(x: number, y: number, seed: number): number {
  let value = Math.imul(x + seed, 374761393) ^ Math.imul(y - seed, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

/** Snow on lit faces and snow in shadow. */
export function snowColors(palette: SkyPalette): { lit: Rgb; shade: Rgb } {
  return { lit: palette.snow, shade: lerpRgb(palette.snow, farRidgeFill(palette), 0.4) };
}

// ── Glass ─────────────────────────────────────────────────────────

export function sunX(geometry: SkylineGeometry, state: SkyState): number {
  return Math.round(10 + state.sunProgress * (geometry.width - 20));
}

export function sunY(geometry: SkylineGeometry, state: SkyState): number {
  return Math.round(geometry.horizonRow + 1 - state.sunAltitude01 * (geometry.horizonRow - 3));
}

interface Lighting {
  fromLeft: boolean;
  strength: number;
}

function lightingFor(state: SkyState): Lighting {
  const daylight = 1 - state.palette.stars;
  const fromLeft = state.sunVisible ? state.sunProgress < 0.5 : state.moonProgress < 0.5;
  return { fromLeft, strength: 0.35 + 0.65 * daylight };
}

/** Paint the full glass (sky, sun or moon, ridges, city, glass sheen) into `pixels`. */
export function paintSkyline(
  pixels: PixelBuffer,
  geometry: SkylineGeometry,
  state: SkyState,
  panes: number,
  showCity = true,
  weather: WeatherVisualState = CLEAR_WEATHER,
  motionPhase = 0,
  showTerrain = true,
): void {
  const visualState = weatheredSkyState(state, weather);
  const p = visualState.palette;
  const light = lightingFor(visualState);
  paintSky(pixels, geometry, visualState, weather);
  paintStars(pixels, geometry, visualState);
  if (visualState.moonVisible) paintMoon(pixels, geometry, visualState);
  if (visualState.sunVisible) paintSun(pixels, geometry, visualState, weather);
  if (showTerrain) {
    const snow = snowColors(p);
    paintRidge(pixels, geometry, geometry.farRidge, geometry.horizonRow, {
      fill: farRidgeFill(p),
      rim: p.farRim,
      snow: null,
      light,
      outline: null,
      valley: lerpRgb(farRidgeFill(p), p.nearRidge, 0.6),
    });
    const midFill = lerpRgb(p.farRidge, p.nearRidge, 0.5);
    paintRidge(pixels, geometry, geometry.midRidge, geometry.midBaseRow, {
      fill: midFill,
      rim: lerpRgb(p.farRim, p.nearRidge, 0.32),
      snow: { lit: snow.lit, shade: snow.shade, cover: clamp01((state.snow01 - 0.2) / 0.8) },
      light,
      outline: lerpRgb(midFill, [0, 0, 0], 0.18),
      valley: lerpRgb(midFill, p.nearRidge, 0.58),
    });
    paintRidge(pixels, geometry, geometry.nearRidge, geometry.nearBaseRow, {
      fill: p.nearRidge,
      rim: lerpRgb(p.nearRidge, p.farRim, 0.45),
      snow: null,
      light,
      outline: lerpRgb(p.nearRidge, [0, 0, 0], 0.4),
      valley: valleyFloor(p),
    });
    paintValleyBasin(pixels, geometry, visualState);
    if (showCity) paintCity(pixels, geometry, visualState);
  }
  paintAtmosphere(pixels, geometry, visualState, weather, motionPhase);
  paintGlass(pixels, geometry, panes);
}

/**
 * Static wet-glass glints on the transparent glass layer. Moving rain (drops running down
 * the glass and near-field streaks in front of the landscape) lives in `rain.ts`.
 */
export function paintWindowWeather(
  pixels: PixelBuffer,
  geometry: SkylineGeometry,
  state: SkyState,
  weather: WeatherVisualState,
  motionPhase: number,
): void {
  const { width, height } = geometry;

  if (weather.snow01 > 0.02) {
    const haze = lerpRgb(state.palette.skyHorizon, [198, 212, 226], 0.58);
    const hazeTop = Math.max(0, geometry.horizonRow - Math.round(height * 0.34));
    const hazeSpan = Math.max(1, height - hazeTop);
    for (let y = hazeTop; y < height; y++) {
      const depth = (y - hazeTop) / hazeSpan;
      const alpha = Math.round((10 + depth * 32) * weather.snow01);
      for (let x = 0; x < width; x++) {
        if ((x + y) % 2 === 0) pixels.set(x, y, haze, alpha);
      }
    }
  }

  if (weather.wet01 > 0.08) {
    const glint = lerpRgb(state.palette.sunGlow, [220, 244, 255], 0.45);
    const count = Math.round(4 + weather.wet01 * 12);
    for (let i = 0; i < count; i++) {
      const x = (i * 139 + 31) % width;
      const y = (i * 61 + 23) % height;
      const pulse = 0.45 + 0.55 * Math.sin(motionPhase * Math.PI * 2 + i);
      pixels.set(x, y, glint, Math.round(weather.wet01 * pulse * 115));
    }
  }

  if (weather.snow01 > 0.02) {
    const intensity = Math.pow(weather.snow01, 1.35);
    const count = Math.round(width * (0.02 + intensity * 0.12));
    const flake = lerpRgb(state.palette.skyHorizon, [240, 246, 252], 0.82);
    for (let i = 0; i < count; i++) {
      const baseX = (i * 71 + (i % 4) * 13) % width;
      const baseY = (i * 43 + (i % 5) * 7) % height;
      const y = Math.floor((baseY + motionPhase * height) % height);
      const sway = Math.sin((motionPhase + i * 0.173) * Math.PI * 2);
      const x = Math.round(baseX + sway * (1.5 + weather.wind01 * 3));
      const alpha = Math.round((0.48 + weather.snow01 * 0.38) * 255);
      pixels.set(x, y, flake, alpha);
      if (i % 5 === 0) pixels.set(x + 1, y, flake, Math.round(alpha * 0.62));
      if (i % 8 === 0) pixels.set(x, y + 1, flake, Math.round(alpha * 0.5));
    }
  }
}

function paintSky(pixels: PixelBuffer, geometry: SkylineGeometry, state: SkyState, weather: WeatherVisualState): void {
  const { width, height, horizonRow } = geometry;
  const p = state.palette;
  const sx = sunX(geometry, state);
  // The glow is a banded halo centred on the sun, squashed vertically so it hugs the horizon.
  const sy = sunY(geometry, state);
  const glowRadius = width * 0.16;
  for (let y = 0; y < height; y++) {
    const t = Math.min(1, y / horizonRow);
    const steps = weather.rain01 > 0.2 || weather.cloud01 > 0.6 ? 6 : 9;
    const base = ditheredLerp(p.skyTop, p.skyHorizon, t, 0, y, steps);
    for (let x = 0; x < width; x++) {
      let color = ditheredLerp(p.skyTop, p.skyHorizon, t, x, y, steps);
      if (p.sunGlowStrength > 0) {
        const dx = x - sx;
        const dy = (y - sy) * 1.6;
        const falloff = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / glowRadius);
        const glow = p.sunGlowStrength * falloff * falloff;
        if (glow > 0) color = ditheredLerp(base, p.sunGlow, glow * 0.7, x + 1, y + 2, steps);
      }
      pixels.set(x, y, color);
      const atmosphericGrain = 0.34 + weather.cloud01 * 0.18 + weather.rain01 * 0.28;
      if (hash01(x, y, 0x51e5) < atmosphericGrain * (0.3 + t * 0.56)) {
        pixels.blend(x, y, y % 3 === 0 ? p.skyTop : p.skyHorizon, 0.07 + atmosphericGrain * 0.05);
      }
    }
  }
}

function paintAtmosphere(
  pixels: PixelBuffer,
  geometry: SkylineGeometry,
  state: SkyState,
  weather: WeatherVisualState,
  motionPhase: number,
): void {
  const { width, height, horizonRow } = geometry;
  const distantHaze = Math.max(weather.fog01, weather.snow01 * 0.52);
  if (distantHaze > 0.02) {
    const fog = lerpRgb(state.palette.skyHorizon, [205, 214, 224], 0.38);
    const band = Math.max(8, Math.round(height * 0.3));
    for (let y = Math.max(0, horizonRow - band); y < height; y++) {
      const distance = Math.abs(y - horizonRow) / band;
        const alpha = distantHaze * Math.max(0, 1 - distance) * 0.34;
      for (let x = 0; x < width; x++) {
        if ((x + y) % 2 === 0) pixels.blend(x, y, fog, alpha);
      }
    }
  }

  // Falling rain is drawn by the per-frame near-weather layer (see rain.ts), not baked into the sky.

  if (weather.wet01 > 0.05 && weather.rain01 < 0.18) {
    const daylight = 1 - state.palette.stars;
    const pulse = 0.5 + 0.5 * Math.sin(motionPhase * Math.PI * 2);
    const glint: Rgb = lerpRgb(state.palette.sunGlow, [220, 246, 255], 0.52);
    const count = Math.round(5 + weather.wet01 * 18);
    for (let i = 0; i < count; i++) {
      const x = (i * 137 + 29) % width;
      const y = Math.round(horizonRow + ((i * 47) % Math.max(1, height - horizonRow)));
      const twinkle = ((i * 13) % 7) / 6;
      const alpha = weather.wet01 * daylight * (0.12 + 0.42 * Math.max(0, pulse - twinkle * 0.5));
      pixels.blend(x, y, glint, alpha);
      if (i % 4 === 0) pixels.blend(x + 1, y, glint, alpha * 0.55);
    }
  }
}

function paintValleyBasin(pixels: PixelBuffer, geometry: SkylineGeometry, state: SkyState): void {
  const { width, height, horizonRow } = geometry;
  const top = horizonRow + 2;
  const span = Math.max(1, height - top);
  const center = Math.round(width * VALLEY_CENTER);
  const distant = lerpRgb(farRidgeFill(state.palette), state.palette.skyHorizon, 0.16);
  const foreground = valleyFloor(state.palette);

  for (let y = top; y < height; y++) {
    const depth = (y - top) / span;
    const halfWidth = Math.round(2 + depth * width * 0.24);
    for (let x = center - halfWidth; x <= center + halfWidth; x++) {
      const edge = Math.abs(x - center) / Math.max(1, halfWidth);
      const base = ditheredLerp(distant, foreground, 0.2 + depth * 0.8, x, y, 8);
      const color = edge > 0.82
        ? lerpRgb(base, state.palette.nearRidge, (edge - 0.82) / 0.18 * 0.45)
        : base;
      pixels.set(x, y, color);
    }

  }
}

function paintStars(pixels: PixelBuffer, geometry: SkylineGeometry, state: SkyState): void {
  const intensity = state.palette.stars;
  if (intensity <= 0) return;
  for (const star of geometry.stars) {
    const alpha = intensity * star.brightness;
    if (alpha > 0.05) pixels.blend(star.x, star.y, [255, 255, 255], alpha);
  }
}

function paintSun(
  pixels: PixelBuffer,
  geometry: SkylineGeometry,
  state: SkyState,
  weather: WeatherVisualState,
): void {
  const p = state.palette;
  const cx = sunX(geometry, state);
  const cy = sunY(geometry, state);
  const radius = geometry.metrics.sunRadius;
  const halo = Math.max(2, Math.round(radius * 0.7));
  const visibility = clamp01(1 - weather.cloud01 * 0.82 - weather.rain01 * 0.18 - weather.fog01 * 0.42);
  pixels.disc(cx, cy, radius + halo, p.sunGlow, visibility * 0.35 * Math.max(0.3, p.sunGlowStrength));
  pixels.disc(cx, cy, radius, p.sun, visibility);
  pixels.disc(
    cx,
    cy,
    Math.max(0, radius - Math.max(2, Math.round(radius * 0.4))),
    lerpRgb(p.sun, [255, 255, 255], 0.5),
    visibility,
  );
}

function paintMoon(pixels: PixelBuffer, geometry: SkylineGeometry, state: SkyState): void {
  const { width, horizonRow } = geometry;
  const fade = clamp01((2 - state.elevationDeg) / 6);
  if (fade <= 0) return;
  const arc = Math.sin(Math.PI * state.moonProgress);
  const cx = Math.round(10 + state.moonProgress * (width - 20));
  const cy = Math.round(horizonRow - 2 - arc * (horizonRow - 6));
  const moon: Rgb = [222, 226, 240];
  const radius = geometry.metrics.moonRadius;
  pixels.disc(cx, cy, radius + 1, [120, 130, 170], 0.25 * fade);
  pixels.disc(cx, cy, radius, moon, fade);
  // Shadowed crescent bite on the trailing side.
  const bite = Math.max(1, Math.round(radius * 0.7));
  pixels.disc(cx - Math.ceil(radius * 0.5), cy - Math.ceil(radius * 0.4), bite, state.palette.skyTop, 0.85 * fade);
}

interface RidgeStyle {
  fill: Rgb;
  rim: Rgb;
  snow: { lit: Rgb; shade: Rgb; cover: number } | null;
  light: Lighting;
  outline: Rgb | null;
  /** Colour the landmass settles into as it drops behind the city toward the sill. */
  valley: Rgb;
}

/**
 * Paint one mountain ridge. Faces that look toward the light get a rim highlight and a
 * dithered lit band, faces turned away fall into shadow, and the far ridge carries a
 * ragged, seasonally driven snow line with drifts running down the couloirs. Below its
 * base line every ridge keeps filling solid landmass down to the sill, so the range never
 * reads as a cutout floating over sky, whatever the city in front leaves uncovered.
 */
function paintRidge(pixels: PixelBuffer, geometry: SkylineGeometry, ridge: Ridge, baseRow: number, style: RidgeStyle): void {
  const { width, height } = geometry;
  const { heights, snowNoise, snowFingers } = ridge;
  const { fill, rim, light } = style;
  const litFace = lerpRgb(fill, rim, 0.55 * light.strength);
  const litDither = lerpRgb(fill, rim, 0.3 * light.strength);
  const shadeFace = lerpRgb(fill, [0, 0, 0], 0.28 + 0.12 * light.strength);
  const shadeDither = lerpRgb(fill, [0, 0, 0], 0.15);
  const maxHeight = Math.max(1, ...Array.from(heights));
  const snowLineBase = style.snow ? maxHeight * (1.02 - 0.76 * style.snow.cover) : Infinity;

  const valleySpan = Math.max(1, height - baseRow);
  for (let x = 0; x < width; x++) {
    const h = heights[x];
    // Solid landmass from the base line to the bottom of the glass, darkening toward the valley.
    for (let y = baseRow + 1; y < height; y++) {
      const t = (y - baseRow) / valleySpan;
      const shade = lerpRgb(fill, style.valley, 0.35 + 0.65 * t);
      pixels.set(x, y, (x + y) % 2 === 0 && t < 0.5 ? lerpRgb(shade, fill, 0.35) : shade);
    }
    if (h <= 0) {
      pixels.set(x, baseRow, style.outline ?? fill);
      continue;
    }
    const left = heights[Math.max(0, x - 18)];
    const right = heights[Math.min(width - 1, x + 18)];
    const trend = right - left;
    const facingLight = clamp01(0.5 + (light.fromLeft ? trend : -trend) / Math.max(10, maxHeight * 0.42));
    const faceTone = lerpRgb(shadeFace, litFace, facingLight);
    const bodyTone = lerpRgb(shadeDither, litDither, 0.3 + facingLight * 0.5);
    const faceBand = Math.max(3, Math.round(h * 0.72));
    const top = baseRow - h;
    const snowLine = snowLineBase + snowNoise[x];
    const finger = snowFingers[x];

    for (let y = Math.max(0, top); y < Math.min(height, baseRow + 1); y++) {
      const depth = y - top;
      const heightHere = baseRow - y;
      let color: Rgb = fill;

      if (depth < faceBand) {
        const broadFace = facingLight >= 0.5 ? litFace : shadeFace;
        color = depth < 2 || hash01(x, y, 0x2f51) > 0.12 ? broadFace : bodyTone;
      } else if (hash01(x, y, 0x311d) < 0.24) {
        color = lerpRgb(fill, bodyTone, 0.52);
      }

      if (style.snow) {
        const onSnow =
          heightHere >= snowLine ||
          (heightHere >= snowLine - 1.5 && (x + y) % 2 === 0) ||
          (finger > 0 && heightHere >= snowLine - finger && (x + y) % 2 === 0) ||
          (finger > 2 && heightHere >= snowLine - finger * 0.6);
        if (onSnow) color = facingLight >= 0.5 ? style.snow.lit : style.snow.shade;
      }

      if (depth === 0 && style.outline) color = style.outline;
      pixels.set(x, y, color);
    }
  }
}

// ── City ──────────────────────────────────────────────────────────

/** Neutral neon accents for sign panels; chosen per building by seed. */
export const SIGN_ACCENTS: readonly Rgb[] = [
  [0, 230, 210],
  [255, 90, 210],
  [255, 190, 70],
  [110, 190, 255],
  [190, 150, 255],
  [120, 255, 170],
  [255, 120, 100],
];

/** Abstract 7x5 placeholder glyphs: geometry only, never letters or wordmarks. */
export const PLACEHOLDER_GLYPHS: readonly (readonly string[])[] = [
  ['#.#.#.#', '#.#.#.#', '#.#.#.#', '#.#.#.#', '#.#.#.#'],
  ['...#...', '..###..', '.#####.', '..###..', '...#...'],
  ['#.#.#.#', '.#.#.#.', '#.#.#.#', '.#.#.#.', '#.#.#.#'],
  ['#.....#', '.#...#.', '..#.#..', '...#...', '.......'],
  ['.#####.', '#.....#', '#.....#', '#.....#', '.#####.'],
  ['#..#..#', '.......', '#..#..#', '.......', '#..#..#'],
  ['#######', '.......', '#######', '.......', '#######'],
  ['##..##.', '##..##.', '.......', '..##..#', '..##..#'],
  ['...#...', '..##...', '.#####.', '..##...', '...#...'],
  ['##...##', '##...##', '...#...', '##...##', '##...##'],
];

const FONT_3X5: Record<string, readonly string[]> = {
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'],
  N: ['110', '101', '101', '101', '101'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '111', '011'],
  R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'],
  X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
  Z: ['111', '001', '010', '100', '111'],
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '011', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  ' ': ['000', '000', '000', '000', '000'],
  '.': ['000', '000', '000', '000', '010'],
  '-': ['000', '000', '111', '000', '000'],
  '&': ['010', '101', '010', '101', '011'],
};

/** Bolder 5x7 letters for anchor wordmarks that must read at a glance. */
const FONT_5X7: Record<string, readonly string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00100', '00100'],
};

export type Bitmap = boolean[][];

/** Render a label in a pixel font with a 1px gap between glyphs. */
export function textBitmap(label: string, font: SignFont = 'small'): Bitmap {
  const table = font === 'large' ? FONT_5X7 : FONT_3X5;
  const glyphHeight = font === 'large' ? 7 : 5;
  const rows: boolean[][] = Array.from({ length: glyphHeight }, () => []);
  const chars = Array.from(label.toUpperCase());
  chars.forEach((ch, i) => {
    const glyph = table[ch] ?? table[' '];
    for (let r = 0; r < glyphHeight; r++) {
      for (const c of glyph[r]) rows[r].push(c === '1');
      if (i < chars.length - 1) rows[r].push(false);
    }
  });
  return rows;
}

export function logoBitmap(rows: readonly string[]): Bitmap {
  return rows.map(row => Array.from(row, c => c === '#'));
}

export function placeholderGlyph(seed: number): Bitmap {
  const glyph = PLACEHOLDER_GLYPHS[Math.abs(seed) % PLACEHOLDER_GLYPHS.length];
  return logoBitmap(glyph);
}

export function signBitmap(sign: SkylineSign, seed: number): { kind: SignKind; bitmap: Bitmap } {
  const kind = signKind(sign);
  if (kind === 'quiet') return { kind, bitmap: [] };
  if (kind === 'logo' && sign.logo) return { kind, bitmap: logoBitmap(sign.logo) };
  if (kind === 'label' && sign.label) return { kind, bitmap: textBitmap(sign.label, sign.font ?? 'small') };
  return { kind: 'placeholder', bitmap: placeholderGlyph(seed) };
}

export function signAccent(sign: SkylineSign, seed: number): Rgb {
  return sign.color ?? SIGN_ACCENTS[Math.abs(seed >> 3) % SIGN_ACCENTS.length];
}

export interface Tier {
  x: number;
  width: number;
  top: number;
  bottom: number;
}

/** Split a building into stepped-back tiers, bottom first. */
export function buildingTiers(b: SkylineBuilding, baseline: number, unit: number): Tier[] {
  const top = baseline - b.height;
  const inset = unit * 2;
  const canInset = (w: number) => w - 2 * inset >= 3 * unit;
  if (b.setback <= 0 || !canInset(b.width) || b.height < 8 * unit) {
    return [{ x: b.x, width: b.width, top, bottom: baseline }];
  }
  const splits = b.setback === 1 ? [0.6] : [0.45, 0.75];
  const tiers: Tier[] = [];
  let x = b.x;
  let w = b.width;
  let bottom = baseline;
  let lastTop = baseline;
  for (const split of splits) {
    const tierTop = Math.round(baseline - b.height * split);
    tiers.push({ x, width: w, top: tierTop, bottom });
    bottom = tierTop;
    lastTop = tierTop;
    if (!canInset(w)) break;
    x += inset;
    w -= 2 * inset;
  }
  if (lastTop > top) tiers.push({ x, width: w, top, bottom });
  return tiers;
}

export interface SignLayout {
  kind: SignKind;
  bitmap: Bitmap;
  color: Rgb;
  /** Panel rectangle in glass pixels, including the 1px border and 1px padding. */
  x: number;
  y: number;
  width: number;
  height: number;
  rooftop: boolean;
}

/**
 * Where a building's sign panel goes: on the top tier if it fits, on the base tier if that
 * fits, else a rooftop billboard. Quiet buildings (explicitly quiet signs, or partners that
 * are not featured) get a dark unlabeled panel whatever their sign content says.
 */
export function signLayout(b: SkylineBuilding, tiers: Tier[]): SignLayout | null {
  if (!b.sign) return null;
  const topTier = tiers[tiers.length - 1];
  const baseTier = tiers[0];
  if (isQuietBuilding(b)) {
    const width = Math.max(6, Math.min(topTier.width - 2, Math.round(topTier.width * 0.6)));
    const height = 5;
    if (height > topTier.bottom - topTier.top - 4) return null;
    return {
      kind: 'quiet', bitmap: [], color: signAccent(b.sign, b.seed),
      x: topTier.x + Math.floor((topTier.width - width) / 2), y: topTier.top + 2, width, height, rooftop: false,
    };
  }
  const { kind, bitmap } = signBitmap(b.sign, b.seed);
  const bw = bitmap[0]?.length ?? 0;
  const bh = bitmap.length;
  if (bw === 0 || bh === 0) return null;
  const width = bw + 4;
  const height = bh + 4;
  const color = signAccent(b.sign, b.seed);
  const fitsOn = (tier: Tier) => width <= tier.width - 2 && height <= tier.bottom - tier.top - 4;
  if (fitsOn(topTier)) {
    return { kind, bitmap, color, x: topTier.x + Math.floor((topTier.width - width) / 2), y: topTier.top + 2, width, height, rooftop: false };
  }
  if (fitsOn(baseTier)) {
    return { kind, bitmap, color, x: baseTier.x + Math.floor((baseTier.width - width) / 2), y: baseTier.top + 2, width, height, rooftop: false };
  }
  const cx = b.x + Math.floor(b.width / 2);
  return { kind, bitmap, color, x: cx - Math.floor(width / 2), y: topTier.top - height - 1, width, height, rooftop: true };
}

function overlaps(x: number, y: number, w: number, h: number, r: SignLayout | null): boolean {
  if (!r) return false;
  return x < r.x + r.width && x + w > r.x && y < r.y + r.height && y + h > r.y;
}

function paintCity(pixels: PixelBuffer, geometry: SkylineGeometry, state: SkyState): void {
  const { height, buildings } = geometry;
  const p = state.palette;
  const lights = p.lights;
  const baseline = height;
  const unit = geometry.metrics.windowCell;
  const tallest = [...buildings].sort((a, b) => b.height - a.height).slice(0, 3);

  for (const b of buildings) {
    const random = createSeededRandom(b.seed);
    const facade = lerpRgb(p.city, p.cityEdge, 0.15 + 0.7 * b.facade);
    const edgeLight = lerpRgb(facade, [255, 255, 255], 0.1);
    const edgeDark = lerpRgb(facade, [0, 0, 0], 0.35);
    const ledge = lerpRgb(facade, [255, 255, 255], 0.14);
    const tiers = buildingTiers(b, baseline, unit);
    const sign = signLayout(b, tiers);

    for (const tier of tiers) {
      pixels.fillRect(tier.x, tier.top, tier.width, tier.bottom - tier.top, facade);
      pixels.fillRect(tier.x, tier.top, 1, tier.bottom - tier.top, edgeLight);
      pixels.fillRect(tier.x + tier.width - 1, tier.top, 1, tier.bottom - tier.top, edgeDark);
      pixels.fillRect(tier.x, tier.top, tier.width, 1, ledge);
      paintWindows(pixels, tier, b, unit, p, lights, random, sign);
      if (b.partner && b.seed % 3 !== 0) {
        const sideWidth = Math.max(2, Math.round(tier.width * 0.16));
        const sideX = b.seed % 2 === 0 ? tier.x : tier.x + tier.width - sideWidth;
        pixels.fillRect(sideX, tier.top + 1, sideWidth, tier.bottom - tier.top - 1, edgeDark);
        for (let y = tier.top + 2; y < tier.bottom; y += 4 * unit) {
          const inset = Math.floor((y - tier.top) / Math.max(1, tier.bottom - tier.top) * sideWidth);
          pixels.blend(sideX + (b.seed % 2 === 0 ? inset : sideWidth - 1 - inset), y, edgeLight, 0.45);
        }
      }
    }

    const topTier = tiers[tiers.length - 1];
    paintRoof(pixels, topTier, b, unit, facade, p);

    if (b.antenna || (b.roof === 'spire' && tallest.includes(b))) {
      const mastX = topTier.x + Math.floor(topTier.width / 2);
      const mastH = (3 + (b.seed % 4)) * unit;
      const mastTop = topTier.top - mastH - (b.roof === 'spire' ? 2 * unit : 0);
      pixels.fillRect(mastX, mastTop, 1, topTier.top - mastTop, p.cityEdge);
      pixels.blend(mastX, mastTop, [235, 60, 60], 0.3 + 0.7 * lights);
    }

    if (sign) paintSign(pixels, sign, facade, p, lights);
  }
}

function paintRoof(pixels: PixelBuffer, tier: Tier, b: SkylineBuilding, unit: number, facade: Rgb, p: SkyPalette): void {
  const top = tier.top;
  switch (b.roof) {
    case 'step':
      if (tier.width >= 4 * unit) pixels.fillRect(tier.x + unit, top - unit, tier.width - 2 * unit, unit, facade);
      break;
    case 'spire': {
      const sx = tier.x + Math.floor(tier.width / 2);
      pixels.fillRect(sx, top - 2 * unit, 1, 2 * unit, p.cityEdge);
      break;
    }
    case 'crown':
      for (let x = tier.x; x < tier.x + tier.width; x += 2 * unit) pixels.fillRect(x, top - unit, unit, unit, facade);
      break;
    case 'peak': {
      const third = Math.max(unit, Math.floor(tier.width / 3));
      const cx = tier.x + Math.floor((tier.width - third) / 2);
      pixels.fillRect(cx, top - unit, third, unit, facade);
      const fifth = Math.max(1, Math.floor(tier.width / 5));
      pixels.fillRect(tier.x + Math.floor((tier.width - fifth) / 2), top - 2 * unit, fifth, unit, facade);
      break;
    }
    default:
      break;
  }
}

function paintWindows(
  pixels: PixelBuffer,
  tier: Tier,
  b: SkylineBuilding,
  unit: number,
  p: SkyPalette,
  lights: number,
  random: () => number,
  sign: SignLayout | null,
): void {
  const litColor = (flicker: number) => lerpRgb(p.windowDark, p.windowLit, lights * flicker);
  const x0 = tier.x + unit;
  const x1 = tier.x + tier.width - unit;
  const y0 = tier.top + unit + 1;
  const y1 = tier.bottom - unit;
  const place = (x: number, y: number, w: number, h: number, lit: boolean) => {
    if (overlaps(x, y, w, h, sign)) return;
    pixels.fillRect(x, y, w, h, lit ? litColor(0.7 + random() * 0.3) : p.windowDark);
  };
  switch (b.windows) {
    case 'bands':
      for (let y = y0; y + unit <= y1; y += 3 * unit) place(x0, y, x1 - x0, unit, random() < b.lit);
      break;
    case 'columns':
      for (let x = x0 + unit; x + unit <= x1; x += 3 * unit) place(x, y0, unit, Math.max(0, y1 - y0), random() < b.lit);
      break;
    case 'sparse':
      for (let y = y0; y + unit <= y1; y += 3 * unit) {
        for (let x = x0 + unit; x + unit <= x1; x += 3 * unit) place(x, y, unit, unit, random() < b.lit * 0.7);
      }
      break;
    default:
      for (let y = y0; y + unit <= y1; y += 2 * unit) {
        for (let x = x0 + unit; x + unit <= x1; x += 2 * unit) place(x, y, unit, unit, random() < b.lit);
      }
      break;
  }
}

function paintSign(pixels: PixelBuffer, sign: SignLayout, facade: Rgb, p: SkyPalette, lights: number): void {
  const panel = lerpRgb(p.city, [0, 0, 0], 0.55);
  if (sign.kind === 'quiet') {
    // A dark panel with a barely-there border: something is there, but it says nothing until hovered.
    const dim = lerpRgb(facade, sign.color, 0.12 + 0.13 * lights);
    pixels.fillRect(sign.x, sign.y, sign.width, sign.height, panel);
    pixels.fillRect(sign.x, sign.y, sign.width, 1, dim);
    pixels.fillRect(sign.x, sign.y + sign.height - 1, sign.width, 1, dim);
    pixels.fillRect(sign.x, sign.y, 1, sign.height, dim);
    pixels.fillRect(sign.x + sign.width - 1, sign.y, 1, sign.height, dim);
    return;
  }
  const glow = 0.4 + 0.6 * lights;
  const accent = lerpRgb(facade, sign.color, glow);
  const border = lerpRgb(facade, sign.color, glow * 0.7);
  if (sign.rooftop) {
    // Two posts holding the billboard above the roof.
    pixels.fillRect(sign.x + 1, sign.y + sign.height, 1, 2, p.cityEdge);
    pixels.fillRect(sign.x + sign.width - 2, sign.y + sign.height, 1, 2, p.cityEdge);
  }
  pixels.fillRect(sign.x, sign.y, sign.width, sign.height, panel);
  pixels.fillRect(sign.x, sign.y, sign.width, 1, border);
  pixels.fillRect(sign.x, sign.y + sign.height - 1, sign.width, 1, border);
  pixels.fillRect(sign.x, sign.y, 1, sign.height, border);
  pixels.fillRect(sign.x + sign.width - 1, sign.y, 1, sign.height, border);
  for (let r = 0; r < sign.bitmap.length; r++) {
    for (let c = 0; c < sign.bitmap[r].length; c++) {
      if (sign.bitmap[r][c]) pixels.set(sign.x + 2 + c, sign.y + 2 + r, accent);
    }
  }
}

function paintGlass(pixels: PixelBuffer, geometry: SkylineGeometry, panes: number): void {
  const { width, height } = geometry;
  const count = Math.max(1, Math.floor(panes));
  const paneWidth = width / count;
  for (let i = 0; i < count; i++) {
    const start = Math.round(i * paneWidth) + 6;
    for (let step = 0; step < height; step++) {
      pixels.blend(start + step, step, [255, 255, 255], 0.05);
      pixels.blend(start + step + 3, step, [255, 255, 255], 0.03);
    }
  }
  for (let x = 0; x < width; x++) pixels.blend(x, 0, [255, 255, 255], 0.08);
}

// ── Hit testing ───────────────────────────────────────────────────

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bounding rectangle of a building in world pixels, given the glass rectangle it is drawn in. */
export function buildingWorldRect(b: SkylineBuilding, glass: Rect): Rect {
  const height = Math.min(b.height, glass.height);
  return { x: glass.x + b.x, y: glass.y + glass.height - height, width: b.width, height };
}

export function rectContains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

/** The building under a world-space point, or null. Buildings never overlap, so the first hit wins. */
export function hitTestBuilding(buildings: readonly SkylineBuilding[], glass: Rect, x: number, y: number): SkylineBuilding | null {
  if (!rectContains(glass, x, y)) return null;
  for (const b of buildings) {
    if (rectContains(buildingWorldRect(b, glass), x, y)) return b;
  }
  return null;
}

/** Paint the transparent cloud band that scrolls across the top of the glass. */
export function paintCloudBand(
  pixels: PixelBuffer,
  geometry: SkylineGeometry,
  state: SkyState,
  weather: WeatherVisualState = CLEAR_WEATHER,
): void {
  const visualState = weatheredSkyState(state, weather);
  const p = visualState.palette;
  const density = 0.55 + weather.cloud01 * 0.45;
  const alpha = Math.round(255 * density * (0.7 + 0.22 * (1 - p.stars)));
  const shade = lerpRgb(p.cloud, p.skyTop, 0.38 + weather.rain01 * 0.3);
  for (const cloud of geometry.clouds) {
    drawCloud(pixels, cloud, 0, p.cloud, shade, alpha);
    if (cloud.x + cloud.width > geometry.width) drawCloud(pixels, cloud, -geometry.width, p.cloud, shade, alpha);
    if (weather.cloud01 > 0.55) {
      const offset = Math.round(geometry.width * 0.37);
      drawCloud(pixels, cloud, offset, p.cloud, shade, Math.round(alpha * 0.72));
      if (cloud.x + offset + cloud.width > geometry.width) {
        drawCloud(pixels, cloud, offset - geometry.width, p.cloud, shade, Math.round(alpha * 0.72));
      }
    }
  }
}

function drawCloud(pixels: PixelBuffer, cloud: Cloud, offset: number, fill: Rgb, shade: Rgb, alpha: number): void {
  const u = cloud.unit;
  const x = cloud.x + offset;
  const w = cloud.width;
  const y = cloud.y;
  pixels.fillRect(x + u, y + 2 * u, w - 2 * u, 2 * u, fill, alpha);
  pixels.fillRect(x + Math.floor(w * 0.12), y + u, Math.floor(w * 0.3), 2 * u, fill, alpha);
  pixels.fillRect(x + Math.floor(w * 0.34), y, Math.floor(w * 0.34), 3 * u, fill, alpha);
  pixels.fillRect(x + Math.floor(w * 0.62), y + u, Math.floor(w * 0.24), 2 * u, fill, alpha);
  pixels.fillRect(x + 2 * u, y + 4 * u, Math.max(u, w - 4 * u), u, shade, alpha);
}

// ── Deterministic geometry ────────────────────────────────────────

interface RidgeParams {
  massifs: number;
  minHeight: number;
  maxHeight: number;
  /** Jitter amplitude as a share of the ridge height. */
  roughness: number;
}

interface Summit {
  x: number;
  height: number;
  slopeLeft: number;
  slopeRight: number;
}

type RidgeProfilePoint = readonly [x: number, height: number];

function buildProfileRidge(width: number, seed: number, maxHeight: number, points: readonly RidgeProfilePoint[]): Ridge {
  const random = createSeededRandom(seed);
  const heights = new Uint8Array(width);
  let segment = 0;
  for (let x = 0; x < width; x++) {
    const ratio = x / Math.max(1, width - 1);
    while (segment < points.length - 2 && ratio > points[segment + 1][0]) segment++;
    const [x0, h0] = points[segment];
    const [x1, h1] = points[Math.min(points.length - 1, segment + 1)];
    const amount = clamp01((ratio - x0) / Math.max(0.0001, x1 - x0));
    const height = lerp(h0, h1, amount) * maxHeight;
    const terrace = Math.round(height / 1.5) * 1.5;
    const grain = random() < 0.12 ? (random() < 0.5 ? -1 : 1) : 0;
    heights[x] = Math.max(1, Math.round(terrace + grain));
  }

  const snowNoise = new Float32Array(width);
  const snowFingers = new Uint8Array(width);
  let snowDrift = 0;
  for (let x = 0; x < width; x++) {
    snowDrift += (random() - 0.5) * 0.85;
    snowDrift *= 0.82;
    snowNoise[x] = snowDrift * maxHeight * 0.08;
    if (random() < 0.075) snowFingers[x] = 2 + Math.floor(random() * Math.max(2, maxHeight * 0.12));
  }
  return { heights, snowNoise, snowFingers };
}

/**
 * Build a ridge line from a handful of asymmetric massifs, each with one or two
 * shoulders, then let a terraced random walk hug that silhouette so no two peaks
 * share the same smooth triangular profile.
 */
export function buildRidge(width: number, seed: number, params: RidgeParams): Ridge {
  const random = createSeededRandom(seed);
  const { massifs, minHeight, maxHeight, roughness } = params;
  const slopeScale = maxHeight / 47;
  const summits: Summit[] = [];
  const spacing = width / massifs;
  for (let i = 0; i < massifs; i++) {
    const cx = Math.round(i * spacing + spacing * (0.15 + random() * 0.7));
    const h = minHeight + random() * (maxHeight - minHeight);
    const steep = (0.45 + random() * 0.55) * slopeScale;
    const gentle = steep * (0.3 + random() * 0.35);
    const steepLeft = random() < 0.5;
    summits.push({ x: cx, height: h, slopeLeft: steepLeft ? steep : gentle, slopeRight: steepLeft ? gentle : steep });
    const shoulders = 1 + Math.floor(random() * 2);
    for (let k = 0; k < shoulders; k++) {
      const side = random() < 0.5 ? -1 : 1;
      const offset = side * (spacing * 0.12 + random() * spacing * 0.3);
      const sh = h * (0.45 + random() * 0.35);
      const s1 = (0.5 + random() * 0.6) * slopeScale;
      const s2 = (0.5 + random() * 0.6) * slopeScale;
      summits.push({ x: Math.round(cx + offset), height: sh, slopeLeft: s1, slopeRight: s2 });
    }
  }
  const target = (x: number): number => {
    let h = 0;
    for (const s of summits) {
      const dx = x - s.x;
      const slope = dx < 0 ? s.slopeLeft : s.slopeRight;
      h = Math.max(h, s.height - Math.abs(dx) * slope);
    }
    return h;
  };

  const heights = new Uint8Array(width);
  const amplitude = maxHeight * roughness;
  let r = target(0);
  let segment = 0;
  let step = 0;
  for (let x = 0; x < width; x++) {
    const t = target(x);
    if (segment <= 0) {
      segment = 2 + Math.floor(random() * 4);
      step = (random() - 0.5) * 2 * amplitude;
    }
    segment--;
    r += (t - r) * 0.75 + step * 0.5;
    r = Math.max(0, Math.min(maxHeight, r));
    heights[x] = Math.round(Math.max(t * 0.8, r));
  }

  // Snow line noise: smooth control points every 8px, plus scattered couloir fingers.
  const snowNoise = new Float32Array(width);
  const controlSpacing = 8;
  const controls: number[] = [];
  for (let i = 0; i <= Math.ceil(width / controlSpacing) + 1; i++) controls.push((random() - 0.5) * 2 * maxHeight * 0.14);
  for (let x = 0; x < width; x++) {
    const i = Math.floor(x / controlSpacing);
    const t = (x - i * controlSpacing) / controlSpacing;
    snowNoise[x] = controls[i] * (1 - t) + controls[i + 1] * t;
  }
  const snowFingers = new Uint8Array(width);
  for (let x = 0; x < width; x++) {
    if (random() < 0.09) {
      const depth = 2 + Math.floor(random() * Math.max(2, maxHeight * 0.14));
      snowFingers[x] = depth;
      if (x + 1 < width && random() < 0.6) snowFingers[x + 1] = Math.max(1, depth - 1);
    }
  }
  return { heights, snowNoise, snowFingers };
}

function carveValley(ridge: Ridge, centerRatio: number, halfWidthRatio: number, floorHeight: number): Ridge {
  const width = ridge.heights.length;
  const center = width * centerRatio;
  const halfWidth = width * halfWidthRatio;
  const heights = Uint8Array.from(ridge.heights, (height, x) => {
    const distance = Math.abs(x - center);
    if (distance >= halfWidth) return height;
    const t = distance / halfWidth;
    const eased = t * t * (3 - 2 * t);
    return Math.round(floorHeight + (height - floorHeight) * eased);
  });
  return { ...ridge, heights };
}

function buildStars(width: number, maxRow: number, seed: number, count: number): Star[] {
  const random = createSeededRandom(seed);
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.floor(random() * width),
      y: Math.floor(random() * Math.max(1, maxRow)),
      brightness: 0.35 + random() * 0.65,
    });
  }
  return stars;
}

function buildClouds(width: number, seed: number, metrics: SkylineMetrics): Cloud[] {
  const random = createSeededRandom(seed);
  const clouds: Cloud[] = [];
  const count = 8;
  const unit = metrics.cloudUnit;
  const maxY = Math.max(1, metrics.cloudBandHeight - 4 * unit - 1);
  for (let i = 0; i < count; i++) {
    clouds.push({
      x: Math.floor((i / count) * width + random() * (width / count) * 0.6),
      y: 1 + Math.floor(random() * maxY),
      width: (8 + Math.floor(random() * 12)) * unit,
      unit,
    });
  }
  return clouds;
}
