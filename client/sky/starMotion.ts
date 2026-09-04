export interface StarMotionOffset {
  x: number;
  y: number;
}

export const SIDEREAL_DAY_MS = 86_164_090.5;
export const STAR_DRIFT_MAX_X = 2.5;
export const STAR_DRIFT_MAX_Y = 0.75;

function wrap01(value: number): number {
  return ((value % 1) + 1) % 1;
}

function indexVariation(index: number): number {
  const n = Math.max(0, Math.floor(index));
  return ((Math.imul(n + 1, 2654435761) >>> 0) / 0x1_0000_0000);
}

export function starDayFraction(timestampMs: number): number {
  if (!Number.isFinite(timestampMs)) return 0;
  return wrap01(timestampMs / SIDEREAL_DAY_MS);
}

export function starOffsetAtDayFraction(dayFraction: number, starIndex: number): StarMotionOffset {
  const variation = indexVariation(starIndex);
  const angle = wrap01(dayFraction + (variation - 0.5) * 0.035) * Math.PI * 2;
  const depth = 0.82 + variation * 0.18;
  return {
    x: Math.sin(angle) * STAR_DRIFT_MAX_X * depth,
    y: Math.cos(angle) * STAR_DRIFT_MAX_Y * depth,
  };
}

export function starOffsetAt(timestampMs: number, starIndex: number): StarMotionOffset {
  return starOffsetAtDayFraction(starDayFraction(timestampMs), starIndex);
}
