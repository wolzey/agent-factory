import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_AVATAR } from '../shared/constants';
import type { TeamMember } from '../shared/team';
import { mountainVisitors } from '../client/prototypes/factory25dVisitors';
import { createMountainClimbers } from '../client/prototypes/factory25dClimbers';
import { avatarSheet } from '../client/prototypes/factory25dAvatar';

vi.mock('../client/prototypes/factory25dAvatar', () => ({
  avatarSheet: vi.fn(() => ({ canvas: { width: 128, height: 32 }, feet: [[32, 32, 32, 32]] })),
}));
const member = (id: string): TeamMember => ({ id, name: id, avatar: { ...DEFAULT_AVATAR }, lastSeen: 1000, online: false, agents: 0 });

describe('mountain visitors from saved team history', () => {
  it('includes offline visitors, changes the cast between days, and never invents or duplicates a person', () => {
    const members = ['a', 'b', 'c'].map(member);
    expect(mountainVisitors(members, [], 0).map(m => m.id)).toEqual(['a', 'b']);
    expect(mountainVisitors(members, [], 1).map(m => m.id)).toEqual(['b', 'c']);
    expect(mountainVisitors([members[0], members[0]], [], 1)).toEqual([members[0]]);
    expect(mountainVisitors([], ['a'], 1)).toEqual([]);
  });
  it('preserves the outing when last-seen order changes and uses each person’s latest appearance', () => {
    const a = member('a'), b = member('b'), c = member('c');
    const revised = { ...b, online: true, lastSeen: 2000, avatar: { ...b.avatar, hairStyle: 6, shirtColor: '#aabbcc' } };
    expect(mountainVisitors([c, revised, a], ['a', 'b'], 2)).toEqual([a, revised]);
    expect(mountainVisitors([c, revised], ['a', 'b'], 0)).toEqual([revised, c]);
  });
  it('hides both climbers and rope at night even with motion paused, then restores the same visitors at dawn', () => {
    const scene = new THREE.Scene(), climbers = createMountainClimbers(scene, () => 1);
    const group = scene.getObjectByName('mountain-climbers')!;
    climbers.update(.1, false, false); expect(group.visible).toBe(false);
    climbers.setVisitors([member('returning friend')]); climbers.update(.1, false, true);
    expect(group.visible).toBe(true);
    const person = scene.getObjectByName('mountain-visitor')!, position = person.position.clone();
    climbers.update(600, true, true); expect(group.visible).toBe(false);
    climbers.update(600, false, true); expect(group.visible).toBe(true);
    expect(person.position.equals(position)).toBe(true);
    const rope = scene.getObjectByName('climbing-rope') as THREE.InstancedMesh;
    expect([...rope.instanceMatrix.array].every(Number.isFinite)).toBe(true);
    climbers.setVisitors([]); climbers.update(.1, false, false); expect(group.visible).toBe(false);
    expect(scene.getObjectByName('mountain-visitor')).toBeUndefined();
    climbers.dispose(); expect(scene.children).toHaveLength(0);
  });
  it('paints saved customization with the shared character painter and only replaces changed textures', () => {
    const scene = new THREE.Scene(), climbers = createMountainClimbers(scene, () => 1);
    const friend = { ...member('friend'), avatar: { ...DEFAULT_AVATAR, hairColor: '#ff6633', hairStyle: 4, headAccessory: 1, shirtDesign: 3 } };
    climbers.setVisitors([friend]);
    expect(avatarSheet).toHaveBeenLastCalledWith(friend.avatar, ['climb']);
    const mesh = scene.getObjectByName('mountain-visitor') as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
    const texture = mesh.material.map!, dispose = vi.spyOn(texture, 'dispose');
    climbers.setVisitors([{ ...friend, lastSeen: 2000 }]); expect(mesh.material.map).toBe(texture);
    const changed = { ...friend, avatar: { ...friend.avatar, shoeColor: '#889966' } };
    climbers.setVisitors([changed]); expect(avatarSheet).toHaveBeenLastCalledWith(changed.avatar, ['climb']);
    expect(mesh.material.map).not.toBe(texture); expect(dispose).toHaveBeenCalledOnce();
    expect(mesh.userData).toEqual({ visitorId: 'friend', visitorName: 'friend', activity: 'climbing' });
    expect(friend.online).toBe(false); expect(friend.lastSeen).toBe(1000);
    const textureDispose = vi.spyOn(mesh.material.map!, 'dispose'), materialDispose = vi.spyOn(mesh.material, 'dispose');
    climbers.dispose(); expect(textureDispose).toHaveBeenCalledOnce(); expect(materialDispose).toHaveBeenCalledOnce();
  });
});
