import { describe, expect, it } from 'vitest';
import {
  SIDEREAL_DAY_MS,
  STAR_DRIFT_MAX_X,
  STAR_DRIFT_MAX_Y,
  starDayFraction,
  starOffsetAt,
  starOffsetAtDayFraction,
} from '../client/sky/starMotion';

describe('star motion', () => {
  it('is deterministic and repeats after one sidereal day', () => {
    const now = Date.UTC(2026, 8, 3, 6, 30);
    expect(starOffsetAt(now, 17)).toEqual(starOffsetAt(now, 17));
    expect(starOffsetAt(now + SIDEREAL_DAY_MS, 17)).toEqual(starOffsetAt(now, 17));
  });

  it('keeps every star within a tiny, bounded drift', () => {
    for (let index = 0; index < 100; index++) {
      for (let step = 0; step <= 24; step++) {
        const offset = starOffsetAtDayFraction(step / 24, index);
        expect(Math.abs(offset.x)).toBeLessThanOrEqual(STAR_DRIFT_MAX_X);
        expect(Math.abs(offset.y)).toBeLessThanOrEqual(STAR_DRIFT_MAX_Y);
      }
    }
  });

  it('moves enough across a scrubbed night to be visible, but barely moves in real time', () => {
    const midnight = Date.UTC(2026, 8, 3, 6);
    const start = starOffsetAt(midnight, 4);
    const threeHoursLater = starOffsetAt(midnight + 3 * 60 * 60_000, 4);
    const oneSecondLater = starOffsetAt(midnight + 1_000, 4);

    expect(Math.hypot(threeHoursLater.x - start.x, threeHoursLater.y - start.y)).toBeGreaterThan(0.5);
    expect(Math.hypot(oneSecondLater.x - start.x, oneSecondLater.y - start.y)).toBeLessThan(0.001);
  });

  it('normalizes timestamps and invalid input safely', () => {
    expect(starDayFraction(0)).toBe(0);
    expect(starDayFraction(-SIDEREAL_DAY_MS / 4)).toBeCloseTo(0.75);
    expect(starDayFraction(Number.NaN)).toBe(0);
  });
});
