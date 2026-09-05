/**
 * Clock source for the skyline window. Real time by default; a `skyTime` query
 * parameter (ISO 8601 or epoch milliseconds) freezes the window at one instant so
 * dawn, day, sunset and night can be inspected deterministically.
 */
export type Clock = () => number;

export interface AdjustableClock {
  clock: Clock;
  set: (timestamp: number) => void;
}

export const SKY_TIME_PARAM = 'skyTime';
export const SKY_SPEED_PARAM = 'skySpeed';

export function parseSkyTime(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (/^-?\d{10,}$/.test(trimmed)) {
    const ms = Number(trimmed);
    return Number.isFinite(ms) ? ms : null;
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveSkyClock(search: string | null | undefined, fallback: Clock = Date.now): Clock {
  try {
    const params = new URLSearchParams(search ?? '');
    const frozen = parseSkyTime(params.get(SKY_TIME_PARAM));
    if (frozen !== null) {
      const speed = Number(params.get(SKY_SPEED_PARAM));
      if (Number.isFinite(speed) && speed > 0 && speed <= 86_400) {
        const startedAt = Date.now();
        return () => frozen + (Date.now() - startedAt) * speed;
      }
      return () => frozen;
    }
  } catch {
    // malformed query string: use real time
  }
  return fallback;
}

export function createAdjustableClock(source: Clock): AdjustableClock {
  let offsetMs = 0;
  return {
    clock: () => source() + offsetMs,
    set: (timestamp: number) => {
      offsetMs = timestamp - source();
    },
  };
}

export function formatMountainClock(timestamp: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(new Date(timestamp));
  const hour = parts.find(part => part.type === 'hour')?.value ?? '00';
  const minute = parts.find(part => part.type === 'minute')?.value ?? '00';
  const period = parts.find(part => part.type === 'dayPeriod')?.value.toLowerCase() ?? 'am';
  return `${hour}:${minute} ${period}`;
}
