import { describe, expect, it } from 'vitest';
import { positionAt, slotPosition, zoneForActivity } from '../shared/world-layouts.js';

describe('shared world layouts', () => {
  it('maps activities to authoritative zones', () => {
    expect(zoneForActivity('reading')).toBe('work');
    expect(zoneForActivity('waiting')).toBe('waiting');
    expect(zoneForActivity('idle')).toBe('idle');
    expect(zoneForActivity('stopped')).toBe('idle');
  });

  it('uses environment-specific slot coordinates', () => {
    expect(slotPosition('arcade', 'work', 0)).toEqual({ x: 80, y: 134 });
    expect(slotPosition('mining', 'work', 0)).toEqual({ x: 90, y: 144 });
    expect(slotPosition('arcade', 'idle', 4)).toEqual({ x: 550, y: 454 });
  });

  it('interpolates timestamped movement without client frame history', () => {
    const movement = {
      from: { x: 0, y: 10 },
      to: { x: 100, y: 30 },
      startedAt: 1_000,
      arrivesAt: 2_000,
    };
    expect(positionAt(movement, 500)).toEqual({ x: 0, y: 10 });
    expect(positionAt(movement, 1_500)).toEqual({ x: 50, y: 20 });
    expect(positionAt(movement, 2_500)).toEqual({ x: 100, y: 30 });
  });
});
