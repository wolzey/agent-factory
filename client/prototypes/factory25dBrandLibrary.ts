import * as THREE from 'three';
import { createBrandShelf } from './factory25dBrandShelf';
import { factoryHost } from './factory25dBoardData';
import { factoryIdentity, onFactoryBranding } from './factory25dBranding';
import { blendCamera, cameraPose } from './factory25dCameraMotion';
import { brandClosePose } from './factory25dBrandFraming';
import './factory25dBrandLibrary.css';

type Room = 'factory' | 'patio';
export function createBrandLibrary(parent: THREE.Group, canvas: HTMLCanvasElement, onOpen: () => void,
  roomCamera: THREE.OrthographicCamera, renderer: THREE.WebGLRenderer) {
  const abort = new AbortController(), events = { signal: abort.signal };
  const shelf = createBrandShelf(parent);
  const triggers: Array<{ target: THREE.Object3D; room: Room; button: HTMLButtonElement; bounds: THREE.Box3 }> = [];
  let active = false, opening = false, moving = false, available: Room | undefined, previousFocus: HTMLElement | null = null;
  const camera = roomCamera.clone(), reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let sourceCamera = roomCamera, from = cameraPose(roomCamera), roomPose = cameraPose(roomCamera), started = 0;
  let originalHeight = 1, width = 0, height = 0, activeTarget: THREE.Object3D = shelf.root;
  const originalSize = new THREE.Vector2(), focus = new THREE.Vector3(), size = new THREE.Vector3();
  const targetRotation = new THREE.Quaternion();
  let closePose = cameraPose(camera);
  const dialog = document.createElement('dialog'); dialog.className = 'brand-library';
  dialog.setAttribute('aria-labelledby', 'brand-library-title');
  dialog.innerHTML = `<section class="brand-library-sheet"><header class="brand-library-header"><div><p>FACTORY / BRAND SHELF</p><h2 id="brand-library-title">the brand shelf</h2><span>Artwork shared by everyone in this factory.</span></div></header><div class="brand-library-tools"><div class="brand-library-filters" role="group" aria-label="Filter by brand"></div><input type="search" aria-label="Find a logo" placeholder="find a logo…"></div><p class="brand-library-count" role="status"></p><div class="brand-library-grid"></div><footer>Branding is configured by this factory’s server administrator.</footer></section><nav class="brand-library-dock pixel-island"><button type="button">← room</button><span>brand shelf</span></nav>`;
  document.body.append(dialog);
  const grid = dialog.querySelector<HTMLElement>('.brand-library-grid')!;
  const count = dialog.querySelector<HTMLElement>('.brand-library-count')!;
  const search = dialog.querySelector<HTMLInputElement>('input')!;
  const filters = dialog.querySelector<HTMLElement>('.brand-library-filters')!;
  const back = dialog.querySelector<HTMLButtonElement>('nav button')!;
  const sheet = dialog.querySelector<HTMLElement>('.brand-library-sheet')!;
  const artifactLayer = document.createElement('div'); artifactLayer.className = 'brand-artifacts'; dialog.prepend(artifactLayer);
  const artifactButtons: Array<{target: THREE.Object3D; button: HTMLButtonElement; offset: THREE.Vector3}> = [];
  function fit() {
    width = canvas.clientWidth; height = canvas.clientHeight;
    const pixels = Math.min(1280, Math.max(360, width));
    renderer.setSize(pixels, pixels * height / Math.max(1, width), false);
    closePose = brandClosePose(focus, targetRotation, size, width, height);
  }
  function finishClose() {
    active = moving = opening = false; dialog.close(); document.body.classList.remove('brand-open');
    renderer.setSize(originalSize.x, originalSize.y, false);
    if (previousFocus?.isConnected) { previousFocus.hidden = false; previousFocus.focus({ preventScroll: true }); }
  }
  function close() {
    if (!active || !opening) return;
    opening = false; moving = true; from = cameraPose(camera); started = performance.now();
    sheet.inert = true;
  }
  function open(button: HTMLButtonElement, target: THREE.Object3D) {
    if (active || !available || button.hidden) return;
    previousFocus = button; activeTarget = target; onOpen();
    roomPose = cameraPose(sourceCamera); from = cameraPose(sourceCamera); originalHeight = canvas.clientHeight;
    renderer.getSize(originalSize); active = opening = moving = true; started = performance.now();
    activeTarget.updateWorldMatrix(true, true);
    new THREE.Box3().setFromObject(activeTarget).getCenter(focus);
    new THREE.Box3().setFromObject(activeTarget).getSize(size);
    activeTarget.getWorldQuaternion(targetRotation);
    document.body.classList.add('brand-open'); dialog.showModal(); fit();
    from.height *= height / Math.max(1, originalHeight);
    blendCamera(camera, from, closePose, 0, width / Math.max(1, height), focus);
    sheet.style.opacity = '0'; sheet.inert = true; back.focus();
  }
  function addTrigger(target: THREE.Object3D, room: Room, label: string) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'brand-hotspot'; button.hidden = true;
    button.setAttribute('aria-label', label); button.title = 'open the brand shelf';
    canvas.parentElement!.append(button); button.addEventListener('click', () => open(button, target), events);
    target.updateWorldMatrix(true, true);
    const localBounds = new THREE.Box3().setFromObject(target).applyMatrix4(target.matrixWorld.clone().invert());
    triggers.push({ target, room, button, bounds: localBounds });
  }
  function paint() {
    const identity=factoryIdentity(), path=identity.branding?.logoUrl;
    dialog.querySelector('header p')!.textContent=identity.title+' / BRAND SHELF';
    filters.hidden=true; grid.replaceChildren();
    const matches=path && (identity.title+' logo').toLowerCase().includes(search.value.toLowerCase());
    count.textContent=path?'1 shared factory logo':'Neutral artwork · no logo configured';
    if(matches) {
      const card=document.createElement('article');card.className='brand-asset';
      const preview=document.createElement('div');preview.className='brand-asset-preview';preview.dataset.surface='ink';
      const image=document.createElement('img');image.src=new URL(path,factoryHost()).href;image.alt=identity.title+' logo';preview.append(image);
      const details=document.createElement('div');details.className='brand-asset-details';
      const title=document.createElement('h3');title.textContent=identity.title;
      const link=document.createElement('a');link.href=image.src;link.download='factory-logo.png';link.textContent='Download PNG ↓';
      details.append(title,link);card.append(preview,details);grid.append(card);
    } else { const empty=document.createElement('p');empty.textContent=path?'No logo matches your search.':'The server administrator can add a factory logo.';grid.append(empty); }
  }
  const stopBranding=onFactoryBranding(paint);
  search.addEventListener('input', paint, events); back.addEventListener('click', close, events);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); }, events);
  dialog.addEventListener('keydown', event => event.stopPropagation(), events);
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); }, events);
  for (const [name, label] of [
    ['fluid-logo-sculpture', 'Block sculpture', 'Fluid', 'symbol'],
    ['we-commerce-postcard', 'Factory postcard', 'We Commerce', 'signature'],
    ['mist-logo-plaque', 'Factory plaque', 'Mist', ''],
    ['fluid-mug', 'Factory mug', 'Fluid', ''],
    ['we-commerce-enamel-badge', 'Factory badge', 'We Commerce', 'symbol'],
    ['folded-we-commerce-tee', 'Factory shirt', 'We Commerce', 'symbol'],
  ]) {
    const target = shelf.root.getObjectByName(name); if (!target) continue;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'brand-artifact-hotspot';
    button.setAttribute('aria-label', `View logos on ${label}`); button.title = label; button.hidden = true;
    button.addEventListener('click', () => {
      search.value = '';
      for (const artifact of artifactButtons) artifact.button.setAttribute('aria-pressed', String(artifact.button === button));
      paint(); sheet.scrollTo({ top: 0, behavior: reduced.matches ? 'instant' : 'smooth' });
    }, events);
    artifactLayer.append(button);
    // SVG geometry loads asynchronously; its world-space center is defined by the plinth.
    const offset = name === 'fluid-logo-sculpture' ? new THREE.Vector3(31, 34, 5)
      : name === 'fluid-mug' ? new THREE.Vector3(0, .10, 0)
      : name === 'folded-we-commerce-tee' ? new THREE.Vector3(0, .06, .02) : new THREE.Vector3();
    artifactButtons.push({ target, button, offset });
  }
  addTrigger(shelf.target, 'factory', 'Open the brand artifact shelf'); paint();
  const bounds = new THREE.Box3(), point = new THREE.Vector3();
  return { camera, focusPoint: () => focus, isActive: () => active, addTrigger,
    update(now: number, viewCamera: THREE.OrthographicCamera, room?: Room) {
      shelf.update();
      available = room;
      if (!active) sourceCamera = viewCamera;
      if (active) {
        if (width !== canvas.clientWidth || height !== canvas.clientHeight) fit();
        const t = reduced.matches || !moving ? 1 : THREE.MathUtils.clamp((now - started) / 800, 0, 1);
        const to = opening ? closePose
          : { ...roomPose, height: roomPose.height * height / Math.max(1, originalHeight) };
        blendCamera(camera, from, to, t, width / Math.max(1, height), focus);
        sheet.inert = !opening || t < .85;
        sheet.style.opacity = String(opening ? THREE.MathUtils.smoothstep(t, .3, .85) : 1 - THREE.MathUtils.smoothstep(t, 0, .35));
        const rect = canvas.getBoundingClientRect();
        for (const artifact of artifactButtons) {
          artifact.button.hidden = !opening || t < .85 || activeTarget !== shelf.root;
          if (artifact.button.hidden) continue;
          artifact.target.localToWorld(point.copy(artifact.offset)).project(camera);
          artifact.button.style.left = `${rect.left + (point.x + 1) * width / 2}px`;
          artifact.button.style.top = `${rect.top + (1 - point.y) * height / 2}px`;
        }
        if (t === 1) {
          moving = false;
          // Slice still reports the modal's room availability for this frame.
          // Leave the restored trigger focus intact until its next normal frame.
          if (!opening) { finishClose(); return; }
        }
      }
      for (const { target, room: targetRoom, button, bounds: localBounds } of triggers) {
        button.hidden = active || room !== targetRoom;
        if (button.hidden) continue;
        target.updateWorldMatrix(true, false); bounds.copy(localBounds).applyMatrix4(target.matrixWorld);
        let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity, inFront = false;
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
          point.set(x, y, z).project(viewCamera); inFront ||= point.z >= -1 && point.z <= 1;
          const px = (point.x + 1) * canvas.clientWidth / 2, py = (1 - point.y) * canvas.clientHeight / 2;
          left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
        }
        if (!inFront || right < 0 || left > canvas.clientWidth || bottom < 0 || top > canvas.clientHeight) { button.hidden = true; continue; }
        const width = Math.max(44, right - left), height = Math.max(44, bottom - top);
        Object.assign(button.style, { left: `${(left + right - width) / 2}px`, top: `${(top + bottom - height) / 2}px`, width: `${width}px`, height: `${height}px` });
      }
    },
    dispose() {
      if (active) finishClose(); abort.abort(); shelf.dispose(); dialog.remove(); triggers.forEach(({ button }) => button.remove());
      stopBranding();
    },
  };
}
