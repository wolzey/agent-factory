import * as THREE from 'three';
import { patioFloorHeight } from '@shared/factory25d-patio';
import { factoryCompanionPosition } from '@shared/factory25d-layout';
import type { WorldAgent, WorldSnapshot } from '@shared/types';
import { DEFAULT_AVATAR } from '@shared/constants';
import { avatarSheet, AVATAR_ANIMATIONS } from './factory25dAvatar';
import { avatarTexture } from './factory25dAvatarTexture';
import { agentPosition } from './factory25dWorld';
import { createNameTag } from './factory25dLabels';
import { contactShadow } from './factory25dContactShadows';
import { WORKSTATIONS, isWorking } from './factory25dWorkstations';
import { onFactoryMessage } from './factory25dBoardData';
import { createFactoryEffects, type EffectAnchor } from './factory25dEffects';
import { effectPose, effectSeed, FactoryEffectsState, vortexStrength } from './factory25dEffectsState';
import { createFactoryTombstones } from './factory25dTombstones';

type Sprite = { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>; texture: THREE.CanvasTexture;
  shadow: THREE.Mesh; sheet: ReturnType<typeof avatarSheet>; signature: string };
type Entry = Sprite & { session: WorldAgent; label: ReturnType<typeof createNameTag>; children: Map<string, Sprite>;
  lastX: number; lastZ: number; baseHeight: number };

export function createLiveAgents(factory: THREE.Scene, patio: THREE.Scene, canvas: HTMLCanvasElement) {
  const entries = new Map<string, Entry>();
  const effectState = new FactoryEffectsState(), effects = createFactoryEffects(factory, patio);
  const tombstones = createFactoryTombstones(factory, patio, canvas);
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const anchors = new Map<string, EffectAnchor>();
  let snapshot: WorldSnapshot | undefined, clockOffset = 0;
  let view: { camera: THREE.Camera; factory: boolean; patio: boolean; occluder: THREE.Object3D; floor: (point: { x: number; z: number }) => number } | undefined;
  function sprite(agent: WorldAgent, scale = 1): Sprite {
    const { sheet, texture } = avatarTexture(agent.avatar ?? DEFAULT_AVATAR);
    const material = new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.08, side: THREE.DoubleSide,
      emissive: '#101126', emissiveIntensity: 0.6, roughness: 1 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.86 * scale, 0.86 * scale), material);
    mesh.castShadow = true; mesh.userData.sessionId = agent.sessionId; factory.add(mesh);
    const shadow = contactShadow(factory, { width: 0.22 * scale, depth: 0.12 * scale, spread: 0.065, opacity: 0.3, round: true });
    return { mesh, texture, shadow, sheet, signature: JSON.stringify(agent.avatar) };
  }
  function removeSprite(item: Sprite) {
    item.mesh.removeFromParent(); item.mesh.geometry.dispose(); item.mesh.material.dispose(); item.texture.dispose();
    item.shadow.removeFromParent(); // Contact shadow geometry/materials are shared by the room.
  }
  function setFrame(item: Sprite, row: number, frame: number, floorY: number, scale = 1) {
    item.texture.offset.set(frame / 4, 1 - (row + 1) / AVATAR_ANIMATIONS.length);
    item.mesh.position.y = floorY + (item.sheet.feet[row][frame] / 32 - 0.5) * 0.86 * scale + 0.004;
  }
  function place(item: Sprite, x: number, z: number) {
    const parent = x > 8 ? patio : factory;
    if (item.mesh.parent !== parent) { parent.add(item.mesh); parent.add(item.shadow); }
    item.mesh.position.x = x; item.mesh.position.z = z;
    item.shadow.position.set(x, (x > 8 ? patioFloorHeight({x, z}) : 0) + 0.021, z);
  }
  const stopEffects = onFactoryMessage(message => {
    // World deltas and effects can share a socket batch. Reconcile the latest
    // roster in the next frame before resolving actors and shot targets.
    effectState.enqueue(message, Date.now() + clockOffset);
  });
  return {
    entries,
    get isVortexActive() { return !!effectState.vortex; },
    isPerforming(id: string) { return effectState.effects.has(id) || !!effectState.vortex; },
    placeOverride(id: string, point: { x: number; z: number }, lift = 0.5) {
      const entry = entries.get(id); if (!entry) return;
      // A grab or a local basketball pose must never inherit a previous emote's
      // squash, rotation or partial disappearance.
      entry.mesh.scale.set(1, 1, 1); entry.mesh.rotation.set(0, 0, 0); entry.mesh.material.opacity = 1;
      const dx = point.x - entry.mesh.position.x, dz = point.z - entry.mesh.position.z;
      const floorY = point.x > 8 ? patioFloorHeight(point) + .018 : view?.floor({ x: point.x, z: point.z - 1.95 }) ?? .018;
      place(entry, point.x, point.z); entry.mesh.position.y = floorY + entry.baseHeight + lift;
      for (const child of entry.children.values()) { place(child, child.mesh.position.x + dx, child.mesh.position.z + dz); child.mesh.position.y += lift; }
      effects.follow(id, { x: point.x, y: floorY + lift, z: point.z });
      if (view) entry.label.update(entry.mesh, 0.02, view.camera, canvas, point.x > 8 ? view.patio : view.factory, point.x > 8 ? undefined : view.occluder);
    },
    sync(next: WorldSnapshot | undefined) {
      if (!next || next === snapshot) return;
      snapshot = next; clockOffset = next.serverTime - Date.now();
      effectState.sync(next);
      const ids = new Set(next.agents.map(agent => agent.sessionId));
      for (const [id, entry] of entries) if (!ids.has(id)) {
        removeSprite(entry); entry.label.dispose(); entry.children.forEach(removeSprite); entries.delete(id);
      }
      for (const agent of next.agents) {
        let entry = entries.get(agent.sessionId);
        if (entry && entry.signature !== JSON.stringify(agent.avatar)) {
          removeSprite(entry); Object.assign(entry, sprite(agent));
        }
        if (!entry) {
          const point = agentPosition(agent, next.serverTime, next.environment);
          const label = createNameTag(agent.sessionName || agent.username, isWorking(agent.activity), canvas.parentElement!);
          label.element.dataset.sessionId = agent.sessionId;
          entry = { ...sprite(agent), session: agent, label, children: new Map(), lastX: point.x, lastZ: point.z, baseHeight: .25 };
          place(entry, point.x, point.z); entries.set(agent.sessionId, entry);
        }
        entry.session = agent;
        const childIds = new Set(agent.subagents.map(child => child.agentId));
        for (const [id, child] of entry.children) if (child.signature !== JSON.stringify(agent.avatar)) { removeSprite(child); entry.children.delete(id); }
        for (const [id, child] of entry.children) if (!childIds.has(id)) { removeSprite(child); entry.children.delete(id); }
        for (const child of agent.subagents) if (!entry.children.has(child.agentId)) entry.children.set(child.agentId, sprite(agent, 0.58));
        entry.label.setDetails(agent.sessionName || agent.username,
          [agent.activity, agent.currentTool].filter(Boolean).join(' · '),
          [agent.taskDescription, agent.cwd.split('/').filter(Boolean).at(-1), `${agent.toolUseCount ?? 0} tool calls`].filter(Boolean).join(' · '));
      }
      canvas.dataset.liveAgents = String(entries.size);
      canvas.dataset.liveSubagents = String([...entries.values()].reduce((n, e) => n + e.children.size, 0));
    },
    occupied() {
      return new Set([...entries.values()].flatMap(({ session }) => session.world.zone === 'work' && !session.manualControl
        ? [WORKSTATIONS[session.world.slotIndex ?? -1]?.id].filter((id): id is string => !!id) : []).concat(
          [...effectState.tombstones.values()].flatMap(stone => [WORKSTATIONS[stone.slotIndex ?? -1]?.id].filter((id): id is string => !!id))));
    },
    update(elapsed: number, camera: THREE.Camera, showFactory: boolean, showPatio: boolean,
      floor: (point: {x: number; z: number}) => number, occluder: THREE.Object3D) {
      view = { camera, factory: showFactory, patio: showPatio, occluder, floor };
      if (!snapshot) return;
      const now = Date.now() + clockOffset, frame = Math.floor(elapsed * 6) % 4;
      const reduced = motionPreference.matches;
      effectState.flush(now); anchors.clear();
      const vortex = effectState.vortex;
      for (const entry of entries.values()) {
        const agent = entry.session, point = agentPosition(agent, now, snapshot.environment);
        const dx = point.x - entry.lastX, dz = point.z - entry.lastZ;
        const moving = Math.hypot(dx, dz) > 0.001 || !!agent.manualControl?.moving;
        const effect = effectState.effects.get(agent.sessionId);
        const facing = effect?.kind === 'shot' || effect?.kind === 'gun' ? effect.facing : moving
          ? (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'right' : 'left') : (dz > 0 ? 'down' : 'up')) : agent.manualControl?.facing ?? agent.world.facing;
        const working = !agent.manualControl && agent.world.zone === 'work' && isWorking(agent.activity) && !moving;
        let row = moving ? AVATAR_ANIMATIONS.indexOf(`walk_${facing}`) : working ? 5 : agent.activity === 'idle' ? 6 : 0;
        if (effect && now >= effect.startedAt) row = ['dance', 'merge', 'dizzy', 'shot', 'gun'].includes(effect.kind)
          ? AVATAR_ANIMATIONS.indexOf(`walk_${facing}`) : effect.kind === 'sleep' ? 6 : 0;
        place(entry, point.x, point.z); entry.lastX = point.x; entry.lastZ = point.z;
        const floorY = point.x > 8 ? patioFloorHeight(point) + .018 : floor({x: point.x, z: point.z - 1.95});
        setFrame(entry, row, frame, floorY);
        const pose = effectPose(effect, now, reduced);
        const baseHeight = entry.mesh.position.y - floorY;
        entry.baseHeight = baseHeight;
        entry.mesh.scale.set(pose.scaleX, pose.scaleY, 1); entry.mesh.rotation.set(0, 0, pose.angle);
        entry.mesh.position.x += pose.x; entry.mesh.position.y = floorY + baseHeight * pose.scaleY + pose.lift;
        if (vortex && !reduced && !agent.manualControl) {
          const strength = vortexStrength(vortex, now), seed = effectSeed(agent.sessionId) + vortex.seed;
          const t = (now - vortex.startedAt) / 1000, angle = seed + t * .75, radius = .7 + (seed % 10) * .12;
          const center = point.x > 8 ? { x: 15, z: 4 } : { x: 0, z: .8 };
          place(entry, THREE.MathUtils.lerp(point.x, center.x + Math.cos(angle) * radius, strength),
            THREE.MathUtils.lerp(point.z, center.z + Math.sin(angle) * radius * .6, strength));
          entry.mesh.position.y += strength * (.65 + (seed % 7) * .13);
          entry.mesh.rotation.z += Math.sin(angle) * .3 * strength;
          entry.mesh.scale.multiplyScalar(1 - strength * .18);
        }
        entry.label.setActivity(effect ? (effect.kind === 'return' ? 'back again' : effect.kind) : [agent.activity, agent.currentTool].filter(Boolean).join(' · '));
        entry.label.element.dataset.performing = effect?.kind ?? (vortex ? 'vortex' : '');
        entry.mesh.material.opacity = pose.opacity * (agent.activity === 'stopped' ? .45 : 1);
        entry.mesh.material.transparent = entry.mesh.material.opacity < 1;
        entry.label.element.classList.toggle('patio-agent', point.x > 8);
        entry.label.update(entry.mesh, floorY, camera, canvas, point.x > 8 ? showPatio : showFactory, point.x > 8 ? undefined : occluder);
        let index = 0;
        for (const child of entry.children.values()) {
          const follower = factoryCompanionPosition(entry.mesh.position, index++);
          place(child, follower.x, follower.z);
          setFrame(child, working ? 5 : moving ? row : 0, frame, child.mesh.position.x > 8 ? patioFloorHeight(child.mesh.position) + .018 : floorY, 0.58);
        }
        anchors.set(agent.sessionId, { x: entry.mesh.position.x, y: entry.mesh.position.y - baseHeight * entry.mesh.scale.y, z: entry.mesh.position.z });
      }
      effects.update(effectState, now, anchors, snapshot.environment, reduced);
      tombstones.update(effectState.tombstones, snapshot.environment, now, camera, showFactory, showPatio, floor, occluder, reduced);
      canvas.dataset.liveEffects = String(effectState.effects.size);
      canvas.dataset.liveVortex = effectState.vortex?.id ?? '';
    },
    dispose() { stopEffects(); effects.dispose(); tombstones.dispose(); effectState.clear(); for (const entry of entries.values()) { removeSprite(entry); entry.label.dispose(); entry.children.forEach(removeSprite); } entries.clear(); },
  };
}
