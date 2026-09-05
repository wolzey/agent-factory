import * as THREE from 'three';
import { requireElement } from './dom';

/** Center the pointer where possible, keeping the close-up inside the original view. */
export function zoomOffset(pointer: number, span: number, scale: number): number {
  const limit = span * (1 - 1 / scale) / 2;
  return THREE.MathUtils.clamp(pointer * span / 2, -limit, limit);
}

export function createPointerZoom(canvas: HTMLCanvasElement) {
  const navigation = requireElement<HTMLElement>('#inspect-navigation');
  const back = requireElement<HTMLButtonElement>('#inspect-back');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const source = new THREE.OrthographicCamera();
  const detail = source.clone();
  const offset = new THREE.Vector3();
  let latest: THREE.OrthographicCamera | null = null;
  let active = false;
  let started = 0;
  let pointer = { x: 0, y: 0 };
  let restoreFocus: HTMLElement | null = null;
  let focusAnchor: THREE.Vector3 | null = null;
  const focusRay = new THREE.Raycaster();

  document.addEventListener('pointermove', event => {
    if (active) return;
    const box = canvas.getBoundingClientRect();
    pointer = {
      x: THREE.MathUtils.clamp((event.clientX - box.left) / box.width * 2 - 1, -1, 1),
      y: THREE.MathUtils.clamp(1 - (event.clientY - box.top) / box.height * 2, -1, 1),
    };
  }, { passive: true });

  function close() {
    active = false;
    document.body.classList.remove('inspect-open');
    navigation.hidden = true;
    if (restoreFocus?.isConnected && restoreFocus !== document.body && !navigation.contains(restoreFocus) && restoreFocus.getClientRects().length) {
      restoreFocus.focus({ preventScroll: true });
    } else {
      const target = document.body.classList.contains('weather-open') ? '#window-back'
        : document.body.classList.contains('secondary-room') ? '#room-return'
        : document.body.classList.contains('board-open') ? '#board-back' : '#window-open';
      requireElement<HTMLButtonElement>(target).focus({ preventScroll: true });
    }
  }
  function open() {
    if (!latest) return;
    source.copy(latest);
    focusAnchor = null;
    const width = (source.right - source.left) / source.zoom;
    const height = (source.top - source.bottom) / source.zoom;
    offset.set(zoomOffset(pointer.x, width, 2.5), zoomOffset(pointer.y, height, 2.5), 0).applyQuaternion(source.quaternion);
    started = performance.now();
    active = true;
    restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add('inspect-open');
    navigation.hidden = false;
    navigation.dataset.instant = String(reduced.matches);
    back.focus({ preventScroll: true });
  }
  document.addEventListener('keydown', event => {
    const target = event.target;
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    if (document.body.classList.contains('board-dragging')) return;
    if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input:not([type="range"]), textarea, select, [role="textbox"]'))) return;
    if (document.body.classList.contains('chat-open')) return;
    if (event.key.toLowerCase() === 'i' || (active && event.key === 'Escape')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (active) close(); else open();
    }
  }, true);
  // Scene hotspots are hidden while inspecting; do not pan the underlying view.
  for (const type of ['pointerdown', 'pointermove', 'wheel'] as const) {
    canvas.addEventListener(type, event => {
      if (!active) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }, { capture: true, passive: false });
  }
  back.addEventListener('click', close);
  window.addEventListener('resize', () => { if (active) close(); });
  window.addEventListener('blur', () => { if (active) close(); });
  return {
    focusPoint(scene: THREE.Scene, fallback: THREE.Vector3) {
      if (!active) return fallback;
      if (!focusAnchor) {
        source.updateMatrixWorld(); scene.updateMatrixWorld();
        focusRay.layers.mask = source.layers.mask;
        focusRay.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), source);
        const hit = focusRay.intersectObjects(scene.children, true).find(entry => {
          let object: THREE.Object3D | null = entry.object;
          while (object) { if (!object.visible) return false; object = object.parent; }
          if (!(entry.object instanceof THREE.Mesh)) return false;
          const materials = Array.isArray(entry.object.material) ? entry.object.material : [entry.object.material];
          return materials.some(material => material.visible && material.depthWrite && material.opacity > 0.5);
        });
        focusAnchor = hit?.point.clone() ?? fallback.clone();
      }
      return focusAnchor;
    },
    cameraFor(base: THREE.OrthographicCamera, now: number) {
      latest = base;
      if (!active) return base;
      detail.copy(source);
      const t = reduced.matches ? 1 : Math.min(1, (now - started) / 220);
      const eased = 1 - Math.pow(1 - t, 3);
      detail.position.addScaledVector(offset, eased);
      detail.zoom = source.zoom / THREE.MathUtils.lerp(1, 1 / 2.5, eased);
      detail.updateProjectionMatrix();
      detail.updateMatrixWorld();
      return detail;
    },
  };
}
