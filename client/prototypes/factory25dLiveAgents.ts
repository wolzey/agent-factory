import * as THREE from 'three';
import type { WorldAgent, WorldSnapshot } from '@shared/types';
import { DEFAULT_AVATAR } from '@shared/constants';
import { avatarSheet, AVATAR_ANIMATIONS } from './factory25dAvatar';
import { agentPosition } from './factory25dWorld';
import { createNameTag } from './factory25dLabels';
import { contactShadow } from './factory25dContactShadows';
import { WORKSTATIONS, isWorking } from './factory25dWorkstations';
import { onFactoryMessage } from './factory25dBoardData';

type Sprite = { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>; texture: THREE.CanvasTexture;
  shadow: THREE.Mesh; sheet: ReturnType<typeof avatarSheet>; signature: string };
type Entry = Sprite & { session: WorldAgent; label: ReturnType<typeof createNameTag>; children: Map<string, Sprite>;
  effect?: { text: string; until: number }; lastX: number; lastZ: number };

export function createLiveAgents(factory: THREE.Scene, patio: THREE.Scene, canvas: HTMLCanvasElement) {
  const entries = new Map<string, Entry>();
  let snapshot: WorldSnapshot | undefined, clockOffset = 0;
  let view: { camera: THREE.Camera; factory: boolean; patio: boolean; occluder: THREE.Object3D } | undefined;
  function sprite(agent: WorldAgent, scale = 1): Sprite {
    const sheet = avatarSheet(agent.avatar ?? DEFAULT_AVATAR);
    const texture = new THREE.CanvasTexture(sheet.canvas);
    texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false; texture.repeat.set(0.25, 1 / AVATAR_ANIMATIONS.length);
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
    item.shadow.position.set(x, 0.021, z);
  }
  const stopEffects = onFactoryMessage(message => {
    if (message.type !== 'effect') return;
    const entry = entries.get(message.sessionId); if (!entry) return;
    const text = message.effect === 'emote' ? String(message.data?.emote ?? 'wave') : message.effect.replaceAll('_', ' ');
    entry.effect = { text, until: performance.now() + 2400 };
  });
  return {
    entries,
    placeOverride(id: string, point: { x: number; z: number }, lift = 0.5) {
      const entry = entries.get(id); if (!entry) return;
      place(entry, point.x, point.z); entry.mesh.position.y += lift;
      if (view) entry.label.update(entry.mesh, 0.02, view.camera, canvas, point.x > 8 ? view.patio : view.factory, point.x > 8 ? undefined : view.occluder);
    },
    sync(next: WorldSnapshot | undefined) {
      if (!next || next === snapshot) return;
      snapshot = next; clockOffset = next.serverTime - Date.now();
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
          entry = { ...sprite(agent), session: agent, label, children: new Map(), lastX: point.x, lastZ: point.z };
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
        ? [WORKSTATIONS[session.world.slotIndex ?? -1]?.id].filter((id): id is string => !!id) : []));
    },
    update(elapsed: number, camera: THREE.Camera, showFactory: boolean, showPatio: boolean,
      floor: (point: {x: number; z: number}) => number, occluder: THREE.Object3D) {
      view = { camera, factory: showFactory, patio: showPatio, occluder };
      if (!snapshot) return;
      const now = Date.now() + clockOffset, frame = Math.floor(elapsed * 6) % 4;
      for (const entry of entries.values()) {
        const agent = entry.session, point = agentPosition(agent, now, snapshot.environment);
        const dx = point.x - entry.lastX, dz = point.z - entry.lastZ;
        const moving = Math.hypot(dx, dz) > 0.001 || !!agent.manualControl?.moving;
        const facing = moving ? (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'right' : 'left') : (dz > 0 ? 'down' : 'up')) : agent.world.facing;
        const working = !agent.manualControl && agent.world.zone === 'work' && isWorking(agent.activity) && !moving;
        const row = moving ? AVATAR_ANIMATIONS.indexOf(`walk_${facing}`) : working ? 5 : agent.activity === 'idle' ? 6 : 0;
        place(entry, point.x, point.z); entry.lastX = point.x; entry.lastZ = point.z;
        const floorY = point.x > 8 ? 0.018 : floor({x: point.x, z: point.z - 1.95});
        setFrame(entry, row, frame, floorY);
        if (entry.effect && performance.now() < entry.effect.until) {
          entry.label.setActivity(entry.effect.text);
          if (['jump', 'shoot', 'wave', 'task completed'].includes(entry.effect.text)) entry.mesh.position.y += Math.abs(Math.sin(elapsed * 7)) * 0.1;
        } else if (entry.effect) { entry.effect = undefined; entry.label.setActivity([agent.activity, agent.currentTool].filter(Boolean).join(' · ')); }
        entry.mesh.material.opacity = agent.activity === 'stopped' ? 0.45 : 1;
        entry.mesh.material.transparent = agent.activity === 'stopped';
        entry.label.element.classList.toggle('patio-agent', point.x > 8);
        entry.label.update(entry.mesh, floorY, camera, canvas, point.x > 8 ? showPatio : showFactory, point.x > 8 ? undefined : occluder);
        let index = 0;
        for (const child of entry.children.values()) {
          const angle = index++ * 2.4 + 0.5;
          place(child, point.x + Math.cos(angle) * 0.42, point.z + 0.2 + Math.sin(angle) * 0.28);
          setFrame(child, working ? 5 : moving ? row : 0, frame, floorY, 0.58);
        }
      }
    },
    dispose() { stopEffects(); for (const entry of entries.values()) { removeSprite(entry); entry.label.dispose(); entry.children.forEach(removeSprite); } entries.clear(); },
  };
}
