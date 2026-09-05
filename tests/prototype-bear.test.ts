import { describe, expect, it } from 'vitest';
import { BearVisit } from '../client/prototypes/factory25dBear';
import { meadowHeight } from '../client/prototypes/factory25dLandscape';

function advance(bear: BearVisit, seconds: number) {
  for (let i = 0; i < seconds * 10; i++) bear.update(0.1);
}

describe('occasional ridge visitor', () => {
  it('walks in from beyond the panorama, pauses, and leaves before the next visit', () => {
    const bear = new BearVisit(() => 0);
    advance(bear, 15);
    expect(bear.visible).toBe(false);
    advance(bear, 2);
    expect(bear.phase).toBe('walking');
    expect(bear.x).toBeLessThan(-7.92);
    for (let i = 0; i < 400 && bear.phase === 'walking'; i++) bear.update(0.1);
    expect(bear.phase).toBe('sniffing');
    expect(bear.x).toBeCloseTo(-5.65);
    advance(bear, 25);
    expect(bear.visible).toBe(false);
    expect(bear.x).toBeLessThan(-7.92);
    advance(bear, 70);
    expect(bear.visible).toBe(false);
    for (let i = 0; i < 300 && !bear.visible; i++) bear.update(0.1);
    expect(bear.phase).toBe('walking');
    expect(bear.direction).toBe(1);
    expect(bear.x).toBeLessThan(-7.92);
    expect(bear.z).toBe(-5.2);
  });

  it('freezes both the waiting interval and an active visit while paused', () => {
    const bear = new BearVisit(() => 0);
    for (let i = 0; i < 400; i++) bear.update(0.1, true);
    expect(bear.visible).toBe(false);
    advance(bear, 20);
    const before = { x: bear.x, stride: bear.stride, phase: bear.phase };
    bear.update(100, true);
    expect({ x: bear.x, stride: bear.stride, phase: bear.phase }).toEqual(before);
    bear.update(100);
    expect(Math.abs(bear.x - before.x)).toBeLessThanOrEqual(0.023);
  });

  it('keeps the bear on distant, elevated mesa tops', () => {
    for (const z of [-6.3, -5.2]) {
      const from = -9.2;
      const to = z === -6.3 ? -5.65 : -6.1;
      for (let x = from; x <= to; x += 0.05) {
        expect(meadowHeight(x, z)).toBeGreaterThan(1.5);
        expect(Math.abs(meadowHeight(x + 0.05, z) - meadowHeight(x, z)) / 0.05).toBeLessThan(0.5);
      }
    }
  });
});
