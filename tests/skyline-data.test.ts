import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SKYLINE_BOUNDS,
  createSeededRandom,
  generateSkyline,
  resolveSkyline,
  sanitizeSkyline,
  signKind,
} from '../client/sky/skylineData';
import type { SkylineBuilding } from '../client/sky/skylineData';
import { prefersReducedMotion } from '../client/sky/motion';

describe('seeded random', () => {
  it('replays the same sequence for the same seed and differs across seeds', () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    const c = createSeededRandom(43);
    const seqA = Array.from({ length: 5 }, a);
    expect(seqA).toEqual(Array.from({ length: 5 }, b));
    expect(seqA).not.toEqual(Array.from({ length: 5 }, c));
    for (const value of seqA) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('generated skyline', () => {
  const width = 768;

  it('is deterministic and fills the window without overlapping or spilling', () => {
    const first = generateSkyline(width);
    expect(first).toEqual(generateSkyline(width));
    expect(first.length).toBeGreaterThan(40);
    for (let i = 0; i < first.length; i++) {
      const b = first[i];
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(width);
      expect(b.height).toBeGreaterThanOrEqual(DEFAULT_SKYLINE_BOUNDS.minHeight);
      expect(b.height).toBeLessThanOrEqual(DEFAULT_SKYLINE_BOUNDS.maxHeight);
      if (i > 0) expect(b.x).toBeGreaterThanOrEqual(first[i - 1].x + first[i - 1].width);
    }
    expect(first[first.length - 1].x + first[first.length - 1].width).toBeGreaterThan(width - DEFAULT_SKYLINE_BOUNDS.maxWidth - 2);
  });

  it('carries no names, labels or logos', () => {
    const buildings = generateSkyline(width);
    for (const building of buildings) {
      expect(Object.keys(building).sort()).toEqual(['antenna', 'facade', 'height', 'lit', 'roof', 'seed', 'setback', 'sign', 'width', 'windows', 'x']);
      if (building.sign) {
        expect(building.sign.label).toBeUndefined();
        expect(building.sign.logo).toBeUndefined();
        expect(signKind(building.sign)).toBe('placeholder');
      }
    }
    expect(buildings.some(b => b.sign !== null)).toBe(true);
    expect(buildings.some(b => b.setback > 0)).toBe(true);
    expect(new Set(buildings.map(b => b.windows)).size).toBeGreaterThan(2);
  });
});

describe('resolveSkyline data hook', () => {
  const width = 200;

  it('uses the default skyline when no source is given', () => {
    const resolved = resolveSkyline(width);
    expect(resolved.source).toBe('default');
    expect(resolved.buildings).toEqual(generateSkyline(width));
  });

  it('uses a valid custom source', () => {
    const custom: SkylineBuilding[] = [
      { x: 10, width: 8, height: 9, roof: 'spire', lit: 0.5, seed: 1, facade: 0.5, windows: 'grid', setback: 0, antenna: false, sign: null },
      { x: 0, width: 6, height: 5, roof: 'flat', lit: 0.2, seed: 2, facade: 0.5, windows: 'grid', setback: 0, antenna: false, sign: null },
    ];
    const resolved = resolveSkyline(width, { buildings: () => custom });
    expect(resolved.source).toBe('custom');
    expect(resolved.buildings.map(b => b.x)).toEqual([0, 10]);
  });

  it('falls back when the source throws, returns nothing, or returns only junk', () => {
    expect(resolveSkyline(width, { buildings: () => { throw new Error('offline'); } }).source).toBe('default');
    expect(resolveSkyline(width, { buildings: () => [] }).source).toBe('default');
    const junk = [{ x: Number.NaN, width: 4, height: 4 }, { x: 500, width: 4, height: 4 }, { x: 4, width: -1, height: 4 }] as SkylineBuilding[];
    expect(resolveSkyline(width, { buildings: () => junk }).source).toBe('default');
  });

  it('clamps out-of-range custom buildings into the window', () => {
    const wild = [
      { x: 190, width: 40, height: 400, roof: 'dome', lit: 7, seed: 3 },
      { x: -5, width: 4, height: 0.2, roof: 'flat', lit: -1, seed: 4 },
    ] as unknown as SkylineBuilding[];
    const clean = sanitizeSkyline(wild, width);
    expect(clean).toEqual([
      { x: 0, width: 4, height: DEFAULT_SKYLINE_BOUNDS.minHeight, roof: 'flat', lit: 0, seed: 4, facade: 0.5, windows: 'grid', setback: 0, antenna: false, sign: null },
      { x: 190, width: 10, height: DEFAULT_SKYLINE_BOUNDS.maxHeight, roof: 'flat', lit: 1, seed: 3, facade: 0.5, windows: 'grid', setback: 0, antenna: false, sign: null },
    ]);
  });
});

describe('prefersReducedMotion', () => {
  it('is false without matchMedia and reflects the query when present', () => {
    expect(prefersReducedMotion(undefined)).toBe(false);
    expect(prefersReducedMotion(() => ({ matches: true }))).toBe(true);
    expect(prefersReducedMotion(() => ({ matches: false }))).toBe(false);
    expect(prefersReducedMotion(() => null)).toBe(false);
    expect(prefersReducedMotion(() => { throw new Error('boom'); })).toBe(false);
  });
});

describe('sky clock override', () => {
  it('uses real time without a skyTime parameter and freezes on a valid one', async () => {
    const { formatMountainClock, resolveSkyClock, parseSkyTime } = await import('../client/sky/clock');
    const fallback = () => 1234;
    expect(resolveSkyClock('', fallback)()).toBe(1234);
    expect(resolveSkyClock('?other=1', fallback)()).toBe(1234);
    expect(resolveSkyClock('?skyTime=nonsense', fallback)()).toBe(1234);
    expect(resolveSkyClock('?skyTime=2026-06-21T12:00:00-06:00', fallback)()).toBe(Date.UTC(2026, 5, 21, 18));
    expect(resolveSkyClock('?skyTime=1782151200000', fallback)()).toBe(1782151200000);
    expect(parseSkyTime(null)).toBeNull();
    expect(parseSkyTime('  ')).toBeNull();
    expect(formatMountainClock(Date.parse('2026-09-03T09:15:00-06:00'))).toBe('09:15');
  });

  it('can accelerate a frozen instant for solar-arc QA', async () => {
    const { resolveSkyClock } = await import('../client/sky/clock');
    const original = Date.now;
    let now = 1_000;
    Date.now = () => now;
    try {
      const clock = resolveSkyClock('?skyTime=2026-06-21T06:00:00-06:00&skySpeed=600');
      const start = clock();
      now += 1_000;
      expect(clock() - start).toBe(600_000);
    } finally {
      Date.now = original;
    }
  });

  it('can offset a live clock without freezing its progress', async () => {
    const { createAdjustableClock } = await import('../client/sky/clock');
    let sourceTime = 1_000;
    const adjustable = createAdjustableClock(() => sourceTime);

    adjustable.set(5_000);
    expect(adjustable.clock()).toBe(5_000);
    sourceTime += 250;
    expect(adjustable.clock()).toBe(5_250);
  });
});
