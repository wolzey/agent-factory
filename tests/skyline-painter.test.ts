import { describe, expect, it } from 'vitest';
import {
  PixelBuffer,
  createSkylineGeometry,
  metricsFor,
  paintCloudBand,
  paintSkyline,
  paintWindowWeather,
  snowColors,
  sunX,
  sunY,
} from '../client/sky/skylinePainter';
import { skylineWindowRect } from '../client/scenes/viewport';
import { lerpRgb, skyStateFromSnapshot } from '../client/sky/skyPhase';
import { MOUNTAIN_DAYLIGHT_OFFSET_MINUTES, MOUNTAIN_STANDARD_OFFSET_MINUTES, solarSnapshot, sunTimesForLocalDay } from '../client/sky/solar';

const WIDTH = skylineWindowRect().width;
const HEIGHT = skylineWindowRect().height;
const PANES = 6;

function render(nowMs: number) {
  const geometry = createSkylineGeometry(WIDTH, HEIGHT);
  const state = skyStateFromSnapshot(solarSnapshot(nowMs));
  const pixels = new PixelBuffer(WIDTH, HEIGHT);
  paintSkyline(pixels, geometry, state, PANES);
  return { geometry, state, pixels };
}

describe('skyline geometry', () => {
  it('is deterministic and stays inside the glass', () => {
    const a = createSkylineGeometry(WIDTH, HEIGHT);
    const b = createSkylineGeometry(WIDTH, HEIGHT);
    expect(Array.from(a.farRidge.heights)).toEqual(Array.from(b.farRidge.heights));
    expect(a.stars).toEqual(b.stars);
    expect(a.buildings).toEqual(b.buildings);
    expect(a.buildingSource).toBe('default');
    expect(a.horizonRow).toBeLessThan(a.nearBaseRow);
    expect(a.nearBaseRow).toBeLessThan(HEIGHT);
    expect(Math.max(...a.farRidge.heights)).toBeLessThanOrEqual(a.horizonRow);
    // The hero range is tall; the distant range stays deliberately lower.
    expect(Math.max(...a.midRidge.heights)).toBeGreaterThanOrEqual(HEIGHT * 0.45);
    expect(Math.max(...a.farRidge.heights)).toBeLessThan(Math.max(...a.midRidge.heights));
    expect(a.metrics.midRidgeMax).toBeGreaterThan(a.metrics.farRidgeMax);
    expect(a.metrics.farRidgeMax).toBeGreaterThan(a.metrics.nearRidgeMax);
    const valleyX = Math.round(WIDTH * 0.54);
    expect(a.midRidge.heights[valleyX]).toBeLessThan(Math.max(...a.midRidge.heights) * 0.5);
    for (const star of a.stars) {
      expect(star.x).toBeLessThan(WIDTH);
      expect(star.y).toBeLessThan(a.horizonRow);
    }
  });

  it('honours a custom building source through the data hook', () => {
    const geometry = createSkylineGeometry(WIDTH, HEIGHT, 1, {
      buildings: () => [{ x: 5, width: 10, height: 8, roof: 'flat', lit: 1, seed: 7, facade: 0.5, windows: 'grid', setback: 0, antenna: false, sign: null }],
    });
    expect(geometry.buildingSource).toBe('custom');
    expect(geometry.buildings).toHaveLength(1);
  });
});

describe('glass painting', () => {
  const summer = sunTimesForLocalDay(2026, 7, 4, MOUNTAIN_DAYLIGHT_OFFSET_MINUTES);
  const winter = sunTimesForLocalDay(2026, 1, 15, MOUNTAIN_STANDARD_OFFSET_MINUTES);

  it('paints every pixel opaque and identically for the same instant', () => {
    const { pixels } = render(summer.solarNoonMs);
    for (let i = 3; i < pixels.data.length; i += 4) expect(pixels.data[i]).toBe(255);
    expect(Array.from(render(summer.solarNoonMs).pixels.data)).toEqual(Array.from(pixels.data));
  });

  it('puts the sun high in the middle at solar noon and paints a bright blue sky', () => {
    const { geometry, state, pixels } = render(summer.solarNoonMs);
    expect(state.phase).toBe('day');
    const cx = sunX(geometry, state);
    const cy = sunY(geometry, state);
    expect(Math.abs(cx - WIDTH / 2)).toBeLessThan(40);
    expect(cy).toBeLessThan(HEIGHT * 0.12);
    const [r, g, b] = pixels.get(cx, cy);
    expect(r).toBeGreaterThan(240);
    expect(g).toBeGreaterThan(220);
    const [skyR, , skyB] = pixels.get(40, 1);
    expect(skyB).toBeGreaterThan(skyR + 60);
  });

  it('uses ordered pixel dithering rather than flat horizontal sky bands', () => {
    const { geometry, pixels } = render(summer.solarNoonMs);
    const y = Math.max(2, Math.round(geometry.horizonRow * 0.35));
    const colors = new Set<string>();
    for (let x = 10; x < 90; x++) colors.add(pixels.get(x, y).slice(0, 3).join(','));
    expect(colors.size).toBeGreaterThan(1);
  });

  it('sets the sun low on the left at sunrise and on the right at sunset', () => {
    const dawn = render(summer.sunriseMs + 10 * 60_000);
    const dusk = render(summer.sunsetMs - 10 * 60_000);
    expect(dawn.state.phase).toBe('dawn');
    expect(dusk.state.phase).toBe('sunset');
    expect(sunX(dawn.geometry, dawn.state)).toBeLessThan(WIDTH * 0.1);
    expect(sunX(dusk.geometry, dusk.state)).toBeGreaterThan(WIDTH * 0.9);
    expect(sunY(dawn.geometry, dawn.state)).toBeGreaterThan(dawn.geometry.horizonRow * 0.85);
    // The dusk sky is much warmer than the noon sky at the same spot above the ridges.
    const noon = render(summer.solarNoonMs);
    const warmth = (pixels: PixelBuffer) => {
      const [r, , b] = pixels.get(WIDTH - 120, 1);
      return r - b;
    };
    expect(warmth(dusk.pixels)).toBeGreaterThan(warmth(noon.pixels) + 50);
  });

  it('lights the city at night and darkens it by day', () => {
    const night = render(winter.sunriseMs - 5 * 3_600_000);
    const day = render(summer.solarNoonMs);
    expect(night.state.phase).toBe('night');
    const litWindowPixels = (buffer: PixelBuffer) => {
      let count = 0;
      for (let y = night.geometry.nearBaseRow + 1; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          const [r, g, b] = buffer.get(x, y);
          if (r > 200 && g > 160 && b < 160) count++;
        }
      }
      return count;
    };
    expect(litWindowPixels(night.pixels)).toBeGreaterThan(WIDTH * 0.5);
    expect(litWindowPixels(day.pixels)).toBe(0);
    // Deep night sky at the top, and the sun is not drawn.
    const [r, g, b] = night.pixels.get(3, 2);
    expect(r + g + b).toBeLessThan(120);
    expect(night.state.sunVisible).toBe(false);
  });

  it('carries more snow on the far ridge in January than in July', () => {
    const snowPixels = (nowMs: number) => {
      const { geometry, state, pixels } = render(nowMs);
      const { lit, shade } = snowColors(state.palette);
      const matches = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
      let count = 0;
      for (let x = 0; x < WIDTH; x++) {
        for (let y = 0; y <= geometry.horizonRow; y++) {
          const px = pixels.get(x, y);
          if (matches(px, lit) || matches(px, shade)) count++;
        }
      }
      return count;
    };
    const january = snowPixels(winter.solarNoonMs);
    const july = snowPixels(summer.solarNoonMs);
    expect(january).toBeGreaterThan(july + 100);
    expect(july).toBeLessThan(10);
  });
});

describe('landmass continuity', () => {
  it('fills every column from the ridge line to the sill with land, never sky, including between buildings', () => {
    const noon = sunTimesForLocalDay(2026, 7, 4, MOUNTAIN_DAYLIGHT_OFFSET_MINUTES).solarNoonMs;
    const { geometry, state, pixels } = render(noon);
    const p = state.palette;
    const skyBands = Array.from({ length: 8 }, (_, k) => lerpRgb(p.skyTop, p.skyHorizon, k / 7));
    const isSky = (px: readonly number[]) =>
      skyBands.some(sky => Math.abs(px[0] - sky[0]) + Math.abs(px[1] - sky[1]) + Math.abs(px[2] - sky[2]) < 12);
    // Columns in the gaps between buildings, plus the very edges of the glass.
    const gapColumns = new Set<number>([0, WIDTH - 1]);
    for (let i = 0; i < geometry.buildings.length - 1; i++) {
      const b = geometry.buildings[i];
      for (let x = b.x + b.width; x < geometry.buildings[i + 1].x; x++) gapColumns.add(x);
    }
    expect(gapColumns.size).toBeGreaterThan(20);
    for (const x of gapColumns) {
      for (let y = geometry.horizonRow; y < HEIGHT; y++) {
        const px = pixels.get(x, y);
        expect(px[3]).toBe(255);
        expect(isSky(px)).toBe(false);
      }
    }
    // The land darkens toward the sill so it reads as a valley, not a flat slab.
    const x = [...gapColumns].find(c => c > 20 && c < WIDTH - 20)!;
    const upper = pixels.get(x, geometry.nearBaseRow + 1);
    const lower = pixels.get(x, HEIGHT - 1);
    expect(lower[0] + lower[1] + lower[2]).toBeLessThan(upper[0] + upper[1] + upper[2]);
  });
});

describe('size metrics', () => {
  it('scale the art with the glass height and never shrink below the 36px tuning', () => {
    const small = metricsFor(36);
    const large = metricsFor(HEIGHT);
    expect(small.sunRadius).toBe(3);
    expect(small.windowCell).toBe(1);
    expect(large.sunRadius).toBeGreaterThan(small.sunRadius);
    expect(large.farRidgeMax).toBeGreaterThan(small.farRidgeMax * 2);
    expect(large.windowCell).toBe(2);
    expect(large.starCount).toBeGreaterThan(small.starCount);
    expect(large.buildings.maxHeight).toBeLessThan(HEIGHT * 0.5);
    expect(metricsFor(10)).toEqual(small);
  });
});

describe('cloud band', () => {
  it('is transparent except for the clouds and tints with the palette', () => {
    const geometry = createSkylineGeometry(WIDTH, HEIGHT);
    const bandHeight = geometry.metrics.cloudBandHeight;
    const day = skyStateFromSnapshot(solarSnapshot(sunTimesForLocalDay(2026, 7, 4, -360).solarNoonMs));
    const band = new PixelBuffer(WIDTH, bandHeight);
    paintCloudBand(band, geometry, day);
    let opaque = 0;
    for (let i = 3; i < band.data.length; i += 4) if (band.data[i] > 0) opaque++;
    expect(opaque).toBeGreaterThan(50);
    expect(opaque).toBeLessThan(WIDTH * bandHeight * 0.25);
    const cloud = geometry.clouds[0];
    const [r, g, b, a] = band.get(cloud.x + 2 * cloud.unit, cloud.y + cloud.unit);
    expect(a).toBeGreaterThan(100);
    expect(r + g + b).toBeGreaterThan(600);
  });
});

describe('window weather layer', () => {
  it('keeps clear glass transparent and paints wet glints in front of the scene', () => {
    const geometry = createSkylineGeometry(WIDTH, HEIGHT);
    const state = skyStateFromSnapshot(solarSnapshot(sunTimesForLocalDay(2026, 7, 4, -360).solarNoonMs));
    const clear = new PixelBuffer(WIDTH, HEIGHT);
    paintWindowWeather(clear, geometry, state, { mode: 'clear', cloud01: 0, cloudForm01: 0, rain01: 0, snow01: 0, fog01: 0, wet01: 0, wind01: 0.1 }, 0.3);
    expect(clear.data.some((value, index) => index % 4 === 3 && value > 0)).toBe(false);

    const rain = new PixelBuffer(WIDTH, HEIGHT);
    paintWindowWeather(rain, geometry, state, { mode: 'rain', cloud01: 1, cloudForm01: 1, rain01: 0.85, snow01: 0, fog01: 0.2, wet01: 1, wind01: 0.5 }, 0.3);
    // Only the wet glints are static; moving rain is simulated per frame in rain.ts.
    const lit = rain.data.filter((value, index) => index % 4 === 3 && value > 0).length;
    expect(lit).toBeGreaterThan(4);
    expect(lit).toBeLessThan(WIDTH * 0.1);
  });

  it('paints compact foreground snowflakes without long shooting-star streaks', () => {
    const geometry = createSkylineGeometry(WIDTH, HEIGHT);
    const state = skyStateFromSnapshot(solarSnapshot(sunTimesForLocalDay(2026, 7, 4, -360).solarNoonMs));
    const snow = new PixelBuffer(WIDTH, HEIGHT);
    paintWindowWeather(snow, geometry, state, { mode: 'snow', cloud01: 0.92, cloudForm01: 0.9, rain01: 0, snow01: 0.78, fog01: 0.4, wet01: 0, wind01: 0.34 }, 0.3);

    let lit = 0;
    let longestVerticalRun = 0;
    for (let x = 0; x < WIDTH; x++) {
      let run = 0;
      for (let y = 0; y < HEIGHT; y++) {
        if (snow.get(x, y)[3] > 100) {
          lit++;
          run++;
          longestVerticalRun = Math.max(longestVerticalRun, run);
        } else {
          run = 0;
        }
      }
    }
    expect(lit).toBeGreaterThan(10);
    expect(longestVerticalRun).toBeLessThanOrEqual(2);
  });
});
