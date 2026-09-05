import { describe, expect, it } from 'vitest';
import { MOON_PHASES, celestialPixels, moonIllumination, moonPhaseFromSearch, moonPixelLit } from '../client/prototypes/factory25dCelestials';

describe('square celestial cycle', () => {
  it('supports every phase in a shared URL and falls back safely', () => {
    for (const phase of MOON_PHASES) {
      expect(moonPhaseFromSearch(`?skyTime=night&moonPhase=${phase.id}&skyWeather=rain-heavy`)).toBe(phase.id);
    }
    expect(moonPhaseFromSearch('')).toBe('full');
    expect(moonPhaseFromSearch('?moonPhase=unknown')).toBe('full');
  });

  it('puts waxing light on the right and waning light on the left', () => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      expect(moonPixelLit('first-quarter', x, y)).toBe(x >= 8);
      expect(moonPixelLit('last-quarter', x, y)).toBe(x < 8);
      expect(moonPixelLit('waxing-crescent', x, y)).toBe(moonPixelLit('waning-crescent', 15 - x, y));
      expect(moonPixelLit('waxing-gibbous', x, y)).toBe(moonPixelLit('waning-gibbous', 15 - x, y));
    }
  });

  it('shrinks toward new moon and mirrors the waxing half of the cycle', () => {
    const areas = MOON_PHASES.map(phase => Array.from({length: 256}, (_, i) => Number(moonPixelLit(phase.id, i % 16, Math.floor(i / 16)))).reduce((a, b) => a + b, 0));
    expect(areas[0]).toBe(256);
    expect(areas[4]).toBe(0);
    for (let i = 0; i < 4; i++) {
      expect(areas[i]).toBeGreaterThan(areas[i + 1]);
      expect(moonIllumination(MOON_PHASES[i].id)).toBeGreaterThan(moonIllumination(MOON_PHASES[i + 1].id));
    }
    for (let i = 1; i < 4; i++) expect(areas[i]).toBe(areas[8 - i]);
    expect(moonIllumination('new')).toBe(0);
  });

  it('keeps all sun core corners opaque and all atlas corners transparent', () => {
    const sun = celestialPixels('sun');
    for (const x of [8, 23]) for (const y of [8, 23]) expect(sun[(y * 32 + x) * 4 + 3]).toBe(255);
    for (const kind of ['sun', ...MOON_PHASES.map(phase => phase.id)] as const) {
      const pixels = celestialPixels(kind);
      expect(pixels.length).toBe(32 * 32 * 4);
      for (const x of [0, 31]) for (const y of [0, 31]) expect(pixels[(y * 32 + x) * 4 + 3]).toBe(0);
    }
  });
});
