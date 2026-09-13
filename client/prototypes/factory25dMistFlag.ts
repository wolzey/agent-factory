import * as THREE from 'three';
import { createFactoryInk } from './factory25dFactoryInk';
import { onFactoryBranding } from './factory25dBranding';
import { MIST_FLAG, createMistClothGeometry, mistClothVertex } from './factory25dMistCloth';
import { createPatioFlagPole } from './factory25dPatioFlagCloth';
import './factory25dMistFlag.css';

/** Factory artwork forms an interactive ink layer on a lit cloth mesh. */
export function createMistFlag(parent: THREE.Scene, canvas: HTMLCanvasElement) {
  const root = new THREE.Group(); root.name = 'interactive-mist-patio-flag';
  root.position.set(MIST_FLAG.x, 0, MIST_FLAG.z); parent.add(root);
  const resources: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];
  function part(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z = 0) {
    resources.push(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh;
  }
  const pole = createPatioFlagPole(); root.add(pole.root);

  // A measurable, inert host lets the original pointer API retain its exact
  // coordinate system. It has no autonomous RAF, audio, focus or accessibility UI.
  const logo = createFactoryInk();
  logo.className = 'mist-flag-source'; logo.inert = true; logo.setAttribute('aria-hidden', 'true');
  for (const [name, value] of Object.entries({ mode: 'live', color: '#080d12', cols: '52', variant: 'glyph', sound: 'off', 'external-clock': '' })) logo.setAttribute(name, value);
  document.body.append(logo); logo.seek(54); logo.advance(0);
  const surface = document.createElement('canvas'); surface.width = 1024; surface.height = 576;
  const ink = surface.getContext('2d')!;
  const fabricCanvas = document.createElement('canvas'); fabricCanvas.width = surface.width; fabricCanvas.height = surface.height;
  const weave = fabricCanvas.getContext('2d')!;
  weave.fillStyle = '#d6d9c9'; weave.fillRect(0, 0, 1024, 576);
  weave.fillStyle = 'rgba(69,82,77,.045)';
  for (let y = 0; y < 576; y += 4) weave.fillRect(0, y, 1024, 1);
  weave.fillStyle = 'rgba(246,242,220,.13)';
  for (let x = 0; x < 1024; x += 4) weave.fillRect(x, 0, 1, 576);
  weave.strokeStyle = 'rgba(61,75,70,.24)'; weave.lineWidth = 2; weave.setLineDash([5, 5]); weave.strokeRect(12, 12, 1000, 552);
  weave.fillStyle = '#b8c0b3'; weave.fillRect(0, 0, 13, 576);
  const texture = new THREE.CanvasTexture(surface); texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter; texture.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .94, metalness: 0, side: THREE.DoubleSide });
  resources.push(texture, material);
  const geometry = createMistClothGeometry();
  const cloth = part(geometry, material, MIST_FLAG.width / 2 + .035, MIST_FLAG.top - MIST_FLAG.height / 2);
  cloth.name = 'mist-flag-cloth';
  const positions = geometry.getAttribute('position'), uvs = geometry.getAttribute('uv');
  function paint() {
    ink.drawImage(fabricCanvas, 0, 0);
    ink.drawImage(logo.canvas,0,0,1024,576); texture.needsUpdate=true;
  }
  paint();
  const stopBranding=onFactoryBranding(paint);
  const host = canvas.parentElement!, abort = new AbortController(), events = { signal: abort.signal, capture: true };
  const button = document.createElement('button'); button.type = 'button'; button.className = 'mist-flag-hotspot'; button.hidden = true;
  button.setAttribute('aria-label', 'Scatter the factory flag artwork'); button.title = 'factory flag · hover to stir, click to scatter'; host.append(button);
  let disposed = false, available = false, camera: THREE.Camera | undefined, reduced = false, hovered = false;
  let pointer: Pick<MouseEvent, 'clientX' | 'clientY' | 'target'> | undefined;
  let lastInteraction = -Infinity, inkAwake = false;
  function wakeInk() { lastInteraction=performance.now(); if(!inkAwake){logo.release();inkAwake=true;} }
  let lastCloth = -1, lastInk = -1, inkTime = 0, previousReduced: boolean | undefined, down: { x: number; y: number } | undefined;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), point = new THREE.Vector3(), bounds = new THREE.Box3();
  function leave() { pointer = undefined; if (hovered) logo.unstir(); hovered = false; button.classList.remove('is-hovered'); }
  function hit(event: Pick<MouseEvent, 'clientX' | 'clientY' | 'target'>) {
    if (!available || !camera || disposed) return undefined;
    if (event.target instanceof Element && event.target !== button && event.target.closest('button, dialog, input, a, [role="dialog"]')) return undefined;
    const rect = canvas.getBoundingClientRect();
    ndc.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    ray.setFromCamera(ndc, camera); cloth.updateWorldMatrix(true, false);
    return ray.intersectObject(cloth)[0]?.uv;
  }
  function refreshHover() {
    const uv = pointer && hit(pointer);
    if (!uv || reduced) { if (hovered) logo.unstir(); hovered = false; button.classList.remove('is-hovered'); return; }
    wakeInk(); logo.stir(uv.x*1024,(1-uv.y)*576);
    hovered = true; button.classList.add('is-hovered');
  }
  host.addEventListener('pointermove', event => {
    pointer = { clientX: event.clientX, clientY: event.clientY, target: event.target }; refreshHover();
  }, events);
  host.addEventListener('pointerleave', leave, events);
  host.addEventListener('pointercancel', () => { down = undefined; leave(); }, events);
  host.addEventListener('pointerdown', event => { down = hit(event) ? { x: event.clientX, y: event.clientY } : undefined; }, events);
  host.addEventListener('click', event => {
    const keyboard = event.target === button && event.detail === 0;
    const clicked = keyboard || down && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 8 && hit(event);
    down = undefined;
    if (!available || !clicked) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!reduced) { wakeInk(); logo.blow(); }
  }, events);
  // Project a keyboard target. Pointer events still test the actual bent mesh,
  // never an axis-aligned overlay extending beyond the moving cloth.
  function projectTarget(view: THREE.Camera) {
    cloth.updateWorldMatrix(true, false); geometry.computeBoundingBox(); bounds.copy(geometry.boundingBox!).applyMatrix4(cloth.matrixWorld);
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity, inFront = false;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      point.set(x, y, z).project(view); inFront ||= point.z >= -1 && point.z <= 1;
      const px = (point.x + 1) * canvas.clientWidth / 2, py = (1 - point.y) * canvas.clientHeight / 2;
      left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
    }
    const visible = inFront && right > 0 && left < canvas.clientWidth && bottom > 0 && top < canvas.clientHeight;
    button.hidden = !available || !visible || reduced;
    Object.assign(button.style, { left: `${left}px`, top: `${top}px`, width: `${Math.max(44, right - left)}px`, height: `${Math.max(44, bottom - top)}px` });
    return visible;
  }
  return { root, cloth,
    update(elapsed: number, dt: number, wind: number, view: THREE.Camera, enabled: boolean, reduceMotion: boolean) {
      if (disposed) return;
      camera = view; available = enabled && !document.hidden; reduced = reduceMotion;
      if (!available) { button.hidden = true; inkTime = 0; leave(); return; }
      const changed = previousReduced !== reduced; previousReduced = reduced;
      const tick = reduced ? 0 : Math.floor(elapsed * MIST_FLAG.fps);
      if (tick !== lastCloth || changed) {
        lastCloth = tick;
        for (let i = 0; i < positions.count; i++) {
          const p = mistClothVertex(uvs.getX(i), uvs.getY(i), elapsed, wind, reduced); positions.setXYZ(i, p.x, p.y, p.z);
        }
        positions.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingSphere();
        refreshHover();
      }
      if (!projectTarget(view)) { leave(); inkTime = 0; return; }
      if (changed) { inkAwake=false; inkTime=0; }
      if (changed && reduced) { leave(); logo.replay(); logo.seek(54); logo.advance(0); paint(); }
      else if (changed) { logo.seek(54); logo.advance(0); paint(); }
      if(inkAwake && !hovered && performance.now()-lastInteraction>4500) {
        logo.replay(); logo.seek(54); logo.advance(0); paint(); inkAwake=false; inkTime=0;
      }
      if (reduced || !inkAwake) return;
      inkTime += Math.min(dt, .1);
      const inkTick = Math.floor(elapsed * 30);
      if (inkTick !== lastInk) { lastInk = inkTick; logo.advance(inkTime); inkTime = 0; paint(); }
    },
    dispose() {
      if (disposed) return; disposed = true; abort.abort(); leave(); button.remove(); stopBranding(); logo.dispose(); root.removeFromParent(); pole.dispose(); resources.forEach(resource => resource.dispose());
    },
  };
}
