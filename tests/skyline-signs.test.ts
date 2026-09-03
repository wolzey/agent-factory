import { describe, expect, it } from 'vitest';
import {
  PLACEHOLDER_GLYPHS,
  PixelBuffer,
  buildRidge,
  buildingTiers,
  createSkylineGeometry,
  paintSkyline,
  placeholderGlyph,
  signLayout,
  textBitmap,
} from '../client/sky/skylinePainter';
import { sanitizeSign, sanitizeSkyline, signKind } from '../client/sky/skylineData';
import type { SkylineBuilding } from '../client/sky/skylineData';
import { skyStateFromSnapshot } from '../client/sky/skyPhase';
import { solarSnapshot, sunTimesForLocalDay } from '../client/sky/solar';
import { skylineWindowRect } from '../client/scenes/viewport';

const WIDTH = skylineWindowRect().width;
const HEIGHT = skylineWindowRect().height;
const NIGHT = sunTimesForLocalDay(2026, 1, 15, -420).sunriseMs - 5 * 3_600_000;

function building(overrides: Partial<SkylineBuilding>): SkylineBuilding {
  return {
    x: 300, width: 40, height: 40, roof: 'flat', lit: 0.5, seed: 11,
    facade: 0.5, windows: 'grid', setback: 0, antenna: false, sign: {},
    ...overrides,
  };
}

function renderWith(buildings: SkylineBuilding[]) {
  const geometry = createSkylineGeometry(WIDTH, HEIGHT, 1, { buildings: () => buildings });
  const state = skyStateFromSnapshot(solarSnapshot(NIGHT));
  const pixels = new PixelBuffer(WIDTH, HEIGHT);
  paintSkyline(pixels, geometry, state, 6);
  return { geometry, state, pixels };
}

describe('sign data hook: authoritative data present', () => {
  it('renders a supplied label in the pixel font on the building', () => {
    const b = building({ sign: { label: 'Acme Co', color: [0, 255, 200] } });
    const { geometry, pixels } = renderWith([b]);
    const drawn = geometry.buildings[0];
    expect(signKind(drawn.sign)).toBe('label');
    expect(drawn.sign?.label).toBe('ACME CO');
    const layout = signLayout(drawn, buildingTiers(drawn, HEIGHT, geometry.metrics.windowCell))!;
    expect(layout.kind).toBe('label');
    expect(layout.bitmap[0]).toHaveLength(textBitmap('ACME CO')[0].length);
    // Lit glyph pixels carry the accent: strongly green/cyan against a dark panel.
    let accentPixels = 0;
    for (let r = 0; r < layout.bitmap.length; r++) {
      for (let c = 0; c < layout.bitmap[r].length; c++) {
        if (!layout.bitmap[r][c]) continue;
        const [red, green, blue] = pixels.get(layout.x + 2 + c, layout.y + 2 + r);
        if (green > 150 && green > red + 60 && blue > 100) accentPixels++;
      }
    }
    expect(accentPixels).toBeGreaterThan(20);
  });

  it('renders a supplied logo bitmap exactly', () => {
    const logo = ['#.#.#', '.#.#.', '#.#.#'];
    const b = building({ sign: { logo, color: [255, 0, 0] } });
    const { geometry, pixels } = renderWith([b]);
    const drawn = geometry.buildings[0];
    expect(signKind(drawn.sign)).toBe('logo');
    const layout = signLayout(drawn, buildingTiers(drawn, HEIGHT, geometry.metrics.windowCell))!;
    expect(layout.kind).toBe('logo');
    expect(layout.width).toBe(5 + 4);
    expect(layout.height).toBe(3 + 4);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        const [red, green] = pixels.get(layout.x + 2 + c, layout.y + 2 + r);
        if (logo[r][c] === '#') expect(red).toBeGreaterThan(green + 100);
        else expect(red).toBeLessThan(120);
      }
    }
  });

  it('mounts an oversized sign as a rooftop billboard instead of dropping it', () => {
    const b = building({ width: 12, height: 30, sign: { label: 'LONG NAME 12' } });
    const tiers = buildingTiers(b, HEIGHT, 2);
    const layout = signLayout(b, tiers)!;
    expect(layout.rooftop).toBe(true);
    expect(layout.y + layout.height).toBeLessThan(tiers[tiers.length - 1].top);
  });
});

describe('sign data hook: fallback', () => {
  it('shows abstract placeholder glyphs with no letters when no data is supplied', () => {
    const geometry = createSkylineGeometry(WIDTH, HEIGHT);
    expect(geometry.buildingSource).toBe('default');
    const kinds = geometry.buildings.map(b => signKind(b.sign));
    expect(kinds).toContain('placeholder');
    expect(kinds).not.toContain('label');
    expect(kinds).not.toContain('logo');
    for (const glyph of PLACEHOLDER_GLYPHS) {
      expect(glyph).toHaveLength(5);
      for (const row of glyph) expect(row).toMatch(/^[#.]{7}$/);
    }
    // Every placeholder resolves to one of the abstract glyphs, never the text font.
    for (const b of geometry.buildings) {
      if (!b.sign) continue;
      const bitmap = placeholderGlyph(b.seed);
      expect(bitmap).toHaveLength(5);
      expect(bitmap[0]).toHaveLength(7);
    }
  });

  it('degrades unusable supplied labels and logos to placeholders', () => {
    expect(sanitizeSign({ label: 'this label is far too long for a sign' })).toEqual({});
    expect(sanitizeSign({ label: '!!!' })).toEqual({});
    expect(sanitizeSign({ logo: ['#..', '#'] })).toEqual({});
    expect(sanitizeSign({ logo: ['...', '...'] })).toEqual({});
    expect(sanitizeSign({ logo: ['#x#'] })).toEqual({});
    expect(sanitizeSign({ label: 'ok', color: [999, 0, 0] })).toEqual({ label: 'OK' });
    expect(sanitizeSign(null)).toBeNull();
    expect(sanitizeSign('nope')).toBeNull();
    const [clean] = sanitizeSkyline([building({ sign: { label: 'x'.repeat(40) } })], WIDTH, { minWidth: 1, maxWidth: 100, minHeight: 1, maxHeight: 100, gap: 1 });
    expect(signKind(clean.sign)).toBe('placeholder');
  });

  it('draws the placeholder panel in a neutral accent at night', () => {
    const b = building({ sign: {} });
    const { geometry, pixels } = renderWith([b]);
    const drawn = geometry.buildings[0];
    const layout = signLayout(drawn, buildingTiers(drawn, HEIGHT, geometry.metrics.windowCell))!;
    expect(layout.kind).toBe('placeholder');
    let bright = 0;
    for (let r = 0; r < layout.bitmap.length; r++) {
      for (let c = 0; c < layout.bitmap[r].length; c++) {
        if (!layout.bitmap[r][c]) continue;
        const [red, green, blue] = pixels.get(layout.x + 2 + c, layout.y + 2 + r);
        if (red + green + blue > 300) bright++;
      }
    }
    expect(bright).toBeGreaterThan(5);
  });
});

describe('pixel font', () => {
  it('lays out 3x5 glyphs with a one pixel gap', () => {
    const bitmap = textBitmap('AB');
    expect(bitmap).toHaveLength(5);
    expect(bitmap[0]).toHaveLength(7);
    expect(textBitmap('I')[0]).toEqual([true, true, true]);
    expect(textBitmap('I')[1]).toEqual([false, true, false]);
  });
});

describe('ridge shapes', () => {
  it('produces irregular profiles rather than repeated smooth triangles', () => {
    const ridge = buildRidge(768, 5, { massifs: 6, minHeight: 20, maxHeight: 47, roughness: 0.06 });
    const h = Array.from(ridge.heights);
    expect(Math.max(...h)).toBeLessThanOrEqual(47);
    expect(Math.max(...h)).toBeGreaterThan(35);
    // Count direction changes: a handful of triangles would give ~12, a jagged range far more.
    let turns = 0;
    let last = Math.sign(h[1] - h[0]);
    for (let x = 2; x < h.length; x++) {
      const dir = Math.sign(h[x] - h[x - 1]);
      if (dir !== 0 && dir !== last) { turns++; last = dir; }
    }
    expect(turns).toBeGreaterThan(40);
    // Snow line varies along the range and some columns carry drifts.
    const noise = Array.from(ridge.snowNoise);
    expect(Math.max(...noise) - Math.min(...noise)).toBeGreaterThan(4);
    expect(Array.from(ridge.snowFingers).filter(f => f > 0).length).toBeGreaterThan(30);
  });

  it('splits tall set-back buildings into narrowing tiers', () => {
    const tiers = buildingTiers(building({ width: 30, height: 40, setback: 2 }), 100, 2);
    expect(tiers.length).toBe(3);
    expect(tiers[0].width).toBeGreaterThan(tiers[1].width);
    expect(tiers[1].width).toBeGreaterThan(tiers[2].width);
    expect(tiers[2].top).toBe(60);
    expect(buildingTiers(building({ width: 30, height: 40, setback: 0 }), 100, 2)).toHaveLength(1);
  });
});
