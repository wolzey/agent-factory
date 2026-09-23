import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_AVATAR } from '../shared/constants';
import type { TeamMember } from '../shared/team';
import { CLEAR_WEATHER } from '../client/sky/weather';
import { landscapeVisitors } from '../client/prototypes/factory25dVisitors';
import { canoeLakePose, createLakeCanoe } from '../client/prototypes/factory25dCanoe';
import { LANDSCAPE_LAKE, meadowHeight } from '../client/prototypes/factory25dLandscape';
import { avatarSheet } from '../client/prototypes/factory25dAvatar';

vi.mock('../client/prototypes/factory25dAvatar', () => ({
  avatarSheet: vi.fn(() => ({ canvas: { width: 128, height: 32 }, feet: [[32, 32, 32, 32]] })),
}));
afterEach(() => vi.clearAllMocks());
const member = (id: string): TeamMember => ({ id, name: id, avatar: { ...DEFAULT_AVATAR }, lastSeen: 1000, online: false, agents: 0 });
const castIds = (cast: ReturnType<typeof landscapeVisitors>) => ({ climbers: cast.climbers.map(m => m.id), canoe: cast.canoe.map(m => m.id) });
const make = () => {
  const scene = new THREE.Scene(), haze = { value: new THREE.Color('#bdcbd9') }, canoe = createLakeCanoe(scene, haze);
  const root = scene.getObjectByName('lake-canoe')!;
  return { scene, haze, canoe, root };
};

describe('lake canoe outing', () => {
  it('shares the real roster between outings without duplicating climbers, including small rosters', () => {
    for (let count = 0; count <= 6; count++) {
      const members = Array.from({ length: count }, (_, i) => member(String(i)));
      const cast = landscapeVisitors([...members, ...members], { climbers: [], canoe: [] }, 2);
      const ids = [...cast.climbers, ...cast.canoe].map(m => m.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toHaveLength(Math.min(count, 4));
      expect(cast.canoe.length).toBe(count ? Math.min(2, Math.max(1, count - 2)) : 0);
      expect(landscapeVisitors(members.toReversed(), castIds(cast), 9)).toEqual(cast);
    }
    const cast = landscapeVisitors(['a', 'b', 'c'].map(member), { climbers: [], canoe: [] }, 0);
    const changed = { ...cast.canoe[0], avatar: { ...DEFAULT_AVATAR, hairColor: '#ff6633' } };
    expect(landscapeVisitors([...cast.climbers, changed], castIds(cast), 0).canoe).toEqual([changed]);
  });

  it('keeps every hull and wake vertex inside the actual shoreline over a full circuit', () => {
    const { scene, canoe } = make(), transform = new THREE.Object3D(), point = new THREE.Vector3();
    // Collected rather than asserted per vertex: tens of thousands of expect() calls outran the timeout.
    const violations: string[] = [];
    for (let i = 0; i <= 360; i++) {
      const pose = canoeLakePose(i * 150 / 360);
      transform.position.set(pose.x, LANDSCAPE_LAKE.height, pose.z); transform.rotation.y = pose.yaw; transform.updateMatrix();
      for (const name of ['canoe-hull', 'canoe-wake']) {
        const positions = (scene.getObjectByName(name) as THREE.Mesh).geometry.getAttribute('position');
        for (let vertex = 0; vertex < positions.count; vertex++) {
          point.fromBufferAttribute(positions, vertex).applyMatrix4(transform.matrix);
          if (!(LANDSCAPE_LAKE.shoreDistance(point.x, point.z) < -.07)) violations.push(`${name} vertex ${vertex} nears the shore at step ${i}`);
          if (!(meadowHeight(point.x, point.z) < point.y)) violations.push(`${name} vertex ${vertex} sinks below the meadow at step ${i}`);
        }
      }
    }
    expect(violations).toEqual([]);
    const first = canoeLakePose(0), last = canoeLakePose(150);
    expect(last.x).toBeCloseTo(first.x, 10); expect(last.z).toBeCloseTo(first.z, 10);
    canoe.dispose();
  });

  it('uses saved customized avatars, updates changed appearances only, and grounds them inside the open hull', () => {
    const { scene, canoe, root } = make(), friend = member('friend');
    canoe.setVisitors([friend, friend]); canoe.update(.1, CLEAR_WEATHER, false, false);
    expect(avatarSheet).toHaveBeenCalledOnce(); expect(avatarSheet).toHaveBeenLastCalledWith(friend.avatar, ['paddle']);
    const person = scene.getObjectByName('canoe-visitor') as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
    const original = person.material.map!, dispose = vi.spyOn(original, 'dispose');
    expect(person.userData).toEqual({ visitorId: friend.id, visitorName: friend.name, activity: 'canoeing' });
    expect(person.geometry.parameters.height).toBeLessThan(.09);
    expect(person.position.y - person.geometry.parameters.height / 2).toBeGreaterThan(.01);
    expect(person.position.y - person.geometry.parameters.height / 2).toBeLessThan(.022);
    expect(original.offset.y).toBe(.25); expect(original.repeat.y).toBe(.75);
    canoe.setVisitors([{ ...friend, lastSeen: 9000, online: true }]); expect(person.material.map).toBe(original);
    const updated = { ...friend, avatar: { ...friend.avatar, hairColor: '#ff6633' } };
    canoe.setVisitors([updated]); expect(person.material.map).not.toBe(original); expect(dispose).toHaveBeenCalledOnce();
    expect(avatarSheet).toHaveBeenLastCalledWith(updated.avatar, ['paddle']);
    expect(root.position.y).toBe(LANDSCAPE_LAKE.height);
    const textureDispose = vi.spyOn(person.material.map!, 'dispose');
    canoe.setVisitors([]); expect(scene.getObjectByName('canoe-visitor')).toBeUndefined(); expect(textureDispose).toHaveBeenCalledOnce();
    canoe.dispose(); expect(scene.children).toHaveLength(0);
  });

  it('puts the boat, passengers, paddles and wake in the same live weather haze', () => {
    const { scene, canoe, haze } = make(); canoe.setVisitors([member('a'), member('b')]);
    const materials = new Set<THREE.MeshStandardMaterial>();
    scene.traverse(object => { if (object instanceof THREE.Mesh) materials.add(object.material); });
    for (const material of materials) {
      const shader = { ...THREE.ShaderLib.standard, uniforms: { ...THREE.ShaderLib.standard.uniforms } };
      material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
      expect(shader.uniforms.landscapeHaze).toBe(haze); expect(material.fog).toBe(true);
      expect(shader.fragmentShader).toContain('mix(outgoingLight, landscapeHaze, aerialDepth)');
    }
    haze.value.set('#d29c81');
    canoe.dispose();
  });

  it('hides in darkness and rough weather even when paused, and freezes all motion for reduced motion', () => {
    const { scene, canoe, root } = make(); canoe.setVisitors([member('a')]);
    canoe.update(.1, CLEAR_WEATHER, false, false); const before = root.position.clone();
    canoe.update(600, CLEAR_WEATHER, true, false); expect(root.visible).toBe(false);
    canoe.update(600, { ...CLEAR_WEATHER, thunder01: 1 }, false, true); expect(root.visible).toBe(false);
    canoe.update(600, { ...CLEAR_WEATHER, snow01: .4 }, false, true); expect(root.visible).toBe(false);
    canoe.update(600, { ...CLEAR_WEATHER, rain01: .7 }, false, true); expect(root.visible).toBe(false);
    canoe.update(.1, CLEAR_WEATHER, false, true); expect(root.visible).toBe(true); expect(root.position.equals(before)).toBe(true);
    root.updateMatrixWorld(true);
    const matrices: THREE.Matrix4[] = []; root.traverse(object => matrices.push(object.matrixWorld.clone()));
    for (let frame = 0; frame < 120; frame++) canoe.update(1 / 60, CLEAR_WEATHER, false, true);
    root.updateMatrixWorld(true); let index = 0;
    root.traverse(object => expect(object.matrixWorld.equals(matrices[index++])).toBe(true));
    expect(scene.getObjectByName('canoe-wake')!.visible).toBe(false);
    canoe.update(.1, CLEAR_WEATHER, false, false); expect(root.position.distanceTo(before)).toBeLessThan(.01);
    expect(scene.getObjectByName('canoe-wake')!.visible).toBe(true);
    canoe.dispose();
  });

  it('leaves an empty stationary canoe without inventing a passenger when no saved roster exists', () => {
    const { scene, canoe, root } = make(); canoe.update(.1, CLEAR_WEATHER, false, false);
    expect(root.visible).toBe(true); expect(scene.getObjectByName('canoe-visitor')).toBeUndefined();
    const position = root.position.clone(); canoe.update(20, CLEAR_WEATHER, false, false);
    expect(root.position.equals(position)).toBe(true); expect(scene.getObjectByName('canoe-wake')!.visible).toBe(false);
    expect(avatarSheet).not.toHaveBeenCalled(); canoe.dispose();
  });
});
