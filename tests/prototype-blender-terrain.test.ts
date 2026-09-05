import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createTerrainSampler } from '../client/prototypes/factory25dTerrainSampler';
import { meadowHeight } from '../client/prototypes/factory25dLandscape';

describe('shipped Blender landscape', () => {
  let geometry: THREE.BufferGeometry;
  let height: (x: number, z: number) => number;
  beforeAll(async () => {
    const bytes = readFileSync(new URL('../client/assets/prototype25d/utah-mountains.glb', import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    gltf.scene.updateMatrixWorld(true);
    const mesh = gltf.scene.getObjectByName('Utah_Mountains') as THREE.Mesh;
    geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    height = createTerrainSampler(geometry, () => NaN);
  });
  it('exports one bounded, colored game mesh inside the experiment budget', () => {
    expect(geometry.index!.count / 3).toBeLessThan(20_000);
    expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.x).toBeCloseTo(-11);
    expect(geometry.boundingBox!.max.x).toBeCloseTo(11);
    expect(geometry.boundingBox!.max.y).toBeLessThan(3.2);
  });
  it('keeps shoreline and foreground grounding close to the original room environment', () => {
    for (const [x, z] of [[-1.1, -5], [-1, -3], [-7.8, 2.7], [7.7, 3.8], [0, 5]]) {
      expect(Number.isFinite(height(x, z))).toBe(true);
      expect(Math.abs(height(x, z) - meadowHeight(x, z))).toBeLessThan(0.09);
    }
  });
  it('keeps both bear trails on continuous walkable ridge ground', () => {
    for (const [end, z] of [[-5.65, -6.3], [-6.1, -5.2]])
      for (let x = -9.2; x <= end; x += 0.05) {
        const y = height(x, z), next = height(x + 0.025, z);
        expect(y).toBeGreaterThan(1.4);
        expect(Math.abs(next - y)).toBeLessThan(0.025);
      }
  });
});
