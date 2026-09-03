/**
 * Maps a solar snapshot onto the colours and intensities the skyline window paints with.
 * Palettes are keyed by sun elevation so dawn, day, dusk and night land at the right
 * moment in every season, and they interpolate continuously so the window never pops.
 */
import type { SolarSnapshot } from './solar';

export type Rgb = readonly [number, number, number];

export type SkyPhaseName = 'night' | 'dawn' | 'day' | 'sunset';

export interface SkyPalette {
  skyTop: Rgb;
  skyHorizon: Rgb;
  sunGlow: Rgb;
  sun: Rgb;
  farRidge: Rgb;
  farRim: Rgb;
  nearRidge: Rgb;
  snow: Rgb;
  city: Rgb;
  cityEdge: Rgb;
  windowLit: Rgb;
  windowDark: Rgb;
  cloud: Rgb;
  /** 0 to 1: how many city windows glow. */
  lights: number;
  /** 0 to 1: star visibility. */
  stars: number;
  /** 0 to 1: strength of the horizon glow around the sun. */
  sunGlowStrength: number;
}

interface Stop {
  elevation: number;
  palette: SkyPalette;
}

const NIGHT: SkyPalette = {
  skyTop: [6, 6, 24],
  skyHorizon: [22, 18, 54],
  sunGlow: [40, 30, 80],
  sun: [255, 200, 120],
  farRidge: [30, 24, 62],
  farRim: [48, 40, 92],
  nearRidge: [18, 14, 42],
  snow: [150, 150, 196],
  city: [10, 8, 26],
  cityEdge: [22, 18, 46],
  windowLit: [255, 214, 120],
  windowDark: [18, 16, 40],
  cloud: [30, 26, 62],
  lights: 1,
  stars: 1,
  sunGlowStrength: 0,
};

function twilight(rising: boolean): SkyPalette {
  return {
    skyTop: [20, 16, 54],
    skyHorizon: rising ? [124, 64, 116] : [142, 62, 92],
    sunGlow: rising ? [200, 110, 130] : [220, 100, 90],
    sun: [255, 170, 90],
    farRidge: [46, 32, 84],
    farRim: [86, 60, 124],
    nearRidge: [26, 18, 54],
    snow: [196, 164, 206],
    city: [14, 10, 32],
    cityEdge: [30, 22, 56],
    windowLit: [255, 214, 120],
    windowDark: [22, 18, 44],
    cloud: [70, 46, 96],
    lights: 0.92,
    stars: 0.55,
    sunGlowStrength: 0.7,
  };
}

function horizon(rising: boolean): SkyPalette {
  return {
    skyTop: rising ? [68, 38, 112] : [62, 32, 104],
    skyHorizon: rising ? [232, 126, 84] : [228, 100, 70],
    sunGlow: rising ? [255, 200, 130] : [255, 170, 90],
    sun: [255, 150, 70],
    farRidge: [90, 46, 116],
    farRim: [184, 86, 142],
    nearRidge: [22, 18, 56],
    snow: [255, 204, 176],
    city: [22, 14, 44],
    cityEdge: [46, 30, 74],
    windowLit: [255, 214, 120],
    windowDark: [30, 22, 54],
    cloud: [180, 100, 120],
    lights: 0.7,
    stars: 0.12,
    sunGlowStrength: 1,
  };
}

function golden(rising: boolean): SkyPalette {
  return {
    skyTop: rising ? [72, 48, 128] : [64, 38, 112],
    skyHorizon: rising ? [224, 136, 94] : [220, 112, 80],
    sunGlow: [255, 226, 160],
    sun: [255, 200, 110],
    farRidge: [94, 50, 126],
    farRim: [184, 90, 152],
    nearRidge: [26, 20, 64],
    snow: [255, 236, 222],
    city: [36, 28, 66],
    cityEdge: [62, 48, 98],
    windowLit: [255, 224, 150],
    windowDark: [40, 34, 66],
    cloud: [226, 122, 118],
    lights: 0.32,
    stars: 0,
    sunGlowStrength: 0.55,
  };
}

const DAY: SkyPalette = {
  skyTop: [64, 122, 204],
  skyHorizon: [150, 188, 228],
  sunGlow: [255, 250, 220],
  sun: [255, 236, 150],
  farRidge: [96, 102, 166],
  farRim: [154, 160, 212],
  nearRidge: [46, 50, 110],
  snow: [246, 248, 255],
  city: [62, 66, 104],
  cityEdge: [92, 98, 140],
  windowLit: [200, 210, 230],
  windowDark: [50, 56, 88],
  cloud: [240, 244, 252],
  lights: 0.04,
  stars: 0,
  sunGlowStrength: 0.25,
};

function stopsFor(rising: boolean): Stop[] {
  return [
    { elevation: -12, palette: NIGHT },
    { elevation: -6, palette: twilight(rising) },
    { elevation: 0, palette: horizon(rising) },
    { elevation: 6, palette: golden(rising) },
    { elevation: 24, palette: DAY },
  ];
}

const STOPS_RISING = stopsFor(true);
const STOPS_SETTING = stopsFor(false);

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))];
}

export function rgbToCss(rgb: Rgb, alpha = 1): string {
  return alpha >= 1 ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

export function rgbToInt(rgb: Rgb): number {
  return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
}

function lerpPalette(a: SkyPalette, b: SkyPalette, t: number): SkyPalette {
  return {
    skyTop: lerpRgb(a.skyTop, b.skyTop, t),
    skyHorizon: lerpRgb(a.skyHorizon, b.skyHorizon, t),
    sunGlow: lerpRgb(a.sunGlow, b.sunGlow, t),
    sun: lerpRgb(a.sun, b.sun, t),
    farRidge: lerpRgb(a.farRidge, b.farRidge, t),
    farRim: lerpRgb(a.farRim, b.farRim, t),
    nearRidge: lerpRgb(a.nearRidge, b.nearRidge, t),
    snow: lerpRgb(a.snow, b.snow, t),
    city: lerpRgb(a.city, b.city, t),
    cityEdge: lerpRgb(a.cityEdge, b.cityEdge, t),
    windowLit: lerpRgb(a.windowLit, b.windowLit, t),
    windowDark: lerpRgb(a.windowDark, b.windowDark, t),
    cloud: lerpRgb(a.cloud, b.cloud, t),
    lights: lerp(a.lights, b.lights, t),
    stars: lerp(a.stars, b.stars, t),
    sunGlowStrength: lerp(a.sunGlowStrength, b.sunGlowStrength, t),
  };
}

/** Continuous palette for a sun elevation; `rising` picks dawn tones over dusk tones. */
export function paletteForElevation(elevationDeg: number, rising: boolean): SkyPalette {
  const stops = rising ? STOPS_RISING : STOPS_SETTING;
  if (elevationDeg <= stops[0].elevation) return stops[0].palette;
  const last = stops[stops.length - 1];
  if (elevationDeg >= last.elevation) return last.palette;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (elevationDeg >= a.elevation && elevationDeg <= b.elevation) {
      const t = (elevationDeg - a.elevation) / (b.elevation - a.elevation);
      return lerpPalette(a.palette, b.palette, t);
    }
  }
  return last.palette;
}

export function phaseForElevation(elevationDeg: number, rising: boolean): SkyPhaseName {
  if (elevationDeg >= 6) return 'day';
  if (elevationDeg < -8) return 'night';
  return rising ? 'dawn' : 'sunset';
}

/**
 * Seasonal snowpack on the Wasatch, 0 (late July) to 1 (late January), from day of year.
 * Northern-hemisphere cosine centred on day 20; deterministic and smooth.
 */
export function snowCover01(dayOfYear: number): number {
  return clamp01(0.5 + 0.5 * Math.cos(((dayOfYear - 20) / 365.25) * Math.PI * 2));
}

export interface SkyState {
  phase: SkyPhaseName;
  palette: SkyPalette;
  elevationDeg: number;
  rising: boolean;
  /** 0 at sunrise, 1 at sunset. */
  sunProgress: number;
  /** 0 at sunset, 1 at next sunrise. */
  moonProgress: number;
  /** 0 to 1 fraction of the sky height the sun disc sits at above the horizon. */
  sunAltitude01: number;
  sunVisible: boolean;
  moonVisible: boolean;
  snow01: number;
}

/** Highest elevation the sun reaches at the Wasatch Front. */
const MAX_ELEVATION_DEG = 73;
/** Elevation at which the disc has cleared the ridge line in the compressed 36px sky. */
const RIDGE_CLEAR_ELEVATION_DEG = 8;
/** Share of the sky height the disc has climbed once it clears the ridge line. */
const RIDGE_CLEAR_ALTITUDE = 0.78;

/**
 * Sun disc height as a share of the sky, 0 at the horizon and 1 at the summer zenith.
 * The window's sky is only a few pixels tall and the far ridge fills most of it, so the
 * climb is steep near the horizon (the sun clears the peaks quickly, as it does over the
 * Wasatch) and gentle above.
 */
export function sunAltitude01(elevationDeg: number): number {
  if (elevationDeg <= 0) return 0;
  if (elevationDeg <= RIDGE_CLEAR_ELEVATION_DEG) {
    return (elevationDeg / RIDGE_CLEAR_ELEVATION_DEG) * RIDGE_CLEAR_ALTITUDE;
  }
  const above = (elevationDeg - RIDGE_CLEAR_ELEVATION_DEG) / (MAX_ELEVATION_DEG - RIDGE_CLEAR_ELEVATION_DEG);
  return clamp01(RIDGE_CLEAR_ALTITUDE + above * (1 - RIDGE_CLEAR_ALTITUDE));
}

export function skyStateFromSnapshot(snapshot: SolarSnapshot): SkyState {
  const { elevationDeg, rising } = snapshot;
  const palette = paletteForElevation(elevationDeg, rising);
  const isDayPolar = snapshot.polar === 'day';
  const isNightPolar = snapshot.polar === 'night';
  return {
    phase: phaseForElevation(elevationDeg, rising),
    palette,
    elevationDeg,
    rising,
    sunProgress: snapshot.dayProgress,
    moonProgress: snapshot.nightProgress,
    sunAltitude01: sunAltitude01(elevationDeg),
    sunVisible: !isNightPolar && (isDayPolar || elevationDeg > -1.5),
    moonVisible: !isDayPolar && (isNightPolar || elevationDeg < 2),
    snow01: snowCover01(snapshot.local.dayOfYear),
  };
}
