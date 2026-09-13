import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { BRAND_FLAG, brandFlagVertex, createBrandFlag, createPersonalFlagGeometry } from '../client/prototypes/factory25dBrandFlag';
import { createMistClothGeometry, mistClothVertex } from '../client/prototypes/factory25dMistCloth';

afterEach(() => vi.unstubAllGlobals());

it('gives both flags the same rectangular, raycastable outline', () => {
  const geometry = createPersonalFlagGeometry(), uv = geometry.getAttribute('uv');
  const mistGeometry = createMistClothGeometry();
  expect(Array.from(geometry.getAttribute('position').array)).toEqual(Array.from(mistGeometry.getAttribute('position').array));
  const middleRow = Array.from({length: uv.count}, (_, i) => i).filter(i => Math.abs(uv.getY(i) - .5) < .001);
  expect(Math.max(...middleRow.map(i => uv.getX(i)))).toBe(1);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({side: THREE.DoubleSide}));
  const ray = new THREE.Raycaster(new THREE.Vector3(BRAND_FLAG.width * .49, 0, 1), new THREE.Vector3(0, 0, -1));
  expect(ray.intersectObject(mesh).length).toBeGreaterThan(0);
  ray.ray.origin.x = 0;
  expect(ray.intersectObject(mesh).length).toBeGreaterThan(0);
  geometry.dispose(); mistGeometry.dispose(); mesh.material.dispose();
});

it('pins the hoist to its pole and keeps wind motion clear of the string lights', () => {
  for (const wind of [0, .5, 1, 100, NaN]) for (const time of [0, .5, 2, 13]) for (const v of [0, .5, 1]) {
    const pinned = brandFlagVertex(0, v, time, wind, false);
    expect(pinned.x).toBe(-BRAND_FLAG.width / 2); expect(pinned.y).toBe((v - .5) * BRAND_FLAG.height); expect(pinned.z).toBeCloseTo(0);
    const free = brandFlagVertex(1, v, time, wind, false);
    expect(BRAND_FLAG.z + free.z).toBeLessThan(-3.6 - .2);
    expect(free).toEqual(mistClothVertex(1, v, time, wind, false));
  }
  expect(brandFlagVertex(1, .5, .5, 1, false)).not.toEqual(brandFlagVertex(1, .5, 2, 1, false));
});

it('keeps reduced motion in one soft drape regardless of time or changing weather', () => {
  const calm = brandFlagVertex(.25, .5, 0, 0, true);
  expect(brandFlagVertex(.25, .5, 88, 1, true)).toEqual(calm);
  expect(Math.abs(calm.z)).toBeLessThan(BRAND_FLAG.width * .1);
  expect(calm.y).toBeLessThan(0);
});

it('starts with neutral artwork on a lit, reusable fabric mesh', () => {
  const drawImage = vi.fn();
  const context = {clearRect: vi.fn(), fillRect: vi.fn(), setLineDash: vi.fn(), strokeRect: vi.fn(), drawImage};
  const canvas = {width: 0, height: 0, getContext: () => context};
  const image = {src: '', naturalWidth: 1024, naturalHeight: 1024, onload: null as null | (() => void), removeAttribute: vi.fn()};
  vi.stubGlobal('document', {createElement: (type: string) => type === 'canvas' ? canvas : image});
  const parent = new THREE.Scene(), flag = createBrandFlag(parent);
  expect(image.src).toBe(''); expect(context.clearRect).toHaveBeenCalled();
  expect(canvas.width / canvas.height).toBeCloseTo(BRAND_FLAG.width / BRAND_FLAG.height);
  expect(flag.root.position.toArray()).toEqual([20.7, 0, -4.35]);
  const cloth = flag.target as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  expect(cloth.material).toBeInstanceOf(THREE.MeshStandardMaterial);
  expect(cloth.material.emissive.getHex()).toBe(0); expect(cloth.castShadow).toBe(true);
  const geometry = cloth.geometry, positions = geometry.getAttribute('position');
  const before = Array.from(positions.array);
  flag.update(1, .8, false);
  expect(cloth.geometry).toBe(geometry); expect(Array.from(positions.array)).not.toEqual(before);
  const frame = Array.from(positions.array);
  flag.update(1.03, .8, false); expect(Array.from(positions.array)).toEqual(frame);
  flag.update(1.07, .8, false); expect(Array.from(positions.array)).not.toEqual(frame);
  flag.update(1, .8, true); const reduced = Array.from(positions.array);
  flag.update(100, 1, true); expect(Array.from(positions.array)).toEqual(reduced);
  const textureDispose = vi.spyOn(cloth.material.map!, 'dispose'), geometryDispose = vi.spyOn(geometry, 'dispose');
  flag.dispose(); flag.dispose();
  expect(parent.children).toHaveLength(0); expect(image.onload).toBeNull();
  expect(textureDispose).toHaveBeenCalledOnce(); expect(geometryDispose).toHaveBeenCalledOnce();
});
