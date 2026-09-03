import {
  SKY_WEATHER_PARAM,
  parseWeatherOverride,
} from './weather';
import type { WeatherVisualState } from './weather';

export const SELECTABLE_WEATHER_MODES = [
  'clear',
  'cloudy',
  'rain-light',
  'rain-heavy',
  'post-rain',
  'snow-light',
  'snow-heavy',
] as const;

export type SelectableWeatherMode = typeof SELECTABLE_WEATHER_MODES[number];

export interface WeatherPreset {
  id: SelectableWeatherMode;
  label: string;
  state: WeatherVisualState;
}

function stateFor(id: SelectableWeatherMode): WeatherVisualState {
  const state = parseWeatherOverride(`?${SKY_WEATHER_PARAM}=${id}`);
  if (!state) throw new Error(`Missing weather preset: ${id}`);
  return state;
}

export const WEATHER_PRESETS: readonly WeatherPreset[] = [
  { id: 'clear', label: 'Clear', state: stateFor('clear') },
  { id: 'cloudy', label: 'Cloudy', state: stateFor('cloudy') },
  { id: 'rain-light', label: 'Rain light', state: stateFor('rain-light') },
  { id: 'rain-heavy', label: 'Rain heavy', state: stateFor('rain-heavy') },
  { id: 'post-rain', label: 'Post-rain', state: stateFor('post-rain') },
  { id: 'snow-light', label: 'Snow light', state: stateFor('snow-light') },
  { id: 'snow-heavy', label: 'Snow heavy', state: stateFor('snow-heavy') },
];

export function weatherPresetById(value: string | null | undefined): WeatherPreset | null {
  const id = value?.trim().toLowerCase();
  return WEATHER_PRESETS.find((preset) => preset.id === id) ?? null;
}

export function weatherPresetFromSearch(search: string | null | undefined): WeatherPreset | null {
  const raw = new URLSearchParams(search ?? '').get(SKY_WEATHER_PARAM);
  const direct = weatherPresetById(raw);
  if (direct) return direct;
  if (raw === 'rain') return weatherPresetById('rain-light');
  if (raw === 'snow') return weatherPresetById('snow-light');
  return null;
}

export function cycleWeatherPreset(
  current: string | null | undefined,
  direction = 1,
): WeatherPreset {
  const active = weatherPresetById(current);
  if (!active) return WEATHER_PRESETS[0];

  const index = WEATHER_PRESETS.indexOf(active);
  const offset = Number.isFinite(direction) ? Math.trunc(direction) : 1;
  const next = (index + offset % WEATHER_PRESETS.length + WEATHER_PRESETS.length) % WEATHER_PRESETS.length;
  return WEATHER_PRESETS[next];
}

export function searchWithWeatherPreset(
  search: string | null | undefined,
  preset: SelectableWeatherMode,
): string {
  const params = new URLSearchParams(search ?? '');
  params.set(SKY_WEATHER_PARAM, preset);
  return `?${params.toString()}`;
}
