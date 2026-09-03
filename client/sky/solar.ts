/**
 * Deterministic solar and clock math for the skyline window.
 *
 * Everything here is a pure function of an epoch-millisecond instant, so the same
 * input always yields the same sunrise, sunset, elevation and wall-clock reading.
 * Sunrise and sunset follow the NOAA solar calculator equations. Wall-clock time is
 * America/Denver: resolved through Intl when the runtime supports it, with a
 * rule-based US Mountain Time fallback (second Sunday of March to first Sunday of
 * November) so the window still keeps correct time without ICU data.
 */

const DEG = Math.PI / 180;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
/** Standard NOAA zenith for sunrise/sunset: 90 deg plus refraction plus the solar radius. */
const SUNRISE_ZENITH_DEG = 90.833;

export const DENVER_TIME_ZONE = 'America/Denver';
export const MOUNTAIN_STANDARD_OFFSET_MINUTES = -420;
export const MOUNTAIN_DAYLIGHT_OFFSET_MINUTES = -360;

export interface GeoLocation {
  latitude: number;
  longitude: number;
}

/** Salt Lake City, the Wasatch Front vantage point the window looks out from. */
export const SALT_LAKE_CITY: GeoLocation = { latitude: 40.7608, longitude: -111.891 };

export type OffsetSource = 'intl' | 'rule';
export type OffsetResolver = (utcMs: number) => number | null;

export interface LocalClock {
  year: number;
  /** 1 to 12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** Minutes elapsed since local midnight, fractional seconds dropped. */
  minutesOfDay: number;
  /** 1 to 366 */
  dayOfYear: number;
  offsetMinutes: number;
}

export type PolarState = 'none' | 'day' | 'night';

export interface SunTimes {
  sunriseMs: number;
  sunsetMs: number;
  solarNoonMs: number;
  polar: PolarState;
}

export interface SolarSnapshot extends SunTimes {
  nowMs: number;
  offsetMinutes: number;
  offsetSource: OffsetSource;
  local: LocalClock;
  /** Sun elevation above the horizon in degrees, negative when below. */
  elevationDeg: number;
  /** True before solar noon, so twilight reads as dawn rather than dusk. */
  rising: boolean;
  /** 0 at sunrise, 1 at sunset, clamped. */
  dayProgress: number;
  /** 0 at the most recent sunset, 1 at the next sunrise, clamped. */
  nightProgress: number;
  /** Minutes between sunrise and sunset. */
  dayLengthMinutes: number;
}

export interface SolarOptions {
  location?: GeoLocation;
  offsetResolver?: OffsetResolver;
}

// ── Time zone ─────────────────────────────────────────────────────

function nthSundayOfMonth(year: number, monthIndex: number, n: number): number {
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const firstSunday = 1 + ((7 - firstWeekday) % 7);
  return firstSunday + (n - 1) * 7;
}

/**
 * US Mountain Time offset from the statutory rule alone. Daylight time starts at
 * 02:00 MST on the second Sunday of March (09:00 UTC) and ends at 02:00 MDT on the
 * first Sunday of November (08:00 UTC).
 */
export function mountainOffsetByRule(utcMs: number): number {
  const year = new Date(utcMs).getUTCFullYear();
  const dstStart = Date.UTC(year, 2, nthSundayOfMonth(year, 2, 2), 9);
  const dstEnd = Date.UTC(year, 10, nthSundayOfMonth(year, 10, 1), 8);
  return utcMs >= dstStart && utcMs < dstEnd
    ? MOUNTAIN_DAYLIGHT_OFFSET_MINUTES
    : MOUNTAIN_STANDARD_OFFSET_MINUTES;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/** UTC offset in minutes for `timeZone` at `utcMs` via Intl, or null when unavailable. */
export function intlOffsetMinutes(utcMs: number, timeZone: string = DENVER_TIME_ZONE): number | null {
  try {
    let formatter = formatterCache.get(timeZone);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      formatterCache.set(timeZone, formatter);
    }
    const parts = formatter.formatToParts(new Date(utcMs));
    const read = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find(p => p.type === type)?.value);
    const asUtc = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour') % 24, read('minute'), read('second'));
    if (!Number.isFinite(asUtc)) return null;
    const wholeSeconds = Math.floor(utcMs / 1000) * 1000;
    return Math.round((asUtc - wholeSeconds) / MS_PER_MINUTE);
  } catch {
    return null;
  }
}

const denverIntlResolver: OffsetResolver = utcMs => intlOffsetMinutes(utcMs, DENVER_TIME_ZONE);

/** Denver offset, preferring the runtime's zone data and falling back to the rule. */
export function resolveDenverOffset(
  utcMs: number,
  resolver: OffsetResolver = denverIntlResolver,
): { offsetMinutes: number; source: OffsetSource } {
  let resolved: number | null = null;
  try {
    resolved = resolver(utcMs);
  } catch {
    resolved = null;
  }
  if (resolved !== null && Number.isFinite(resolved) && Math.abs(resolved) <= 14 * 60) {
    return { offsetMinutes: resolved, source: 'intl' };
  }
  return { offsetMinutes: mountainOffsetByRule(utcMs), source: 'rule' };
}

export function toLocalClock(utcMs: number, offsetMinutes: number): LocalClock {
  const shifted = new Date(utcMs + offsetMinutes * MS_PER_MINUTE);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const second = shifted.getUTCSeconds();
  const dayOfYear = Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / MS_PER_DAY) + 1;
  return { year, month, day, hour, minute, second, minutesOfDay: hour * 60 + minute, dayOfYear, offsetMinutes };
}

// ── NOAA solar position ───────────────────────────────────────────

export function julianDay(utcMs: number): number {
  return utcMs / MS_PER_DAY + 2440587.5;
}

interface SolarGeometry {
  declinationDeg: number;
  equationOfTimeMinutes: number;
}

function solarGeometry(jd: number): SolarGeometry {
  const t = (jd - 2451545) / 36525;
  const meanLongitude = ((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360 + 360) % 360;
  const meanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const m = meanAnomaly * DEG;
  const center =
    Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m) * 0.000289;
  const trueLongitude = meanLongitude + center;
  const omega = (125.04 - 1934.136 * t) * DEG;
  const apparentLongitude = trueLongitude - 0.00569 - 0.00478 * Math.sin(omega);
  const meanObliquity = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = (meanObliquity + 0.00256 * Math.cos(omega)) * DEG;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitude * DEG));

  const y = Math.tan(obliquity / 2) ** 2;
  const l0 = meanLongitude * DEG;
  const equationOfTime =
    y * Math.sin(2 * l0) -
    2 * eccentricity * Math.sin(m) +
    4 * eccentricity * y * Math.sin(m) * Math.cos(2 * l0) -
    0.5 * y * y * Math.sin(4 * l0) -
    1.25 * eccentricity * eccentricity * Math.sin(2 * m);

  return { declinationDeg: declination / DEG, equationOfTimeMinutes: (4 * equationOfTime) / DEG };
}

/** Sun elevation above the horizon in degrees at an instant, independent of time zone. */
export function solarElevationDeg(utcMs: number, location: GeoLocation = SALT_LAKE_CITY): number {
  const { declinationDeg, equationOfTimeMinutes } = solarGeometry(julianDay(utcMs));
  const utcMinutes = (((utcMs / MS_PER_MINUTE) % 1440) + 1440) % 1440;
  const trueSolarMinutes = (((utcMinutes + equationOfTimeMinutes + 4 * location.longitude) % 1440) + 1440) % 1440;
  const hourAngle = (trueSolarMinutes / 4 - 180) * DEG;
  const lat = location.latitude * DEG;
  const decl = declinationDeg * DEG;
  const sinElevation = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);
  return Math.asin(Math.max(-1, Math.min(1, sinElevation))) / DEG;
}

function hourAngleDeg(latitudeDeg: number, declinationDeg: number): number | PolarState {
  const lat = latitudeDeg * DEG;
  const decl = declinationDeg * DEG;
  const cosHourAngle =
    Math.cos(SUNRISE_ZENITH_DEG * DEG) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl);
  if (cosHourAngle > 1) return 'night';
  if (cosHourAngle < -1) return 'day';
  return Math.acos(cosHourAngle) / DEG;
}

/**
 * Sunrise, sunset and solar noon for one local calendar day, returned as UTC epoch ms.
 * `offsetMinutes` is the local zone offset in force on that day.
 */
export function sunTimesForLocalDay(
  year: number,
  month: number,
  day: number,
  offsetMinutes: number,
  location: GeoLocation = SALT_LAKE_CITY,
): SunTimes {
  const localMidnightUtc = Date.UTC(year, month - 1, day) - offsetMinutes * MS_PER_MINUTE;
  const toUtc = (localMinutes: number) => localMidnightUtc + localMinutes * MS_PER_MINUTE;

  const noon = solarGeometry(julianDay(localMidnightUtc + 12 * MS_PER_HOUR));
  const solarNoonLocal = 720 - 4 * location.longitude - noon.equationOfTimeMinutes + offsetMinutes;
  const solarNoonMs = toUtc(solarNoonLocal);

  const noonHourAngle = hourAngleDeg(location.latitude, noon.declinationDeg);
  if (typeof noonHourAngle === 'string') {
    return { sunriseMs: solarNoonMs, sunsetMs: solarNoonMs, solarNoonMs, polar: noonHourAngle };
  }

  // First pass from the noon geometry, then refine each event with the geometry at its own instant.
  const estimate = (sign: 1 | -1, geometry: SolarGeometry, hourAngle: number) =>
    720 - 4 * (location.longitude + sign * hourAngle) - geometry.equationOfTimeMinutes + offsetMinutes;

  const refine = (sign: 1 | -1): number => {
    let local = estimate(sign, noon, noonHourAngle);
    const geometry = solarGeometry(julianDay(toUtc(local)));
    const hourAngle = hourAngleDeg(location.latitude, geometry.declinationDeg);
    if (typeof hourAngle === 'number') local = estimate(sign, geometry, hourAngle);
    return toUtc(local);
  };

  return { sunriseMs: refine(1), sunsetMs: refine(-1), solarNoonMs, polar: 'none' };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Everything the window needs about the sun and the clock at `nowMs`. */
export function solarSnapshot(nowMs: number, options: SolarOptions = {}): SolarSnapshot {
  const location = options.location ?? SALT_LAKE_CITY;
  const { offsetMinutes, source } = resolveDenverOffset(nowMs, options.offsetResolver);
  const local = toLocalClock(nowMs, offsetMinutes);
  const today = sunTimesForLocalDay(local.year, local.month, local.day, offsetMinutes, location);
  const elevationDeg = solarElevationDeg(nowMs, location);
  const rising = nowMs < today.solarNoonMs;

  let nightStartMs: number;
  let nightEndMs: number;
  if (nowMs < today.sunriseMs) {
    const yesterdayMs = nowMs - MS_PER_DAY;
    const yOffset = resolveDenverOffset(yesterdayMs, options.offsetResolver).offsetMinutes;
    const y = toLocalClock(yesterdayMs, yOffset);
    nightStartMs = sunTimesForLocalDay(y.year, y.month, y.day, yOffset, location).sunsetMs;
    nightEndMs = today.sunriseMs;
  } else {
    const tomorrowMs = nowMs + MS_PER_DAY;
    const tOffset = resolveDenverOffset(tomorrowMs, options.offsetResolver).offsetMinutes;
    const t = toLocalClock(tomorrowMs, tOffset);
    nightStartMs = today.sunsetMs;
    nightEndMs = sunTimesForLocalDay(t.year, t.month, t.day, tOffset, location).sunriseMs;
  }

  const daySpan = today.sunsetMs - today.sunriseMs;
  const nightSpan = nightEndMs - nightStartMs;

  return {
    ...today,
    nowMs,
    offsetMinutes,
    offsetSource: source,
    local,
    elevationDeg,
    rising,
    dayProgress: daySpan > 0 ? clamp01((nowMs - today.sunriseMs) / daySpan) : rising ? 0 : 1,
    nightProgress: nightSpan > 0 ? clamp01((nowMs - nightStartMs) / nightSpan) : 0,
    dayLengthMinutes: daySpan / MS_PER_MINUTE,
  };
}
