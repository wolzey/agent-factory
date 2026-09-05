import { describe, expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { createTerrainSampler } from '../client/prototypes/factory25dTerrainSampler';

function geometry(vertices: number[], indices?: number[]) {
  const result = new BufferGeometry();
  result.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  if (indices) result.setIndex(indices);
  return result;
}
describe('exported terrain grounding', () => {
  it('interpolates the actual triangle slope across bucket and shared edges', () => {
    const mesh = geometry([-1, 1, -1, 1, 3, -1, -1, 3, 1, 1, 5, 1], [0, 2, 1, 1, 2, 3]);
    const sample = createTerrainSampler(mesh, () => -20);
    for (const [x, z] of [[-0.8, -0.6], [0, 0], [0.5, 0.5], [1, 1], [-1, -1]])
      expect(sample(x, z)).toBeCloseTo(x + z + 3, 5);
    expect(sample(3, 0)).toBe(-20);
  });
  it('uses the top surface for overlapping ledges and ignores vertical degenerates', () => {
    const mesh = geometry([0, 1, 0, 1, 1, 0, 0, 1, 1,
      0, 2, 0, 1, 2, 0, 0, 2, 1,
      0, 0, 0, 0, 3, 0, 0, 0, 1]);
    const sample = createTerrainSampler(mesh, () => -20);
    expect(sample(0.2, 0.2)).toBe(2);
    expect(sample(0.8, 0.8)).toBe(-20);
  });
});
