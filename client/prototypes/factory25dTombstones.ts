import * as THREE from 'three';
import { patioFloorHeight } from '@shared/factory25d-patio';
import type { EnvironmentType, TombstoneState } from '@shared/types';
import { avatarTexture } from './factory25dAvatarTexture';
import { createNameTag, signTexture } from './factory25dLabels';
import { projectPosition } from './factory25dWorld';

/** Tombstones are server-owned reservations, not a second local expiration schedule. */
export function createFactoryTombstones(factory: THREE.Scene, patio: THREE.Scene, canvas: HTMLCanvasElement) {
  type Grave = { group: THREE.Group; state: TombstoneState; label: ReturnType<typeof createNameTag>; textures: THREE.Texture[]; materials: THREE.Material[] };
  const graves = new Map<string, Grave>(), box = new THREE.BoxGeometry(1, 1, 1), plane = new THREE.PlaneGeometry(1, 1);
  const stone = new THREE.MeshStandardMaterial({ color: '#8b999c', roughness: .95 });
  const edge = new THREE.MeshStandardMaterial({ color: '#67777b', roughness: 1 });
  const soil = new THREE.MeshStandardMaterial({ color: '#666655', roughness: 1 });
  function block(group: THREE.Group, dimensions: [number, number, number], position: [number, number, number], material: THREE.Material) {
    const mesh = new THREE.Mesh(box, material); mesh.scale.set(...dimensions); mesh.position.set(...position); mesh.castShadow = true; group.add(mesh);
  }
  function remove(id: string) {
    const grave = graves.get(id); if (!grave) return;
    grave.group.removeFromParent(); grave.label.dispose(); grave.textures.forEach(texture => texture.dispose()); grave.materials.forEach(material => material.dispose()); graves.delete(id);
  }
  function add(state: TombstoneState) {
    const group = new THREE.Group();
    block(group, [.5, .045, .36], [0, .022, .045], soil);
    block(group, [.36, .39, .13], [0, .225, 0], stone);
    block(group, [.28, .085, .13], [0, .455, 0], stone);
    block(group, [.42, .065, .18], [0, .055, 0], edge);
    const ripTexture = signTexture('RIP', '#3a4b51', '#8b999c', 1);
    const inscription = new THREE.MeshBasicMaterial({ map: ripTexture, side: THREE.DoubleSide });
    const rip = new THREE.Mesh(plane, inscription); rip.position.set(0, .36, .067); rip.scale.set(.17, .075, 1); group.add(rip);
    const { texture: portraitTexture } = avatarTexture(state.avatar, ['idle']);
    const portraitMaterial = new THREE.MeshBasicMaterial({ map: portraitTexture, transparent: true, alphaTest: .1, opacity: .65, side: THREE.DoubleSide });
    const portrait = new THREE.Mesh(plane, portraitMaterial); portrait.position.set(0, .22, .068); portrait.scale.setScalar(.24); group.add(portrait);
    const label = createNameTag(state.username, false, canvas.parentElement!);
    label.element.dataset.tombstone = state.sessionId;
    label.setDetails(state.username, 'session ended', state.slotIndex === undefined ? 'remembered until the marker fades' : 'this station is reserved for their return');
    const grave: Grave = { group, state, label, textures: [ripTexture, portraitTexture], materials: [inscription, portraitMaterial] };
    graves.set(state.sessionId, grave); return grave;
  }
  return {
    update(states: Map<string, TombstoneState>, environment: EnvironmentType, now: number, camera: THREE.Camera,
      showFactory: boolean, showPatio: boolean, floor: (point: { x: number; z: number }) => number, occluder: THREE.Object3D, reduced: boolean) {
      for (const id of graves.keys()) if (!states.has(id) || states.get(id)!.expiresAt <= now) remove(id);
      for (const state of states.values()) {
        if (state.expiresAt <= now) continue;
        let grave = graves.get(state.sessionId);
        if (grave && JSON.stringify(grave.state.avatar) !== JSON.stringify(state.avatar)) { remove(state.sessionId); grave = undefined; }
        grave ??= add(state); grave.state = state;
        const point = projectPosition(state.position, environment), outside = point.x > 8, parent = outside ? patio : factory;
        if (grave.group.parent !== parent) parent.add(grave.group);
        const floorY = outside ? patioFloorHeight(point) + .018 : floor({ x: point.x, z: point.z - 1.95 });
        grave.group.position.set(point.x, floorY, point.z);
        // A sleeping tab resumes at the current phase and never extends a reservation.
        const appear = Math.min(1, Math.max(0, (now - state.createdAt) / 600));
        const fade = Math.min(1, Math.max(0, (state.expiresAt - now) / 650));
        grave.group.scale.setScalar(reduced ? 1 : Math.max(.01, appear * fade));
        grave.label.element.classList.toggle('patio-agent', outside);
        grave.label.update(grave.group, floorY, camera, canvas, outside ? showPatio : showFactory, outside ? undefined : occluder);
      }
      canvas.dataset.liveTombstones = String(graves.size);
    },
    dispose() { for (const id of graves.keys()) remove(id); box.dispose(); plane.dispose(); stone.dispose(); edge.dispose(); soil.dispose(); },
  };
}
