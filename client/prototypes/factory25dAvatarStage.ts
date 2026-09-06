import * as THREE from 'three';
import type { AvatarConfig } from '@shared/types';
import { DEFAULT_AVATAR } from '@shared/constants';
import { avatarSheet, AVATAR_ANIMATIONS } from './factory25dAvatar';
import { avatarTexture } from './factory25dAvatarTexture';
import { blendCamera, cameraPose } from './factory25dCameraMotion';
import type { createLiveAgents } from './factory25dLiveAgents';

/** A local draft on the selected agent's spot, lit and rendered by the room itself. */
export function createAvatarStage(factory: THREE.Scene, patio: THREE.Scene,
  agents: ReturnType<typeof createLiveAgents>, canvas: HTMLCanvasElement, renderer: THREE.WebGLRenderer,
  currentCamera: () => THREE.OrthographicCamera, selected: () => string | undefined) {
  const camera = currentCamera().clone(), targetCamera = camera.clone();
  const destination = cameraPose(targetCamera), returning = cameraPose(camera);
  const material = new THREE.MeshStandardMaterial({ alphaTest: .08, side: THREE.DoubleSide, roughness: 1,
    emissive: '#101126', emissiveIntensity: .6 });
  const model = new THREE.Mesh(new THREE.PlaneGeometry(.86, .86), material); model.name = 'avatar-edit-draft';
  model.castShadow = true;
  const key = new THREE.PointLight('#ffe7d1', 0, 3.5, 2), fill = new THREE.PointLight('#c8dfef', 0, 3, 2);
  key.name = 'avatar-edit-key'; fill.name = 'avatar-edit-fill';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let sheet: ReturnType<typeof avatarSheet>, texture: THREE.CanvasTexture | undefined;
  let active = false, entering = false, started = 0, direction = 0, walking = false;
  let targetId: string | undefined, hiddenMesh: THREE.Object3D | undefined, targetScene = factory;
  let originalVisible = true, from = cameraPose(camera), room = from, floor = 0;
  let width = 0, height = 0, roomHeight = 1, lastProgress = -1;
  const anchor = new THREE.Vector3(), focus = new THREE.Vector3(), aim = new THREE.Vector3();
  function restore() { if (hiddenMesh) hiddenMesh.visible = originalVisible; hiddenMesh = undefined; }
  function finish() {
    active = false; restore(); model.removeFromParent(); key.removeFromParent(); fill.removeFromParent();
    document.body.classList.remove('avatar-stage-open'); renderer.setSize(800, 564, false);
    if (!document.querySelector('dialog[open]')) document.querySelector<HTMLButtonElement>('.factory-edit-avatar')?.focus({ preventScroll: true });
  }
  function setAvatar(avatar: AvatarConfig) {
    texture?.dispose(); ({ sheet, texture } = avatarTexture(avatar));
    material.map = texture; material.needsUpdate = true;
  }
  return {
    camera, isActive: () => active, scene: () => targetScene, focusPoint: () => focus,
    open(context: { ownerId: string }) {
      if (active) finish();
      const mine = [...agents.entries.values()].filter(entry => entry.session.ownerId === context.ownerId);
      const entry = mine.find(entry => entry.session.sessionId === selected()) ?? mine[0];
      targetId = entry?.session.sessionId;
      targetScene = entry?.mesh.parent === patio ? patio : factory;
      anchor.copy(entry?.mesh.position ?? new THREE.Vector3(1.65, .45, 7.8));
      floor = entry ? anchor.y - entry.baseHeight : .018;
      if (entry) { hiddenMesh = entry.mesh; originalVisible = hiddenMesh.visible; hiddenMesh.visible = false; }
      model.position.copy(anchor); targetScene.add(model, key, fill);
      model.userData.sessionId = targetId;
      setAvatar(entry?.session.avatar ?? DEFAULT_AVATAR);
      room = cameraPose(currentCamera()); from = room;
      returning.position.copy(room.position); returning.quaternion.copy(room.quaternion);
      roomHeight = Math.max(1, canvas.clientHeight);
      active = entering = true; started = performance.now(); direction = 0; walking = false;
      width = height = 0; lastProgress = -1; document.body.classList.add('avatar-stage-open');
    },
    setAvatar,
    pose(turn: number, walk: boolean) { direction = turn; walking = walk; },
    close() { if (active && entering) { entering = false; from = cameraPose(camera); started = performance.now(); lastProgress = -1; } },
    update(now: number) {
      if (!active) return;
      // Live world updates continue underneath; the draft never edits the session.
      const entry = targetId ? agents.entries.get(targetId) : undefined;
      if (entry && entry.mesh !== hiddenMesh) { restore(); hiddenMesh = entry.mesh; originalVisible = hiddenMesh.visible; }
      if (hiddenMesh) hiddenMesh.visible = false;
      const w = canvas.clientWidth, h = Math.max(1, canvas.clientHeight), aspect = w / h;
      const resized = width !== w || height !== h;
      if (resized) {
        width = w; height = h; renderer.setSize(Math.min(1280, w), Math.min(1280, w) / aspect, false);
        const small = w < 680, span = small ? 2.55 : 2.75;
        focus.copy(anchor); focus.y = floor + .43; aim.copy(focus);
        if (small) aim.y -= span * .27;
        else aim.x += (Math.min(380, w * .38) + 32) * span / h / 2;
        targetCamera.position.set(aim.x, aim.y + .48, aim.z + 3); targetCamera.lookAt(aim);
        destination.position.copy(targetCamera.position); destination.quaternion.copy(targetCamera.quaternion); destination.height = span;
        returning.height = room.height * h / roomHeight;
        key.position.set(focus.x - .55, focus.y + .6, focus.z + .85);
        fill.position.set(focus.x + .6, focus.y + .25, focus.z + .65);
      }
      const progress = reduced.matches ? 1 : Math.min(1, (now - started) / 850);
      if (resized || progress !== lastProgress) blendCamera(camera, from, entering ? destination : returning, progress, aspect);
      lastProgress = progress;
      const brightness = entering ? Math.min(1, (now - started) / 600) : 1 - progress;
      key.intensity = brightness * 3.2; fill.intensity = brightness * 1.3;
      const row = !walking && direction === 0 ? 0 : AVATAR_ANIMATIONS.indexOf(`walk_${['down', 'right', 'up', 'left'][direction]}`);
      const frame = walking && !reduced.matches ? Math.floor(now / 160) % 4 : 0;
      texture?.offset.set(frame / 4, 1 - (row + 1) / AVATAR_ANIMATIONS.length);
      model.position.y = floor + (sheet.feet[row][frame] / 32 - .5) * .86 + .004;
      if (!entering && progress === 1) finish();
    },
    dispose() { finish(); model.geometry.dispose(); material.dispose(); texture?.dispose(); },
  };
}
