import { describe, expect, it } from 'vitest';
import {
  DENVER_TIME_ZONE,
  MOUNTAIN_DAYLIGHT_OFFSET_MINUTES,
  MOUNTAIN_STANDARD_OFFSET_MINUTES,
  SALT_LAKE_CITY,
  intlOffsetMinutes,
  mountainOffsetByRule,
  resolveDenverOffset,
  solarElevationDeg,
  solarSnapshot,
  sunTimesForLocalDay,
  toLocalClock,
} from '../client/sky/solar';

const MINUTE = 60_000;

function localHm(utcMs: number, offsetMinutes: number): number {
  const clock = toLocalClock(utcMs, offsetMinutes);
  return clock.hour * 60 + clock.minute;
}

function hm(hours: number, minutes: number): number {
  return hours * 60 + minutes;
}

describe('America/Denver offset', () => {
  // 2026: DST begins Sunday March 8 at 02:00 MST (09:00 UTC) and ends Sunday November 1 at 02:00 MDT (08:00 UTC).
  const dstStart = Date.UTC(2026, 2, 8, 9);
  const dstEnd = Date.UTC(2026, 10, 1, 8);

  it('follows the statutory rule around both transitions', () => {
    expect(mountainOffsetByRule(dstStart - MINUTE)).toBe(MOUNTAIN_STANDARD_OFFSET_MINUTES);
    expect(mountainOffsetByRule(dstStart)).toBe(MOUNTAIN_DAYLIGHT_OFFSET_MINUTES);
    expect(mountainOffsetByRule(dstEnd - MINUTE)).toBe(MOUNTAIN_DAYLIGHT_OFFSET_MINUTES);
    expect(mountainOffsetByRule(dstEnd)).toBe(MOUNTAIN_STANDARD_OFFSET_MINUTES);
    expect(mountainOffsetByRule(Date.UTC(2026, 0, 15, 12))).toBe(MOUNTAIN_STANDARD_OFFSET_MINUTES);
    expect(mountainOffsetByRule(Date.UTC(2026, 6, 4, 12))).toBe(MOUNTAIN_DAYLIGHT_OFFSET_MINUTES);
  });

  it('agrees with the runtime zone data at sample instants and at the transitions', () => {
    const samples = [
      Date.UTC(2026, 0, 15, 12),
      Date.UTC(2026, 6, 4, 12),
      Date.UTC(2026, 8, 2, 3, 30),
      dstStart - MINUTE,
      dstStart,
      dstEnd - MINUTE,
      dstEnd,
      Date.UTC(2027, 2, 14, 8, 59),
      Date.UTC(2027, 2, 14, 9),
    ];
    for (const utcMs of samples) {
      expect(intlOffsetMinutes(utcMs, DENVER_TIME_ZONE)).toBe(mountainOffsetByRule(utcMs));
    }
  });

  it('prefers Intl and reports the source', () => {
    const resolved = resolveDenverOffset(Date.UTC(2026, 6, 4, 12));
    expect(resolved).toEqual({ offsetMinutes: MOUNTAIN_DAYLIGHT_OFFSET_MINUTES, source: 'intl' });
  });

  it('falls back to the rule when Intl is unavailable, returns garbage, or throws', () => {
    const utcMs = Date.UTC(2026, 11, 21, 12);
    expect(resolveDenverOffset(utcMs, () => null)).toEqual({ offsetMinutes: MOUNTAIN_STANDARD_OFFSET_MINUTES, source: 'rule' });
    expect(resolveDenverOffset(utcMs, () => Number.NaN)).toEqual({ offsetMinutes: MOUNTAIN_STANDARD_OFFSET_MINUTES, source: 'rule' });
    expect(resolveDenverOffset(utcMs, () => 99_999)).toEqual({ offsetMinutes: MOUNTAIN_STANDARD_OFFSET_MINUTES, source: 'rule' });
    expect(resolveDenverOffset(utcMs, () => { throw new Error('no ICU'); })).toEqual({ offsetMinutes: MOUNTAIN_STANDARD_OFFSET_MINUTES, source: 'rule' });
  });

  it('returns null from the Intl resolver for an unknown zone instead of throwing', () => {
    expect(intlOffsetMinutes(Date.UTC(2026, 0, 1), 'Not/AZone')).toBeNull();
  });
});

describe('local clock', () => {
  it('converts a UTC instant into Denver wall-clock fields', () => {
    // 2026-09-02 03:30 UTC is 2026-09-01 21:30 MDT.
    const clock = toLocalClock(Date.UTC(2026, 8, 2, 3, 30, 15), MOUNTAIN_DAYLIGHT_OFFSET_MINUTES);
    expect(clock).toMatchObject({ year: 2026, month: 9, day: 1, hour: 21, minute: 30, second: 15, minutesOfDay: hm(21, 30) });
    expect(clock.dayOfYear).toBe(244);
  });
});

describe('Salt Lake City sunrise and sunset', () => {
  // Reference values from the NOAA solar calculator for 40.7608 N, 111.891 W, rounded to the minute.
  it('matches the summer solstice within a few minutes', () => {
    const times = sunTimesForLocalDay(2026, 6, 21, MOUNTAIN_DAYLIGHT_OFFSET_MINUTES, SALT_LAKE_CITY);
    expect(times.polar).toBe('none');
    expect(Math.abs(localHm(times.sunriseMs, MOUNTAIN_DAYLIGHT_OFFSET_MINUTES) - hm(5, 57))).toBeLessThanOrEqual(4);
    expect(Math.abs(localHm(times.sunsetMs, MOUNTAIN_DAYLIGHT_OFFSET_MINUTES) - hm(21, 2))).toBeLessThanOrEqual(4);
    expect((times.sunsetMs - times.sunriseMs) / MINUTE).toBeGreaterThan(14.9 * 60);
  });

  it('matches the winter solstice within a few minutes', () => {
    const times = sunTimesForLocalDay(2026, 12, 21, MOUNTAIN_STANDARD_OFFSET_MINUTES, SALT_LAKE_CITY);
    expect(Math.abs(localHm(times.sunriseMs, MOUNTAIN_STANDARD_OFFSET_MINUTES) - hm(7, 49))).toBeLessThanOrEqual(4);
    expect(Math.abs(localHm(times.sunsetMs, MOUNTAIN_STANDARD_OFFSET_MINUTES) - hm(17, 3))).toBeLessThanOrEqual(4);
    expect((times.sunsetMs - times.sunriseMs) / MINUTE).toBeLessThan(9.3 * 60);
  });

  it('gives a near twelve hour day at the March equinox', () => {
    const times = sunTimesForLocalDay(2026, 3, 20, MOUNTAIN_DAYLIGHT_OFFSET_MINUTES, SALT_LAKE_CITY);
    const dayLength = (times.sunsetMs - times.sunriseMs) / MINUTE;
    expect(Math.abs(dayLength - 12 * 60)).toBeLessThan(15);
  });

  it('places solar noon between sunrise and sunset', () => {
    for (const [month, day, offset] of [[1, 10, -420], [4, 15, -360], [8, 30, -360], [11, 20, -420]] as const) {
      const times = sunTimesForLocalDay(2026, month, day, offset, SALT_LAKE_CITY);
      expect(times.sunriseMs).toBeLessThan(times.solarNoonMs);
      expect(times.solarNoonMs).toBeLessThan(times.sunsetMs);
    }
  });

  it('reports polar day and night above the Arctic Circle', () => {
    const svalbard = { latitude: 78.2, longitude: 15.6 };
    expect(sunTimesForLocalDay(2026, 6, 21, 120, svalbard).polar).toBe('day');
    expect(sunTimesForLocalDay(2026, 12, 21, 60, svalbard).polar).toBe('night');
  });
});

describe('solar elevation', () => {
  it('is near zero at sunrise and sunset and peaks near solar noon', () => {
    const times = sunTimesForLocalDay(2026, 6, 21, MOUNTAIN_DAYLIGHT_OFFSET_MINUTES, SALT_LAKE_CITY);
    expect(Math.abs(solarElevationDeg(times.sunriseMs) + 0.833)).toBeLessThan(0.5);
    expect(Math.abs(solarElevationDeg(times.sunsetMs) + 0.833)).toBeLessThan(0.5);
    const noonElevation = solarElevationDeg(times.solarNoonMs);
    expect(noonElevation).toBeGreaterThan(72);
    expect(noonElevation).toBeLessThan(73.5);
    expect(solarElevationDeg(times.solarNoonMs - 12 * 60 * MINUTE)).toBeLessThan(-20);
  });
});

describe('solarSnapshot', () => {
  it('is deterministic for the same instant', () => {
    const now = Date.UTC(2026, 8, 2, 2, 15);
    expect(solarSnapshot(now)).toEqual(solarSnapshot(now));
  });

  it('tracks day progress from sunrise to sunset and night progress across the gap', () => {
    const times = sunTimesForLocalDay(2026, 9, 10, MOUNTAIN_DAYLIGHT_OFFSET_MINUTES, SALT_LAKE_CITY);
    const midday = solarSnapshot((times.sunriseMs + times.sunsetMs) / 2);
    expect(midday.dayProgress).toBeCloseTo(0.5, 2);
    expect(midday.elevationDeg).toBeGreaterThan(30);
    expect(midday.local.day).toBe(10);

    const beforeSunrise = solarSnapshot(times.sunriseMs - 30 * MINUTE);
    expect(beforeSunrise.rising).toBe(true);
    expect(beforeSunrise.dayProgress).toBe(0);
    expect(beforeSunrise.nightProgress).toBeGreaterThan(0.9);
    expect(beforeSunrise.nightProgress).toBeLessThan(1);

    const afterSunset = solarSnapshot(times.sunsetMs + 30 * MINUTE);
    expect(afterSunset.rising).toBe(false);
    expect(afterSunset.dayProgress).toBe(1);
    expect(afterSunset.nightProgress).toBeGreaterThan(0);
    expect(afterSunset.nightProgress).toBeLessThan(0.1);
  });

  it('keeps working with the rule fallback when the zone resolver fails', () => {
    const now = Date.UTC(2026, 11, 21, 19, 0); // noon MST
    const snapshot = solarSnapshot(now, { offsetResolver: () => null });
    expect(snapshot.offsetSource).toBe('rule');
    expect(snapshot.offsetMinutes).toBe(MOUNTAIN_STANDARD_OFFSET_MINUTES);
    expect(snapshot.local.hour).toBe(12);
    expect(snapshot.elevationDeg).toBeGreaterThan(25);
    expect(snapshot.elevationDeg).toBeLessThan(27);
  });
});
