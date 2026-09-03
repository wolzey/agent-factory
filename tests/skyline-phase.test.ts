import { describe, expect, it } from 'vitest';
import {
  paletteForElevation,
  phaseForElevation,
  rgbToCss,
  rgbToInt,
  skyStateFromSnapshot,
  snowCover01,
  sunAltitude01,
} from '../client/sky/skyPhase';
import { MOUNTAIN_DAYLIGHT_OFFSET_MINUTES, solarSnapshot, sunTimesForLocalDay } from '../client/sky/solar';

describe('phase names', () => {
  it('names night, dawn, day and sunset from elevation and direction', () => {
    expect(phaseForElevation(-20, true)).toBe('night');
    expect(phaseForElevation(-20, false)).toBe('night');
    expect(phaseForElevation(-2, true)).toBe('dawn');
    expect(phaseForElevation(-2, false)).toBe('sunset');
    expect(phaseForElevation(3, false)).toBe('sunset');
    expect(phaseForElevation(30, true)).toBe('day');
  });
});

describe('palette interpolation', () => {
  it('is continuous across every stop boundary', () => {
    for (const rising of [true, false]) {
      for (const boundary of [-12, -6, 0, 6, 15]) {
        const below = paletteForElevation(boundary - 0.001, rising);
        const above = paletteForElevation(boundary + 0.001, rising);
        for (let channel = 0; channel < 3; channel++) {
          expect(Math.abs(below.skyHorizon[channel] - above.skyHorizon[channel])).toBeLessThanOrEqual(1);
          expect(Math.abs(below.farRidge[channel] - above.farRidge[channel])).toBeLessThanOrEqual(1);
        }
        expect(Math.abs(below.lights - above.lights)).toBeLessThan(0.01);
      }
    }
  });

  it('dims city lights and stars as the sun climbs', () => {
    let previous = paletteForElevation(-20, true);
    for (let elevation = -18; elevation <= 30; elevation += 2) {
      const next = paletteForElevation(elevation, true);
      expect(next.lights).toBeLessThanOrEqual(previous.lights + 1e-9);
      expect(next.stars).toBeLessThanOrEqual(previous.stars + 1e-9);
      previous = next;
    }
    expect(paletteForElevation(-20, true).lights).toBe(1);
    expect(paletteForElevation(30, true).stars).toBe(0);
  });

  it('is warmer at dusk than at dawn on the horizon, and clamps outside the stops', () => {
    const dawn = paletteForElevation(0, true).skyHorizon;
    const dusk = paletteForElevation(0, false).skyHorizon;
    expect(dusk[0] - dusk[2]).toBeGreaterThan(dawn[0] - dawn[2]);
    expect(paletteForElevation(-90, true)).toEqual(paletteForElevation(-12, true));
    expect(paletteForElevation(90, true)).toEqual(paletteForElevation(24, true));
  });

  it('formats colours for canvas and Phaser', () => {
    expect(rgbToCss([255, 128, 0])).toBe('rgb(255, 128, 0)');
    expect(rgbToCss([255, 128, 0], 0.5)).toBe('rgba(255, 128, 0, 0.5)');
    expect(rgbToInt([0x12, 0x34, 0x56])).toBe(0x123456);
  });
});

describe('sun altitude mapping', () => {
  it('is monotonic, clears the ridge line by 8 degrees and tops out at the zenith', () => {
    expect(sunAltitude01(-5)).toBe(0);
    expect(sunAltitude01(0)).toBe(0);
    expect(sunAltitude01(8)).toBeCloseTo(0.78, 5);
    expect(sunAltitude01(73)).toBe(1);
    expect(sunAltitude01(90)).toBe(1);
    let previous = 0;
    for (let e = 0; e <= 80; e += 0.5) {
      const next = sunAltitude01(e);
      expect(next).toBeGreaterThanOrEqual(previous);
      previous = next;
    }
  });
});

describe('seasonal snow', () => {
  it('peaks in late January and bottoms out in late July', () => {
    expect(snowCover01(20)).toBeCloseTo(1, 3);
    expect(snowCover01(202)).toBeCloseTo(0, 2);
    expect(snowCover01(110)).toBeGreaterThan(0.3);
    expect(snowCover01(110)).toBeLessThan(0.7);
    expect(snowCover01(1)).toBeCloseTo(snowCover01(366), 1);
  });
});

describe('sky state from a solar snapshot', () => {
  const summer = sunTimesForLocalDay(2026, 7, 4, MOUNTAIN_DAYLIGHT_OFFSET_MINUTES);

  it('is day at noon with the sun high, no moon and no stars', () => {
    const state = skyStateFromSnapshot(solarSnapshot(summer.solarNoonMs));
    expect(state.phase).toBe('day');
    expect(state.sunVisible).toBe(true);
    expect(state.moonVisible).toBe(false);
    expect(state.sunAltitude01).toBeGreaterThan(0.9);
    expect(state.palette.stars).toBe(0);
    expect(state.snow01).toBeLessThan(0.15);
  });

  it('is sunset shortly after sundown with the moon rising and lights coming on', () => {
    const state = skyStateFromSnapshot(solarSnapshot(summer.sunsetMs + 20 * 60_000));
    expect(state.phase).toBe('sunset');
    expect(state.rising).toBe(false);
    expect(state.moonVisible).toBe(true);
    expect(state.sunProgress).toBe(1);
    expect(state.palette.lights).toBeGreaterThan(0.6);
  });

  it('is dawn shortly before sunrise and night in the small hours, with winter snow', () => {
    const winter = sunTimesForLocalDay(2026, 1, 15, -420);
    const dawn = skyStateFromSnapshot(solarSnapshot(winter.sunriseMs - 25 * 60_000));
    expect(dawn.phase).toBe('dawn');
    expect(dawn.rising).toBe(true);
    expect(dawn.snow01).toBeGreaterThan(0.95);

    const night = skyStateFromSnapshot(solarSnapshot(winter.sunriseMs - 5 * 3_600_000));
    expect(night.phase).toBe('night');
    expect(night.sunVisible).toBe(false);
    expect(night.moonVisible).toBe(true);
    expect(night.palette.stars).toBe(1);
    expect(night.moonProgress).toBeGreaterThan(0.5);
  });
});
