import { describe, expect, it } from 'vitest';
import { skyStateFromSnapshot } from '../client/sky/skyPhase';
import { solarSnapshot, sunTimesForLocalDay } from '../client/sky/solar';
import {
  CLEAR_WEATHER,
  cloudLayerWeights,
  lerpWeather,
  parseWeatherOverride,
  weatherFromOpenMeteo,
  weatheredSkyState,
} from '../client/sky/weather';

describe('sky weather overrides', () => {
  it('accepts named QA states and ignores unknown values', () => {
    expect(parseWeatherOverride('?skyWeather=rain')?.mode).toBe('rain');
    expect(parseWeatherOverride('?skyWeather=post-rain')?.wet01).toBeGreaterThan(0.8);
    expect(parseWeatherOverride('?skyWeather=storm')).toBeNull();
    expect(parseWeatherOverride('')).toBeNull();
  });
});

describe('Open-Meteo weather mapping', () => {
  it('maps rain, cloud, wind and wet glass into normalized values', () => {
    const weather = weatherFromOpenMeteo({
      current: { time: '2026-09-03T09:15', weather_code: 63, cloud_cover: 86, precipitation: 1.2, rain: 1.2, snowfall: 0, visibility: 7_000, wind_speed_10m: 24 },
      hourly: { time: ['2026-09-03T08:00', '2026-09-03T09:00'], precipitation: [0.4, 1.2] },
    });
    expect(weather.mode).toBe('rain');
    expect(weather.cloud01).toBeCloseTo(0.86);
    expect(weather.cloudForm01).toBeGreaterThan(0.9);
    expect(weather.rain01).toBeGreaterThan(0.8);
    expect(weather.snow01).toBe(0);
    expect(weather.wet01).toBe(1);
    expect(weather.wind01).toBeGreaterThan(0.5);
  });

  it('distinguishes snow showers from rain showers', () => {
    expect(weatherFromOpenMeteo({ current: { weather_code: 80 } }).mode).toBe('rain');
    expect(weatherFromOpenMeteo({ current: { weather_code: 85 } }).mode).toBe('snow');
  });

  it('detects post-rain wetness from past hours but ignores future rain', () => {
    const weather = weatherFromOpenMeteo({
      current: { time: '2026-09-03T09:15', weather_code: 1, cloud_cover: 25 },
      hourly: {
        time: ['2026-09-03T08:00', '2026-09-03T09:00', '2026-09-03T10:00'],
        precipitation: [0.7, 0, 3.5],
      },
    });
    expect(weather.mode).toBe('post-rain');
    expect(weather.wet01).toBe(1);
  });
});

describe('cloud form selection', () => {
  it('moves smoothly from wispy to puffy to storm clouds', () => {
    const cirrus = { ...CLEAR_WEATHER, cloud01: 0.3, cloudForm01: 0 };
    const cumulus = { ...CLEAR_WEATHER, cloud01: 0.7, cloudForm01: 0.5 };
    const storm = { ...CLEAR_WEATHER, cloud01: 1, cloudForm01: 1 };
    expect(cloudLayerWeights(cirrus)).toEqual([1, 0, 0]);
    expect(cloudLayerWeights(cumulus)).toEqual([0, 1, 0]);
    expect(cloudLayerWeights(storm)).toEqual([0, 0, 1]);
  });

  it('keeps light and heavy precipitation as ranges of the same live system', () => {
    const lightRain = parseWeatherOverride('?skyWeather=rain-light')!;
    const heavyRain = parseWeatherOverride('?skyWeather=rain-heavy')!;
    const lightSnow = parseWeatherOverride('?skyWeather=snow-light')!;
    const heavySnow = parseWeatherOverride('?skyWeather=snow-heavy')!;
    expect(heavyRain.rain01).toBeGreaterThan(lightRain.rain01);
    expect(heavySnow.snow01).toBeGreaterThan(lightSnow.snow01);
    expect(heavyRain.cloudForm01).toBeGreaterThan(lightRain.cloudForm01);
  });
});

describe('weather interpolation and palette', () => {
  it('eases every numeric channel continuously', () => {
    const rain = parseWeatherOverride('?skyWeather=rain')!;
    const halfway = lerpWeather(CLEAR_WEATHER, rain, 0.5);
    expect(halfway.rain01).toBeCloseTo(rain.rain01 / 2);
    expect(halfway.cloud01).toBeCloseTo(rain.cloud01 / 2);
    expect(lerpWeather(CLEAR_WEATHER, rain, -1)).toEqual(CLEAR_WEATHER);
    expect(lerpWeather(CLEAR_WEATHER, rain, 2)).toEqual(rain);
  });

  it('leaves clear daylight untouched and cools rainy daylight', () => {
    const noon = sunTimesForLocalDay(2026, 7, 4, -360).solarNoonMs;
    const state = skyStateFromSnapshot(solarSnapshot(noon));
    expect(weatheredSkyState(state, CLEAR_WEATHER).palette).toEqual(state.palette);
    const rainy = weatheredSkyState(state, parseWeatherOverride('?skyWeather=rain')!);
    expect(rainy.palette.skyTop[0] + rainy.palette.skyTop[1] + rainy.palette.skyTop[2])
      .toBeLessThan(state.palette.skyTop[0] + state.palette.skyTop[1] + state.palette.skyTop[2]);
    expect(rainy.palette.sunGlowStrength).toBeLessThan(state.palette.sunGlowStrength);
  });

  it('uses a cool blue-gray heavy daytime snow palette without turning white', () => {
    const noon = sunTimesForLocalDay(2026, 1, 15, -420).solarNoonMs;
    const state = skyStateFromSnapshot(solarSnapshot(noon));
    const snowy = weatheredSkyState(state, parseWeatherOverride('?skyWeather=snow-heavy')!);
    expect(snowy.palette.skyTop[2]).toBeGreaterThan(snowy.palette.skyTop[0] + 25);
    expect(snowy.palette.skyTop[0]).toBeGreaterThan(125);
    expect(snowy.palette.skyTop[2]).toBeLessThan(205);
    expect(snowy.palette.cloud[2]).toBeGreaterThan(snowy.palette.cloud[0] + 10);
    expect(snowy.palette.nearRidge[0]).toBeGreaterThan(150);
  });
});
