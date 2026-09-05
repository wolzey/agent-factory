import { describe, it, expect } from 'vitest';
import { WindowPan } from '../client/prototypes/factory25dPan';

describe('window scroll', () => {
  it('follows input with weight and settles within the window bounds at different frame rates', () => {
    for (const fps of [30, 60, 120]) {
      const pan = new WindowPan();
      pan.resize(5);
      pan.set(100);
      pan.update(1 / fps, false);
      expect(pan.position).toBeGreaterThan(0);
      expect(pan.position).toBeLessThan(5);
      for (let i = 0; i < fps * 3; i++) {
        pan.update(1 / fps, false);
        expect(Math.abs(pan.position)).toBeLessThanOrEqual(5);
      }
      expect(pan.position).toBeCloseTo(5, 3);
    }
  });
  it('can reverse during motion, resize and respect reduced motion', () => {
    const pan = new WindowPan();
    pan.resize(5);
    pan.set(4);
    pan.update(0.1, false);
    pan.set(-4);
    for (let i = 0; i < 180; i++) pan.update(1 / 60, false);
    expect(pan.position).toBeCloseTo(-4, 3);
    pan.resize(1);
    expect(pan.position).toBe(-1);
    pan.set(1);
    pan.update(0.016, true);
    expect(pan.position).toBe(1);
    expect(pan.velocity).toBe(0);
    pan.resize(0);
    pan.update(0.1, false);
    expect(pan.position).toBe(0);
  });
});
