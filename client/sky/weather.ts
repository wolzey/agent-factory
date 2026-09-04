import { clamp01, lerp, lerpRgb } from './skyPhase';
import type { Rgb, SkyPalette, SkyState } from './skyPhase';

export type WeatherMode = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'post-rain';

export interface WeatherVisualState {
  mode: WeatherMode;
  cloud01: number;
  /** 0 = thin/high, 0.5 = puffy, 1 = dense storm deck. */
  cloudForm01: number;
  rain01: number;
  snow01: number;
  fog01: number;
  wet01: number;
  wind01: number;
}

export interface WeatherProvider {
  current(signal?: AbortSignal): Promise<WeatherVisualState>;
}

export const CLEAR_WEATHER: WeatherVisualState = {
  mode: 'clear',
  cloud01: 0,
  cloudForm01: 0,
  rain01: 0,
  snow01: 0,
  fog01: 0,
  wet01: 0,
  wind01: 0.1,
};

const WEATHER_PRESETS: Record<string, WeatherVisualState> = {
  clear: CLEAR_WEATHER,
  cloudy: { mode: 'cloudy', cloud01: 0.72, cloudForm01: 0.52, rain01: 0, snow01: 0, fog01: 0.08, wet01: 0, wind01: 0.28 },
  fog: { mode: 'fog', cloud01: 0.88, cloudForm01: 0.76, rain01: 0, snow01: 0, fog01: 0.82, wet01: 0.24, wind01: 0.06 },
  rain: { mode: 'rain', cloud01: 0.9, cloudForm01: 0.82, rain01: 0.56, snow01: 0, fog01: 0.18, wet01: 1, wind01: 0.42 },
  'rain-light': { mode: 'rain', cloud01: 0.76, cloudForm01: 0.68, rain01: 0.3, snow01: 0, fog01: 0.1, wet01: 0.72, wind01: 0.24 },
  'rain-heavy': { mode: 'rain', cloud01: 1, cloudForm01: 1, rain01: 1, snow01: 0, fog01: 0.34, wet01: 1, wind01: 0.7 },
  snow: { mode: 'snow', cloud01: 0.88, cloudForm01: 0.78, rain01: 0, snow01: 0.62, fog01: 0.3, wet01: 0.5, wind01: 0.28 },
  'snow-light': { mode: 'snow', cloud01: 0.72, cloudForm01: 0.66, rain01: 0, snow01: 0.28, fog01: 0.2, wet01: 0.28, wind01: 0.18 },
  'snow-heavy': { mode: 'snow', cloud01: 1, cloudForm01: 0.96, rain01: 0, snow01: 1, fog01: 0.58, wet01: 0.68, wind01: 0.5 },
  'post-rain': { mode: 'post-rain', cloud01: 0.38, cloudForm01: 0.42, rain01: 0, snow01: 0, fog01: 0.12, wet01: 0.92, wind01: 0.2 },
};

export const SKY_WEATHER_PARAM = 'skyWeather';

export function parseWeatherOverride(search: string | null | undefined): WeatherVisualState | null {
  try {
    const raw = new URLSearchParams(search ?? '').get(SKY_WEATHER_PARAM)?.trim().toLowerCase();
    if (!raw || !(raw in WEATHER_PRESETS)) return null;
    return { ...WEATHER_PRESETS[raw as WeatherMode] };
  } catch {
    return null;
  }
}

export function lerpWeather(a: WeatherVisualState, b: WeatherVisualState, t: number): WeatherVisualState {
  const amount = clamp01(t);
  if (amount === 0) return { ...a };
  if (amount === 1) return { ...b };
  return {
    mode: amount < 0.5 ? a.mode : b.mode,
    cloud01: lerp(a.cloud01, b.cloud01, amount),
    cloudForm01: lerp(a.cloudForm01, b.cloudForm01, amount),
    rain01: lerp(a.rain01, b.rain01, amount),
    snow01: lerp(a.snow01, b.snow01, amount),
    fog01: lerp(a.fog01, b.fog01, amount),
    wet01: lerp(a.wet01, b.wet01, amount),
    wind01: lerp(a.wind01, b.wind01, amount),
  };
}

interface OpenMeteoCurrent {
  time?: string;
  weather_code?: number;
  cloud_cover?: number;
  precipitation?: number;
  rain?: number;
  snowfall?: number;
  visibility?: number;
  wind_speed_10m?: number;
}

interface OpenMeteoResponse {
  current?: OpenMeteoCurrent;
  hourly?: { time?: string[]; precipitation?: number[] };
}

function recentPrecipitation(data: OpenMeteoResponse): number {
  const values = data.hourly?.precipitation;
  if (!Array.isArray(values)) return 0;
  const times = data.hourly?.time;
  const currentTime = data.current?.time;
  return values.reduce<number>((max, value, index) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return max;
    if (currentTime && Array.isArray(times) && times[index] && times[index] > currentTime) return max;
    return Math.max(max, value);
  }, 0);
}

export function weatherFromOpenMeteo(data: OpenMeteoResponse): WeatherVisualState {
  const current = data.current ?? {};
  const code = Number.isFinite(current.weather_code) ? Number(current.weather_code) : 0;
  const precipitation = Math.max(0, Number(current.precipitation) || 0);
  const rain = Math.max(0, Number(current.rain) || 0);
  const snowfall = Math.max(0, Number(current.snowfall) || 0);
  const previousPrecipitation = recentPrecipitation(data);
  const cloud01 = clamp01((Number(current.cloud_cover) || 0) / 100);
  const visibility = Number(current.visibility);
  const fog01 = code === 45 || code === 48
    ? 0.78
    : Number.isFinite(visibility) ? clamp01((10_000 - visibility) / 8_000) : 0;
  const rainCode = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code);
  const snowCode = [71, 73, 75, 77, 85, 86].includes(code);
  const rain01 = clamp01(Math.max(rain, precipitation) / 1.6 + (rainCode ? 0.18 : 0));
  const snow01 = clamp01(snowfall / 1.2 + (snowCode ? 0.24 : 0));
  const wet01 = precipitation > 0 ? 1 : clamp01(previousPrecipitation / 0.5);
  const wind01 = clamp01((Number(current.wind_speed_10m) || 0) / 45);
  const precipitation01 = Math.max(rain01, snow01);
  const cloudForm01 = clamp01(
    precipitation01 > 0.08
      ? 0.68 + precipitation01 * 0.32
      : code === 3 || code === 45 || code === 48
        ? 0.72 + cloud01 * 0.18
        : code === 2
          ? 0.48 + cloud01 * 0.16
          : cloud01 * 0.48,
  );

  let mode: WeatherMode = 'clear';
  if (snow01 > 0.08) mode = 'snow';
  else if (rain01 > 0.08) mode = 'rain';
  else if (fog01 > 0.35) mode = 'fog';
  else if (wet01 > 0.12) mode = 'post-rain';
  else if (cloud01 > 0.45) mode = 'cloudy';

  return { mode, cloud01, cloudForm01, rain01, snow01, fog01, wet01, wind01 };
}

export function cloudLayerWeights(weather: WeatherVisualState): readonly [number, number, number] {
  const form = clamp01(weather.cloudForm01);
  return [
    clamp01(1 - form * 2),
    clamp01(1 - Math.abs(form - 0.5) * 2),
    clamp01((form - 0.5) * 2),
  ];
}

export class OpenMeteoWeatherProvider implements WeatherProvider {
  constructor(
    private readonly latitude = 40.7608,
    private readonly longitude = -111.891,
  ) {}

  async current(signal?: AbortSignal): Promise<WeatherVisualState> {
    const params = new URLSearchParams({
      latitude: String(this.latitude),
      longitude: String(this.longitude),
      current: 'weather_code,cloud_cover,precipitation,rain,snowfall,visibility,wind_speed_10m',
      hourly: 'precipitation',
      past_hours: '2',
      forecast_hours: '1',
      timezone: 'America/Denver',
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal });
    if (!response.ok) throw new Error(`weather request failed (${response.status})`);
    return weatherFromOpenMeteo(await response.json() as OpenMeteoResponse);
  }
}

function tint(rgb: Rgb, target: Rgb, amount: number, shade = 0): Rgb {
  return lerpRgb(lerpRgb(rgb, target, clamp01(amount)), [0, 0, 0], clamp01(shade));
}

export function weatherPalette(palette: SkyPalette, weather: WeatherVisualState): SkyPalette {
  const storm = clamp01(weather.rain01 * 0.72 + weather.fog01 * 0.34 + weather.cloud01 * 0.16);
  const snow = clamp01(weather.snow01);
  const cool: Rgb = [92, 116, 148];
  const haze: Rgb = [164, 178, 194];
  const fogMix = weather.fog01 * 0.48;
  const alter = (rgb: Rgb, weight = 1) => tint(rgb, cool, storm * weight, storm * 0.2);
  const mist = (rgb: Rgb, weight = 1) => lerpRgb(alter(rgb, weight), haze, fogMix * weight);
  const nearStorm = lerpRgb(alter(palette.nearRidge, 0.88), [12, 20, 44], storm * 0.42);
  const cloudStorm = lerpRgb(mist(palette.cloud, 0.72), [200, 211, 224], weather.cloud01 * 0.62);
  const snowDaylight = 1 - palette.stars;
  const snowSky = lerpRgb([48, 58, 72], [136, 148, 176], snowDaylight);
  const snowHorizon = lerpRgb([64, 76, 92], [156, 168, 194], snowDaylight);
  const snowCloud = lerpRgb([70, 82, 98], [134, 148, 178], snowDaylight);
  const snowFarRidge = lerpRgb([70, 84, 102], [182, 196, 218], snowDaylight);
  const snowNearRidge = lerpRgb([60, 74, 92], [172, 186, 210], snowDaylight);
  const snowWash = snow * 0.96;
  return {
    ...palette,
    skyTop: lerpRgb(alter(palette.skyTop, 0.78), snowSky, snowWash),
    skyHorizon: lerpRgb(mist(palette.skyHorizon, 0.72), snowHorizon, snowWash),
    sunGlow: lerpRgb(alter(palette.sunGlow, 0.48), snowHorizon, snow * 0.72),
    sun: lerpRgb(mist(palette.sun, 0.25), snowHorizon, snow * 0.68),
    farRidge: lerpRgb(mist(palette.farRidge, 0.9), snowFarRidge, snow * 0.92),
    farRim: lerpRgb(mist(palette.farRim, 0.8), snowHorizon, snow * 0.88),
    nearRidge: lerpRgb(nearStorm, snowNearRidge, snow * 0.92),
    snow: lerpRgb(mist(palette.snow, 0.5), snowHorizon, snow * 0.9),
    city: alter(palette.city, 0.88),
    cityEdge: mist(palette.cityEdge, 0.56),
    cloud: lerpRgb(cloudStorm, snowCloud, snow * 0.94),
    stars: palette.stars * (1 - weather.cloud01 * 0.92),
    sunGlowStrength: palette.sunGlowStrength * (1 - weather.cloud01 * 0.74),
  };
}

export function weatheredSkyState(state: SkyState, weather: WeatherVisualState): SkyState {
  return { ...state, palette: weatherPalette(state.palette, weather) };
}
