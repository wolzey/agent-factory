import { describe, expect, it } from 'vitest';
import { WeatherTransition, weatherLighting } from '../client/prototypes/factory25dWeatherState';
import { weatherPresetById, WEATHER_PRESETS } from '../client/sky/weatherPresets';
import { BackRainSim, GlassRainSim } from '../client/sky/rain';

const clear = weatherPresetById('clear')!.state;
const cloudy = weatherPresetById('cloudy')!.state;
const rain = weatherPresetById('rain-heavy')!.state;
const snow = weatherPresetById('snow-heavy')!.state;

describe('prototype weather lighting and transitions', () => {
  it('removes direct sun in storms while keeping diffuse room light', () => {
    expect(weatherLighting(clear).direct).toBe(1);
    expect(weatherLighting(cloudy).direct).toBeLessThan(0.25);
    for (const weather of [rain, snow]) {
      expect(weatherLighting(weather).direct).toBe(0);
      expect(weatherLighting(weather).window).toBeGreaterThan(0.4);
      expect(weatherLighting(weather).ambient).toBeGreaterThan(0.6);
    }
    expect(weatherLighting(snow).window).toBeGreaterThan(weatherLighting(rain).window);
  });

  it('keeps every preset light level within a usable range', () => {
    for (const preset of WEATHER_PRESETS) {
      for (const level of Object.values(weatherLighting(preset.state))) {
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(1);
      }
    }
  });

  it('continues from the visible mixture when the user changes presets quickly', () => {
    const transition = new WeatherTransition(clear);
    transition.select(rain, 100);
    const halfway = transition.at(1000);
    expect(halfway.rain01).toBeCloseTo(0.5);
    transition.select(snow, 1000);
    expect(transition.at(1000)).toEqual(halfway);
    expect(transition.at(1900).rain01).toBeGreaterThan(0);
    expect(transition.at(1900).snow01).toBeGreaterThan(0);
    expect(transition.at(2800)).toEqual(snow);
    expect(transition.isChanging(2800)).toBe(false);
  });

  it('lets wet glass drain after rain without spawning rain in clear weather', () => {
    const transition = new WeatherTransition(rain);
    const outside = new BackRainSim(160, 72);
    const glass = new GlassRainSim(160, 72);
    for (let frame = 0; frame < 180; frame += 1) {
      outside.step(1 / 30, rain);
      glass.step(1 / 30, rain);
    }
    expect(outside.streaks.length).toBeGreaterThan(0);
    expect(glass.isDry).toBe(false);
    transition.select(clear, 0);
    for (let frame = 1; frame <= 1800; frame += 1) {
      const weather = transition.at(frame * 1000 / 30);
      outside.step(1 / 30, weather);
      glass.step(1 / 30, weather);
    }
    expect(outside.streaks).toHaveLength(0);
    expect(glass.isDry).toBe(true);
    expect(transition.at(60_000)).toEqual(clear);
  });
});
