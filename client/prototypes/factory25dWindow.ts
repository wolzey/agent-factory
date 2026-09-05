import * as THREE from 'three';
import { requireElement } from './dom';
import { WindowPan } from './factory25dPan';
import { blendCamera, cameraPose, type CameraPose } from './factory25dCameraMotion';

interface WindowOptions {
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  width: number;
  bottom: number;
  top: number;
  onChange: (open: boolean) => void;
}

/** A full-viewport view through the same glass, weather and physical scenery. */
export function createWindowInteraction({
  camera,
  renderer,
  canvas,
  width,
  bottom,
  top,
  onChange,
}: WindowOptions) {
  const trigger = requireElement<HTMLButtonElement>('#window-open');
  const ui = requireElement<HTMLDivElement>('#window-view-ui');
  const navigation = requireElement<HTMLElement>('.window-navigation');
  const back = requireElement<HTMLButtonElement>('#window-back');
  const left = requireElement<HTMLButtonElement>('#window-left');
  const right = requireElement<HTMLButtonElement>('#window-right');
  const controls = requireElement<HTMLDivElement>('.slice-controls');
  const dock = requireElement<HTMLDivElement>('#window-controls');
  const originalParent = controls.parentElement!;
  const nextSibling = controls.nextSibling;
  const weatherCamera = camera.clone();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let open = false;
  const scroll = new WindowPan();
  const scrubber = requireElement<HTMLInputElement>('#window-position');
  let previousTime = performance.now();
  let pointerId: number | null = null;
  let lastPointerX = 0;
  let lastPointerTime = 0;
  let releaseVelocity = 0;
  let started = 0;
  let moving = false;
  let from = cameraPose(camera);
  let room = cameraPose(camera);
  let roomPixelHeight = canvas.clientHeight;
  let lastWidth = 0;
  let lastHeight = 0;
  const destination = new THREE.Vector3();
  const finalQuaternion = new THREE.Quaternion();
  let finalHeight = top - bottom;

  function fit() {
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    finalHeight = Math.min(top - bottom - 0.04, (width - 0.08) / aspect);
    const visibleWidth = finalHeight * aspect;
    scroll.resize((width - visibleWidth) / 2 - 0.02);
    destination.set(scroll.position, (top + bottom) / 2, -2.25);
    const targetCamera = camera.clone();
    targetCamera.position.copy(destination);
    targetCamera.lookAt(scroll.position, (top + bottom) / 2, -4.5);
    finalQuaternion.copy(targetCamera.quaternion);
    const pixelsWide = Math.min(1280, Math.max(640, Math.round(canvas.clientWidth / 1.4)));
    renderer.setSize(pixelsWide, Math.round(pixelsWide / aspect), false);
    lastWidth = canvas.clientWidth;
    lastHeight = canvas.clientHeight;
  }

  function enter(event: MouseEvent) {
    if (open || moving) return;
    const bounds = trigger.getBoundingClientRect();
    const entryX = event.detail ? ((event.clientX - bounds.left) / bounds.width - 0.5) * width : 0;
    room = cameraPose(camera);
    from = cameraPose(camera);
    roomPixelHeight = canvas.clientHeight;
    open = true;
    moving = true;
    started = performance.now();
    document.body.classList.add('weather-open');
    trigger.hidden = true;
    ui.hidden = false;
    navigation.dataset.instant = String(reducedMotion.matches);
    dock.append(controls);
    fit();
    from.height *= canvas.clientHeight / Math.max(1, roomPixelHeight);
    scroll.set(entryX, true);
    destination.x = scroll.position;
    blendCamera(weatherCamera, from, { position: destination, quaternion: finalQuaternion, height: finalHeight }, 0,
      canvas.clientWidth / Math.max(1, canvas.clientHeight));
    previousTime = performance.now();
    onChange(true);
    back.focus({ preventScroll: true });
  }

  function exit() {
    if (!open) return;
    open = false;
    from = cameraPose(weatherCamera);
    moving = true;
    started = performance.now();
    pointerId = null;
    scroll.velocity = 0;
    ui.hidden = true;
  }

  function finishExit() {
    moving = false;
    originalParent.insertBefore(controls, nextSibling);
    document.body.classList.remove('weather-open');
    ui.hidden = true;
    trigger.hidden = false;
    renderer.setSize(800, 564, false);
    onChange(false);
    trigger.focus({ preventScroll: true });
  }

  function pan(direction: number, immediate = false) {
    scroll.set(scroll.target + direction * 2.64, immediate || reducedMotion.matches);
  }
  scrubber.addEventListener('input', () =>
    scroll.set((Number(scrubber.value) / 50 - 1) * scroll.limit, true),
  );
  canvas.addEventListener(
    'wheel',
    (event) => {
      if (!open || event.ctrlKey) return;
      event.preventDefault();
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const pixels = delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientWidth : 1);
      scroll.set(
        scroll.target +
          ((pixels / canvas.clientWidth) * finalHeight * canvas.clientWidth) / canvas.clientHeight,
        reducedMotion.matches,
      );
    },
    { passive: false },
  );
  canvas.addEventListener('pointerdown', (event) => {
    if (!open || event.button !== 0 || pointerId !== null) return;
    pointerId = event.pointerId;
    lastPointerX = event.clientX;
    lastPointerTime = event.timeStamp;
    releaseVelocity = 0;
    scroll.set(scroll.position, true);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    const dx = ((lastPointerX - event.clientX) * finalHeight) / canvas.clientHeight;
    const dt = Math.max(0.008, (event.timeStamp - lastPointerTime) / 1000);
    releaseVelocity = releaseVelocity * 0.4 + (dx / dt) * 0.6;
    scroll.set(scroll.target + dx, reducedMotion.matches);
    lastPointerX = event.clientX;
    lastPointerTime = event.timeStamp;
  });
  function release(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    if (event.type === 'pointerup' && event.timeStamp - lastPointerTime < 100 && !reducedMotion.matches) {
      scroll.set(scroll.target + Math.max(-5, Math.min(5, releaseVelocity)) * 0.14);
    }
    pointerId = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', () => {
    pointerId = null;
  });
  trigger.addEventListener('click', enter);
  back.addEventListener('click', exit);
  requireElement<HTMLButtonElement>('#mobile-window').addEventListener('click', () => trigger.click());
  left.addEventListener('click', event => pan(-1, event.detail === 0));
  right.addEventListener('click', event => pan(1, event.detail === 0));
  document.addEventListener('keydown', (event) => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      exit();
    }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      pan(event.key === 'ArrowLeft' ? -1 : 1, true);
    }
  });

  return {
    camera: weatherCamera,
    isOpen: () => open || moving,
    proximity: () => open || moving
      ? THREE.MathUtils.clamp((room.position.z - weatherCamera.position.z) / Math.max(0.01, room.position.z - destination.z), 0, 1) : 0,
    update(now: number, canOpen: boolean) {
      trigger.hidden = open || moving || !canOpen;
      if (open || moving) {
        if (lastWidth !== canvas.clientWidth || lastHeight !== canvas.clientHeight) fit();
        if (open) scroll.update((now - previousTime) / 1000, reducedMotion.matches);
        previousTime = now;
        destination.x = scroll.position;
        scrubber.value = String(scroll.limit ? (scroll.position / scroll.limit + 1) * 50 : 50);
        scrubber.disabled = scroll.limit === 0;
        left.disabled = scroll.target <= -scroll.limit + 0.001;
        right.disabled = scroll.target >= scroll.limit - 0.001;
        const t = reducedMotion.matches || !moving ? 1 : THREE.MathUtils.clamp((now - started) / 720, 0, 1);
        const viewport = canvas.closest('.slice-viewport')!.getBoundingClientRect();
        const restoredHeight = Math.min(viewport.height, viewport.width * 141 / 200) - 2;
        const to: CameraPose = open
          ? { position: destination, quaternion: finalQuaternion, height: finalHeight }
          : { ...room, height: room.height * canvas.clientHeight / Math.max(1, restoredHeight) };
        blendCamera(weatherCamera, from, to, t, canvas.clientWidth / Math.max(1, canvas.clientHeight));
        if (t === 1) {
          moving = false;
          if (!open) finishExit();
        }
        return;
      }
      if (!canOpen) return;
      camera.updateMatrixWorld();
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const x of [-width / 2, width / 2])
        for (const y of [bottom, top]) {
          const point = new THREE.Vector3(x, y, -4.25).project(camera);
          const px = ((point.x + 1) / 2) * canvas.clientWidth;
          const py = ((1 - point.y) / 2) * canvas.clientHeight;
          minX = Math.min(minX, px);
          maxX = Math.max(maxX, px);
          minY = Math.min(minY, py);
          maxY = Math.max(maxY, py);
        }
      Object.assign(trigger.style, {
        left: `${minX}px`,
        top: `${minY}px`,
        width: `${maxX - minX}px`,
        height: `${maxY - minY}px`,
      });
    },
  };
}
