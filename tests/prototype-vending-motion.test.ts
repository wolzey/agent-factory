import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { VendingCabinetRock, VENDING_ROCK_LIMITS } from '../client/prototypes/factory25dVendingMotion';
import { createVendingMachine } from '../client/prototypes/factory25dVendingMachine';
import { createVendingDispenser } from '../client/prototypes/factory25dVendingDispense';

afterEach(() => vi.unstubAllGlobals());
const run = (motion: VendingCabinetRock, seconds: number, reduced = false, visible = true) => {
  for (let frame = 0; frame < Math.round(seconds * 120); frame++) motion.update(1 / 120, reduced, visible);
};

describe('interruptible rigid cabinet rocking', () => {
  it('nudges existing momentum without restarting the visible pose', () => {
    const motion = new VendingCabinetRock(); motion.press(); run(motion, .05);
    const before = { ...motion.pose }, velocity = motion.angularVelocity;
    motion.press();
    expect(motion.pose).toEqual(before);
    expect(motion.angularVelocity).toBeLessThan(velocity);
    expect(Math.abs(motion.update(.001).pitch - before.pitch)).toBeLessThan(.001);
    const atRelease = { ...motion.pose }; motion.release();
    expect(motion.pose).toEqual(atRelease);
  });

  it('gives one weighted rock, a small follow-through, then settles promptly', () => {
    const motion = new VendingCabinetRock(); motion.press();
    let low = 0, high = 0;
    for (let frame = 0; frame < 120; frame++) {
      if (frame === 1) motion.release();
      const pose = motion.update(1 / 120);
      low = Math.min(low, pose.pitch); high = Math.max(high, pose.pitch);
    }
    expect(low).toBeLessThan(-.02);
    expect(high).toBeGreaterThan(0);
    expect(high).toBeLessThan(Math.abs(low) * .12);
    expect(motion.pose).toEqual({ pitch: 0, y: 0, z: 0 });
    expect(motion.angularVelocity).toBe(0);
  });

  it('keeps a bottom edge grounded and every corner above the floor under repeated pushes', () => {
    const motion = new VendingCabinetRock();
    const transform = new THREE.Object3D();
    for (let frame = 0; frame < 1200; frame++) {
      if (frame % 6 === 0) for (let press = 0; press < 20; press++) motion.press();
      if (frame % 13 === 0) motion.release();
      const pose = motion.update(1 / 120);
      expect(Math.abs(pose.pitch)).toBeLessThanOrEqual(VENDING_ROCK_LIMITS.angle);
      expect(Math.abs(motion.angularVelocity)).toBeLessThanOrEqual(VENDING_ROCK_LIMITS.speed);
      transform.position.set(0, pose.y, pose.z); transform.rotation.x = pose.pitch; transform.updateMatrix();
      const front = new THREE.Vector3(0, 0, .31).applyMatrix4(transform.matrix);
      const back = new THREE.Vector3(0, 0, -.31).applyMatrix4(transform.matrix);
      expect(Math.min(front.y, back.y)).toBeCloseTo(0, 12);
      expect(Math.max(front.y, back.y)).toBeGreaterThanOrEqual(0);
      expect(front.distanceTo(back)).toBeCloseTo(.62, 12);
    }
    run(motion, 1);
    expect(motion.pose).toEqual({ pitch: 0, y: 0, z: 0 });
  });

  it('keeps the same motion at 30, 60 and 120 frames per second', () => {
    const motions = [30, 60, 120].map(fps => {
      const motion = new VendingCabinetRock(); motion.press();
      for (let frame = 0; frame < fps / 10; frame++) motion.update(1 / fps);
      return motion;
    });
    for (const motion of motions.slice(1)) {
      expect(motion.angle).toBeCloseTo(motions[0].angle, 10);
      expect(motion.angularVelocity).toBeCloseTo(motions[0].angularVelocity, 10);
    }
  });

  it('pauses offscreen and clears reduced motion without replaying it later', () => {
    const motion = new VendingCabinetRock(); motion.press(); run(motion, .08);
    const before = { ...motion.pose }, velocity = motion.angularVelocity;
    run(motion, 3, false, false);
    expect(motion.pose).toEqual(before); expect(motion.angularVelocity).toBe(velocity);
    motion.update(1 / 60, true, false);
    expect(motion.pose).toEqual({ pitch: 0, y: 0, z: 0 });
    motion.press(); motion.release(); run(motion, 1, true); run(motion, 1);
    expect(motion.pose).toEqual({ pitch: 0, y: 0, z: 0 }); expect(motion.angularVelocity).toBe(0);
  });
});

it('drives motion from accepted selections and actual releases, with no duplicate release events', () => {
  vi.stubGlobal('document', { hidden: false });
  const root = new THREE.Group(), accepted = vi.fn(), released = vi.fn();
  const dispenser = createVendingDispenser(root, { accepted, released });
  for (let click = 0; click < 50; click++) dispenser.dispense();
  expect(accepted).toHaveBeenCalledTimes(1); expect(released).not.toHaveBeenCalled();
  dispenser.update(1 / 120); expect(released).toHaveBeenCalledTimes(1);
  dispenser.update(1 / 120); expect(released).toHaveBeenCalledTimes(1);
  for (let frame = 0; frame < 120; frame++) dispenser.update(1 / 120);
  expect(released.mock.calls.map(([body]) => body.id)).toEqual(dispenser.bodies.map(body => body.id));
  dispenser.dispose();
});

it('rocks the complete rigid cabinet while keeping placement, pile and floor lighting unchanged', () => {
  vi.stubGlobal('document', { hidden: false, fonts: {ready: Promise.resolve()}, createElement: () => ({ width: 1, height: 1, getContext: () => ({
    clearRect() {}, fillRect() {}, putImageData() {}, createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
  }) }) });
  const scene = new THREE.Group(), machine = createVendingMachine(scene);
  machine.root.position.set(-1, 0, 7.05); machine.root.rotation.y = -Math.PI / 3;
  const visual = machine.root.getObjectByName('vending-cabinet-motion')!;
  expect(visual.parent).toBe(machine.root);
  const floorPieces = machine.root.children.filter(child => child !== visual);
  expect(floorPieces.filter(child => child instanceof THREE.InstancedMesh)).toHaveLength(4);
  expect(floorPieces.some(child => child instanceof THREE.PointLight)).toBe(true);
  // Three signs, glass and two gleams share the same animated parent as the
  // merged solid shell, so separate detail layers never drift away from it.
  expect(visual.children.filter(child => child instanceof THREE.Mesh)).toHaveLength(6);
  scene.updateMatrixWorld(true);
  const placement = machine.root.matrixWorld.clone(), before = floorPieces.map(child => child.matrixWorld.clone());
  const top = new THREE.Vector3(0, 1.36, 0), bottom = new THREE.Vector3(0, 0, 0);
  const cabinetHeight = visual.localToWorld(top.clone()).distanceTo(visual.localToWorld(bottom.clone()));
  machine.dispense();
  for (let frame = 0; frame < 8; frame++) machine.update(frame / 120, false, 1 / 120);
  scene.updateMatrixWorld(true);
  expect(visual.rotation.x).toBeLessThan(-.02);
  expect(visual.scale.toArray()).toEqual([1, 1, 1]);
  expect(visual.localToWorld(top.clone()).distanceTo(visual.localToWorld(bottom.clone()))).toBeCloseTo(cabinetHeight, 12);
  expect(machine.root.matrixWorld.equals(placement)).toBe(true);
  const support = new THREE.Vector3(0, 0, -.31);
  expect(visual.localToWorld(support).y).toBeCloseTo(0, 12);
  floorPieces.forEach((child, index) => expect(child.matrixWorld.equals(before[index])).toBe(true));
  machine.update(2, true, 1 / 60);
  expect(visual.rotation.x).toBe(0); expect(visual.position.toArray()).toEqual([0, 0, 0]);
  expect(visual.scale.toArray()).toEqual([1, 1, 1]);
  machine.dispose();
});
