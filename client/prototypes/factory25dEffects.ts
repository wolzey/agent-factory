import * as THREE from 'three';
import type { EnvironmentType } from '@shared/types';
import { signTexture } from './factory25dLabels';
import { projectPosition } from './factory25dWorld';
import { effectProgress, effectSeed, FactoryEffectsState, rpsPhase, vortexStrength, type AgentEffect } from './factory25dEffectsState';

export type EffectAnchor = { x: number; y: number; z: number };
type Decoration = { group: THREE.Group; particles?: THREE.InstancedMesh; icons?: Map<string, THREE.Mesh> };
const patterns: Record<string, string> = {
  note: '000111/000101/000101/000100/011100/111100/011000',
  guitar: '0000000001/0000000011/0000000110/0000001100/0011001100/0111111000/1100110000/1100111000/0111111000/0011100000',
  gun: '111111110/111111111/011111100/011000000/011000000',
  hand: '00101000/00101100/00101110/00111110/10111110/11111110/01111110/00111100',
  star: '0001000/0011100/1111111/0111110/0011100/0110110/1000001',
  flex: '011000000011/111000000111/110000000011/110010010011/111111111111/011111111110/001111111100',
  fire: '000010000/000110000/001110100/011111100/011111110/111111110/111111111/011111110/001111100',
  rock: '0001111000/0011111100/0111111110/1111111111/1111111111/0111111110/0011111100',
  paper: '001010100/001010101/001010101/001111111/101111111/111111111/011111111/001111110',
  scissors: '1100000011/0110000110/0011001100/0001111000/0000110000/0001111000/0011111100/0011111100',
};
const colors = ['#e8b35f', '#dba8c3', '#92c3bd', '#9ba6d0', '#f1d690'];

/** Small pixel props and instanced particles share resources and expire with their clock state. */
export function createFactoryEffects(factory: THREE.Scene, patio: THREE.Scene) {
  const geometry = new THREE.BoxGeometry(1, 1, 1), plane = new THREE.PlaneGeometry(1, 1);
  const materials = new Map<string, THREE.MeshBasicMaterial>();
  const textures = new Map<string, THREE.Texture>();
  const decorations = new Map<number, Decoration & { sessionId: string }>();
  const shots = new Map<number, { group: THREE.Group; from: EffectAnchor; to: EffectAnchor[] }>();
  const vortexGroups = new Map<string, THREE.Group[]>();
  const matrix = new THREE.Object3D(), color = new THREE.Color();
  const material = (ink: string) => {
    if (!materials.has(ink)) materials.set(ink, new THREE.MeshBasicMaterial({ color: ink, toneMapped: false }));
    return materials.get(ink)!;
  };
  function image(key: string, text = false, ink = '#f2d391') {
    const cacheKey = `${key}:${text}:${ink}`;
    if (!textures.has(cacheKey)) {
      if (text) textures.set(cacheKey, signTexture(key, ink, '#182e36', 2));
      else {
        const rows = patterns[key].split('/'), canvas = document.createElement('canvas');
        canvas.width = rows[0].length; canvas.height = rows.length;
        const ctx = canvas.getContext('2d')!; ctx.fillStyle = ink;
        rows.forEach((row, y) => [...row].forEach((pixel, x) => { if (pixel === '1') ctx.fillRect(x, y, 1, 1); }));
        const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
        textures.set(cacheKey, texture);
      }
      materials.set(cacheKey, new THREE.MeshBasicMaterial({ map: textures.get(cacheKey), transparent: true, alphaTest: .08,
        side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    }
    return materials.get(cacheKey)!;
  }
  function icon(group: THREE.Group, name: string, x = 0, y = .95, size = .27, ink?: string) {
    const mesh = new THREE.Mesh(plane, image(name, false, ink));
    mesh.position.set(x, y, .06); mesh.scale.set(size, size, 1); group.add(mesh); return mesh;
  }
  function label(group: THREE.Group, text: string, ink = '#f2d391') {
    const mesh = new THREE.Mesh(plane, image(text, true, ink));
    const aspect = (mesh.material.map!.image as HTMLCanvasElement).width / (mesh.material.map!.image as HTMLCanvasElement).height;
    mesh.scale.set(Math.min(1.6, aspect * .21), .21, 1); mesh.position.set(0, 1.04, .02); group.add(mesh); return mesh;
  }
  function box(group: THREE.Group, dimensions: [number, number, number], point: [number, number, number], ink: string) {
    const mesh = new THREE.Mesh(geometry, material(ink)); mesh.scale.set(...dimensions); mesh.position.set(...point); group.add(mesh); return mesh;
  }
  function particles(group: THREE.Group, count: number, green = false) {
    const mesh = new THREE.InstancedMesh(geometry, material('#ffffff'), count);
    mesh.frustumCulled = false;
    for (let i = 0; i < count; i++) mesh.setColorAt(i, color.set(green ? ['#9caf88', '#b5bf9b', '#8eae91'][i % 3] : colors[i % colors.length]));
    group.add(mesh); return mesh;
  }
  function build(effect: AgentEffect): Decoration {
    const group = new THREE.Group(), item: Decoration = { group };
    switch (effect.kind) {
      case 'dance': icon(group, 'note', -.3); icon(group, 'note', .33, 1.13, .22, '#a8c5d8'); break;
      case 'guitar': icon(group, 'guitar', .05, .35, .51, '#e3a661'); icon(group, 'note', .3); break;
      case 'gun': case 'shot': {
        const prop = icon(group, 'gun', effect.facing === 'left' ? -.27 : .27, .35, .31, '#cd9170');
        if (effect.facing === 'left') prop.scale.x *= -1;
        break;
      }
      case 'laugh': label(group, 'HA HA', '#ecd281'); break;
      case 'wave': icon(group, 'hand', .29, .58, .25, '#e8c59a'); break;
      case 'sleep': label(group, 'Z Z Z', '#acbcd8'); break;
      case 'explode': item.particles = particles(group, 28); break;
      case 'dizzy': for (let i = 0; i < 3; i++) icon(group, 'star', 0, 0, .17); break;
      case 'flex': icon(group, 'flex', 0, .63, .65, '#e5bd96'); break;
      case 'rage': icon(group, 'fire', 0, .94, .32, '#e9ad6b'); break;
      case 'fart': item.particles = particles(group, 10, true); break;
      case 'hit': label(group, 'BONK', '#d8b1b3'); break;
      case 'jump': for (const x of [-.2, .2]) icon(group, 'star', x, .15, .12); break;
      case 'return': label(group, 'BACK AGAIN', '#bad29d'); item.particles = particles(group, 12, true); break;
      case 'arrive': item.particles = particles(group, 8); break;
      case 'commit': case 'merge':
        label(group, effect.kind === 'commit' ? 'COMMIT' : 'MERGED');
        item.particles = particles(group, effect.kind === 'commit' ? 35 : 60);
        if (effect.kind === 'merge') {
          const trophy = new THREE.Group(); group.add(trophy); trophy.position.set(.5, .55, .05);
          box(trophy, [.21, .18, .14], [0, .15, 0], '#e5b95b'); box(trophy, [.055, .16, .05], [0, 0, 0], '#ddb05a');
          box(trophy, [.21, .06, .14], [0, -.1, 0], '#ba8946');
          for (const x of [-.15, .15]) { box(trophy, [.045, .16, .05], [x, .17, 0], '#e5b95b'); box(trophy, [.1, .04, .05], [x * .8, .09, 0], '#e5b95b'); }
        }
        break;
      case 'rps':
        item.icons = new Map();
        for (const choice of ['rock', 'paper', 'scissors']) item.icons.set(choice, icon(group, choice, 0, .98, .32));
        for (const [outcome, text, ink] of [['win', 'WINNER', '#a3d1aa'], ['lose', 'LOST', '#d5acb0'], ['draw', 'DRAW', '#e5ca91']]) item.icons.set(outcome, label(group, text, ink));
        break;
    }
    return item;
  }
  function remove(group: THREE.Group) {
    group.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
    group.removeFromParent();
  }
  function sceneAt(x: number) { return x > 8 ? patio : factory; }
  function attach(group: THREE.Group, point: EffectAnchor) {
    const scene = sceneAt(point.x); if (group.parent !== scene) scene.add(group);
    group.position.set(point.x, point.y, point.z);
  }
  function updateParticles(item: Decoration, effect: AgentEffect, now: number, reduced: boolean) {
    const mesh = item.particles; if (!mesh) return;
    const p = effectProgress(effect, now), seed = effectSeed(effect.sessionId), phase = p * Math.PI;
    for (let i = 0; i < mesh.count; i++) {
      const n = ((i * 73 + seed) % 997) / 997, angle = i * 2.399 + seed;
      let radius = .25 + p * (.5 + n), y = .4 + Math.sin(phase) * (.5 + n);
      if (effect.kind === 'fart') { radius = .1 + p * .45; y = .12 + p * .32; }
      if (effect.kind === 'return' || effect.kind === 'arrive') { radius *= .45; y = p * .65; }
      if (reduced) { radius = .4 + n * .2; y = .5 + n * .45; }
      matrix.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius * .5);
      const size = effect.kind === 'fart' ? .13 * (1 - p * .6) : .035 * (1 - p * .5);
      matrix.scale.set(size, size * (effect.kind === 'fart' ? 1 : 1.6), size); matrix.rotation.set(n * 4 + (reduced ? 0 : p * 8), angle, 0);
      matrix.updateMatrix(); mesh.setMatrixAt(i, matrix.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  function buildVortex() {
    const group = new THREE.Group();
    // Stepped square rings suit the pixel room and avoid a screen-sized flash.
    for (let i = 0; i < 7; i++) {
      const ring = new THREE.Group(); group.add(ring);
      const width = 1.2 + i * .26;
      for (const z of [-width, width]) box(ring, [width * 2, .025, .035], [0, 0, z], i % 2 ? '#9bb0d3' : '#88b8b5');
      for (const x of [-width, width]) box(ring, [.035, .025, width * 2], [x, 0, 0], i % 2 ? '#9bb0d3' : '#88b8b5');
      ring.position.y = .1 + i * .21;
    }
    const title = label(group, 'VORTEX', '#c3c6e1'); title.position.y = 2;
    return group;
  }
  return {
    follow(sessionId: string, point: EffectAnchor) {
      for (const item of decorations.values()) if (item.sessionId === sessionId) attach(item.group, point);
    },
    update(state: FactoryEffectsState, now: number, anchors: Map<string, EffectAnchor>, environment: EnvironmentType, reduced = false) {
      state.prune(now);
      const activeIds = new Set([...state.effects.values()].map(effect => effect.id));
      for (const [id, item] of decorations) if (!activeIds.has(id)) { remove(item.group); decorations.delete(id); }
      for (const effect of state.effects.values()) {
        const anchor = anchors.get(effect.sessionId); if (!anchor) continue;
        let item = decorations.get(effect.id);
        if (!item) { item = { ...build(effect), sessionId: effect.sessionId }; decorations.set(effect.id, item); }
        attach(item.group, anchor); item.group.visible = now >= effect.startedAt;
        const t = (now - effect.startedAt) / 1000, p = effectProgress(effect, now);
        item.group.scale.setScalar(reduced ? 1 : Math.min(1, p * 12, (1 - p) * 10));
        if (effect.kind === 'dizzy') item.group.children.forEach((star, i) => star.position.set(Math.cos(t * (reduced ? 0 : 3) + i * 2.1) * .3, .88, Math.sin(t * (reduced ? 0 : 3) + i * 2.1) * .14));
        if (effect.kind === 'wave') item.group.children[0].rotation.z = reduced ? -.2 : Math.sin(t * 12) * .4;
        if (effect.kind === 'rps') for (const [phase, icon] of item.icons!) icon.visible = phase === rpsPhase(effect, now);
        updateParticles(item, effect, now, reduced);
      }
      const activeShots = new Set(state.shots.map(shot => shot.id));
      for (const [id, item] of shots) if (!activeShots.has(id)) { remove(item.group); shots.delete(id); }
      for (const shot of state.shots) {
        let item = shots.get(shot.id);
        if (!item) {
          const point = anchors.get(shot.sessionId); if (!point) continue;
          const from = { ...point, y: point.y + .38 };
          const direction = shot.facing === 'left' ? [-1, 0] : shot.facing === 'right' ? [1, 0] : shot.facing === 'up' ? [0, -1] : [0, 1];
          const to = shot.targetSessionIds.map(id => anchors.get(id)).filter((point): point is EffectAnchor => !!point).map(point => ({ ...point, y: point.y + .35 }));
          if (!to.length) to.push({ x: from.x + direction[0] * 2.8, y: from.y, z: from.z + direction[1] * 2.8 });
          const group = new THREE.Group(); sceneAt(from.x).add(group);
          for (const point of to) { const pellet = box(group, [.09, .07, .09], [from.x, from.y, from.z], '#f4c879'); pellet.userData.target = point; }
          item = { group, from, to }; shots.set(shot.id, item);
        }
        const p = effectProgress(shot, now);
        item.group.visible = p < 1 && !reduced;
        item.group.children.forEach((pellet, i) => pellet.position.set(
          THREE.MathUtils.lerp(item.from.x, item.to[i].x, p), THREE.MathUtils.lerp(item.from.y, item.to[i].y, p), THREE.MathUtils.lerp(item.from.z, item.to[i].z, p)));
      }
      const activeVortex = state.vortex;
      for (const [id, groups] of vortexGroups) if (id !== activeVortex?.id) { groups.forEach(remove); vortexGroups.delete(id); }
      for (const event of activeVortex ? [activeVortex] : []) {
        let groups = vortexGroups.get(event.id);
        if (!groups) { groups = [buildVortex(), buildVortex()]; vortexGroups.set(event.id, groups); factory.add(groups[0]); patio.add(groups[1]); }
        const configured = event.data?.center;
        const customCenter = configured && typeof configured === 'object' && 'x' in configured && 'y' in configured && typeof configured.x === 'number' && typeof configured.y === 'number'
          ? projectPosition({ x: configured.x, y: configured.y }, environment) : null;
        const strength = vortexStrength(event, now), t = (now - event.startedAt) / 1000;
        groups.forEach((group, side) => {
          group.position.set(customCenter?.x ?? (side ? 15 : 0), .025, customCenter?.z ?? (side ? 4 : .8));
          group.visible = now >= event.startedAt; group.scale.setScalar(reduced ? 1 : Math.max(.02, strength));
          group.children.forEach((ring, i) => { if (ring instanceof THREE.Group) ring.rotation.y = event.seed * .01 + i * .2 + (reduced ? 0 : t * (.2 + i * .035)); });
        });
      }
    },
    dispose() {
      for (const item of decorations.values()) remove(item.group); for (const item of shots.values()) remove(item.group);
      for (const groups of vortexGroups.values()) groups.forEach(remove);
      decorations.clear(); shots.clear(); vortexGroups.clear(); materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose());
      geometry.dispose(); plane.dispose();
    },
  };
}
