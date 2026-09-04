import { describe, expect, it } from 'vitest';
import {
  SELECTABLE_WEATHER_MODES,
  WEATHER_PRESETS,
  cycleWeatherPreset,
  searchWithWeatherPreset,
  weatherPresetById,
  weatherPresetFromSearch,
} from '../client/sky/weatherPresets';
import { parseWeatherOverride } from '../client/sky/weather';

describe('selectable weather presets', () => {
  it('exposes the debug states in a stable display order', () => {
    expect(SELECTABLE_WEATHER_MODES).toEqual([
      'clear', 'cloudy', 'rain-light', 'rain-heavy', 'post-rain', 'snow-light', 'snow-heavy',
    ]);
    expect(WEATHER_PRESETS.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: 'clear', label: 'Clear' },
      { id: 'cloudy', label: 'Cloudy' },
      { id: 'rain-light', label: 'Rain light' },
      { id: 'rain-heavy', label: 'Rain heavy' },
      { id: 'post-rain', label: 'Post-rain' },
      { id: 'snow-light', label: 'Snow light' },
      { id: 'snow-heavy', label: 'Snow heavy' },
    ]);
  });

  it('uses the same visual states as query-parameter overrides', () => {
    for (const preset of WEATHER_PRESETS) {
      expect(preset.state).toEqual(parseWeatherOverride(`?skyWeather=${preset.id}`));
    }
  });

  it('looks up normalized ids and current query overrides', () => {
    expect(weatherPresetById('  POST-RAIN ')?.id).toBe('post-rain');
    expect(weatherPresetById('storm')).toBeNull();
    expect(weatherPresetFromSearch('?skyTime=noon&skyWeather=snow')?.id).toBe('snow-light');
    expect(weatherPresetFromSearch('?skyWeather=fog')).toBeNull();
  });

  it('cycles in both directions and wraps at the ends', () => {
    expect(cycleWeatherPreset('clear').id).toBe('cloudy');
    expect(cycleWeatherPreset('clear', -1).id).toBe('snow-heavy');
    expect(cycleWeatherPreset('snow-heavy').id).toBe('clear');
    expect(cycleWeatherPreset('unknown').id).toBe('clear');
  });

  it('updates the weather query without dropping other debug controls', () => {
    const search = searchWithWeatherPreset('?skyTime=sunrise&skyDebug=', 'post-rain');
    const params = new URLSearchParams(search);
    expect(params.get('skyTime')).toBe('sunrise');
    expect(params.has('skyDebug')).toBe(true);
    expect(params.get('skyWeather')).toBe('post-rain');
  });
});
