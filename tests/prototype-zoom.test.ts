import { describe, expect, it } from 'vitest';
import { zoomOffset } from '../client/prototypes/factory25dZoom';

describe('pointer close-up framing', () => {
  it('centers the requested point without crossing the original camera bounds', () => {
    for (const span of [0.5, 3, 16.32]) for (const point of [-1, -0.5, 0, 0.5, 1]) {
      const offset = zoomOffset(point, span, 2.5);
      expect(Math.abs(offset) + span / 2.5 / 2).toBeLessThanOrEqual(span / 2 + 1e-9);
      expect(Math.sign(offset)).toBe(Math.sign(point));
    }
    expect(zoomOffset(0.2, 10, 2.5)).toBe(1);
    expect(zoomOffset(0, 10, 2.5)).toBe(0);
  });
});
