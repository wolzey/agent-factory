import { describe, expect, it } from 'vitest';
import { CLOUD_LAYER_PLAN } from '../client/sky/cloudLayers';

describe('skyline cloud layers', () => {
  it('places visible storm clouds both behind and in front of the mountain passes', () => {
    const stormWeights = [0, 0, 1] as const;
    const visible = CLOUD_LAYER_PLAN.filter(layer => layer.weight(stormWeights) * layer.alpha > 0.05);

    expect(visible.some(layer => layer.depthOffset < 0.05)).toBe(true);
    expect(visible.some(layer => layer.depthOffset > 0.15)).toBe(true);
    expect(Math.max(...visible.map(layer => layer.alpha))).toBeLessThan(0.55);
    expect(visible.filter(layer => layer.depthOffset > 0.1)).toHaveLength(2);
  });
});
