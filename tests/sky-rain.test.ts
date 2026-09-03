import { describe, expect, it } from 'vitest';
import {
  BackRainSim,
  GLASS_SPLAT_S,
  GlassRainSim,
  MAX_GLASS_DROPS,
  OUTSIDE_RAIN_DEPTH_OFFSET,
  paintBackRain,
  paintGlassRain,
} from '../client/sky/rain';
import { PixelBuffer } from '../client/sky/skylinePainter';
import { skyStateFromSnapshot } from '../client/sky/skyPhase';
import { solarSnapshot } from '../client/sky/solar';
import { CLEAR_WEATHER, parseWeatherOverride } from '../client/sky/weather';
import type { WeatherVisualState } from '../client/sky/weather';

const WIDTH = 240;
const HEIGHT = 60;
const RAIN = parseWeatherOverride('?skyWeather=rain')!;
const SNOW = parseWeatherOverride('?skyWeather=snow')!;
const NOON = Date.UTC(2026, 8, 3, 19, 0);
const palette = skyStateFromSnapshot(solarSnapshot(NOON)).palette;

function run(sim: { step(dt: number, w: WeatherVisualState): void }, seconds: number, weather: WeatherVisualState, fps = 60) {
  const frames = Math.round(seconds * fps);
  for (let i = 0; i < frames; i++) sim.step(1 / fps, weather);
}

function litPixels(pixels: PixelBuffer): number {
  let count = 0;
  for (let i = 3; i < pixels.data.length; i += 4) if (pixels.data[i] > 0) count++;
  return count;
}

describe('glass rain', () => {
  it('stays dry and paints nothing in clear weather', () => {
    const sim = new GlassRainSim(WIDTH, HEIGHT);
    run(sim, 3, CLEAR_WEATHER);
    expect(sim.drops).toHaveLength(0);
    expect(sim.isDry).toBe(true);
    const pixels = new PixelBuffer(WIDTH, HEIGHT);
    paintGlassRain(pixels, sim, palette);
    expect(litPixels(pixels)).toBe(0);
  });

  it('is deterministic for a given seed', () => {
    const a = new GlassRainSim(WIDTH, HEIGHT, 7);
    const b = new GlassRainSim(WIDTH, HEIGHT, 7);
    run(a, 2, RAIN);
    run(b, 2, RAIN);
    expect(a.drops).toEqual(b.drops);
  });

  it('spawns drops that cling, then run down the glass leaving a trail', () => {
    const sim = new GlassRainSim(WIDTH, HEIGHT);
    run(sim, 0.5, RAIN);
    expect(sim.drops.length).toBeGreaterThan(0);
    // The newest drop is still clinging just after impact.
    const first = sim.drops[sim.drops.length - 1];
    const start = { x: first.x, y: first.y };
    expect(first.age).toBeLessThan(first.dwell);
    expect(first.vy).toBe(0);

    run(sim, 2.5, RAIN);
    // The tracked drop has either run off the bottom or moved down from where it landed.
    const still = sim.drops.find(d => d === first);
    if (still) expect(still.y).toBeGreaterThan(start.y);
    let wetCount = 0;
    for (let i = 0; i < sim.wet.length; i++) if (sim.wet[i] > 0) wetCount++;
    expect(wetCount).toBeGreaterThan(20);
    expect(sim.isDry).toBe(false);
  });

  it('never exceeds the drop cap and dries out after the rain stops', () => {
    const sim = new GlassRainSim(WIDTH, HEIGHT);
    run(sim, 6, RAIN);
    expect(sim.drops.length).toBeLessThanOrEqual(MAX_GLASS_DROPS);
    run(sim, 15, CLEAR_WEATHER);
    expect(sim.drops).toHaveLength(0);
    expect(sim.isDry).toBe(true);
  });

  it('clamps a huge frame step so a tab that was hidden does not explode the sim', () => {
    const sim = new GlassRainSim(WIDTH, HEIGHT);
    sim.step(30, RAIN);
    expect(sim.drops.length).toBeLessThanOrEqual(MAX_GLASS_DROPS);
    for (const drop of sim.drops) {
      expect(drop.y).toBeLessThanOrEqual(HEIGHT + 2);
      expect(Number.isFinite(drop.x)).toBe(true);
    }
  });

  it('paints a splat on impact and a bead afterwards, both inside the glass', () => {
    const sim = new GlassRainSim(WIDTH, HEIGHT);
    run(sim, 0.5, RAIN);
    const splat = new PixelBuffer(WIDTH, HEIGHT);
    paintGlassRain(splat, sim, palette);
    expect(litPixels(splat)).toBeGreaterThan(0);
    // The most recent arrival is still in its impact splat.
    expect(sim.drops[sim.drops.length - 1].age).toBeLessThan(GLASS_SPLAT_S);

    run(sim, 0.2, RAIN);
    const beads = new PixelBuffer(WIDTH, HEIGHT);
    paintGlassRain(beads, sim, palette);
    expect(litPixels(beads)).toBeGreaterThan(0);
  });
});

describe('back rain', () => {
  it('composites readable streaks in front of the nearest mountain pass', () => {
    expect(OUTSIDE_RAIN_DEPTH_OFFSET).toBeGreaterThan(0.15);
    expect(OUTSIDE_RAIN_DEPTH_OFFSET).toBeLessThan(0.3);
  });
  it('has no streaks in clear weather and fills in with rain', () => {
    const sim = new BackRainSim(WIDTH, HEIGHT);
    sim.step(1 / 60, CLEAR_WEATHER);
    expect(sim.streaks).toHaveLength(0);
    sim.step(1 / 60, RAIN);
    expect(sim.streaks.length).toBeGreaterThan(WIDTH * 0.1);
    sim.step(1 / 60, CLEAR_WEATHER);
    expect(sim.streaks).toHaveLength(0);
  });

  it('turns distant snowfall into atmosphere instead of streaks behind the mountains', () => {
    const sim = new BackRainSim(WIDTH, HEIGHT);
    sim.step(1, SNOW);
    expect(sim.streaks).toHaveLength(0);
  });

  it('keeps every streak on the glass while falling and wrapping, with no global reset', () => {
    const sim = new BackRainSim(WIDTH, HEIGHT);
    sim.step(1 / 60, RAIN);
    const snapshot = () => sim.streaks.map(s => s.y);
    let previous = snapshot();
    for (let frame = 0; frame < 600; frame++) {
      sim.step(1 / 60, RAIN);
      const current = snapshot();
      // At most a handful of streaks recycle per frame; the rest keep falling.
      const recycled = current.filter((y, i) => y < previous[i]).length;
      expect(recycled).toBeLessThan(sim.streaks.length * 0.25);
      for (const streak of sim.streaks) {
        expect(streak.x).toBeGreaterThanOrEqual(0);
        expect(streak.x).toBeLessThan(WIDTH);
        expect(streak.y - streak.length).toBeLessThanOrEqual(HEIGHT);
      }
      previous = current;
    }
  });

  it('leans streaks with the wind and paints them into a transparent buffer', () => {
    const sim = new BackRainSim(WIDTH, HEIGHT);
    const windy: WeatherVisualState = { ...RAIN, wind01: 1 };
    const calm: WeatherVisualState = { ...RAIN, wind01: 0 };
    expect(sim.slant(windy)).toBeGreaterThan(sim.slant(calm));
    sim.step(1 / 60, windy);
    const pixels = new PixelBuffer(WIDTH, HEIGHT);
    paintBackRain(pixels, sim, palette, windy);
    expect(litPixels(pixels)).toBeGreaterThan(sim.streaks.length);
  });
});
