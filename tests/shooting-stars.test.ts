import { describe, expect, it } from 'vitest';
import { paletteForElevation } from '../client/sky/skyPhase';
import {
  SHOOTING_STAR_DEPTH_OFFSET,
  ShootingStarSim,
  paintShootingStar,
  seasonalShootingStarActivity01,
} from '../client/sky/shootingStars';
import { PixelBuffer } from '../client/sky/skylinePainter';

function stepFor(sim: ShootingStarSim, seconds: number, stars01 = 1, seasonalActivity01 = 0): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) {
    sim.step(0.05, { stars01, seasonalActivity01 });
  }
}

describe('shooting star simulation', () => {
  it('never appears outside a visible night sky', () => {
    const sim = new ShootingStarSim(240, 80, 12, { minDelaySeconds: 0.2, maxDelaySeconds: 0.2 });
    stepFor(sim, 2, 0.2);
    expect(sim.star).toBeNull();
  });

  it('waits, crosses the sky briefly, and schedules another rare event', () => {
    const sim = new ShootingStarSim(240, 80, 12, { minDelaySeconds: 0.2, maxDelaySeconds: 0.2 });
    stepFor(sim, 0.15);
    expect(sim.star).toBeNull();
    stepFor(sim, 0.1);
    expect(sim.star).not.toBeNull();
    const firstStar = sim.star;

    const pixels = new PixelBuffer(240, 80);
    stepFor(sim, 0.1);
    paintShootingStar(pixels, sim, paletteForElevation(-18, false), 1);
    expect(pixels.data.some((value) => value > 0)).toBe(true);

    stepFor(sim, 1);
    expect(sim.star).not.toBe(firstStar);
  });

  it('sits behind every mountain layer', () => {
    expect(SHOOTING_STAR_DEPTH_OFFSET).toBeGreaterThan(0.01);
    expect(SHOOTING_STAR_DEPTH_OFFSET).toBeLessThan(0.05);
  });
});

describe('seasonal night-sky rhythm', () => {
  it('has restrained late-summer and early-winter peaks', () => {
    expect(seasonalShootingStarActivity01(224)).toBe(1);
    expect(seasonalShootingStarActivity01(348)).toBe(1);
    expect(seasonalShootingStarActivity01(100)).toBe(0);
    expect(seasonalShootingStarActivity01(230)).toBeGreaterThan(0);
  });
});
