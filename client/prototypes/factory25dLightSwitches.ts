import * as THREE from 'three';
import { createFixtureRock } from './factory25dFixtureRock';
import type { FixtureCleanupJob } from './factory25dStaffCleanup';
import type { SharedPropsConnection } from './factory25dSharedProps';
import { setHidden, setPixels } from './dom';
import './factory25dLightSwitches.css';

export interface SceneLightSwitch {
  id: string;
  label: string;
  kind: 'lamp' | 'candle' | 'light';
  target: THREE.Object3D;
  hitTargets?: THREE.Object3D[];
  /** Sibling parts that must tip together (body, shade, bulb and light). */
  motionTargets?: THREE.Object3D[];
  isOn: () => boolean;
  setOn: (on: boolean) => void;
}
export interface RoomLightSwitch extends SceneLightSwitch { room: 'factory' | 'garage' | 'patio' }
const STORAGE_KEY = 'factory-light-switches-v1';
// These standing props have floor/counter space to fall into and a reachable
// service position. Hanging bulbs, ceiling strips and fire pits stay attached.
const FALLING_FIXTURES: Record<string, { axis: 'x' | 'z'; x: number; z: number }> = {
  'front-desk-lamp': { axis: 'z', x: 0, z: -.58 },
  'lounge-floor-lamp': { axis: 'x', x: .65, z: 0 },
  'lounge-candle': { axis: 'x', x: -.7, z: 0 },
};

export function readLightPreferences(storage: Pick<Storage, 'getItem'>): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([key, on]) => key.length < 100 && typeof on === 'boolean'));
  } catch { return {}; }
}

/** Screen-space targets follow the actual props. Close neighbors (especially the
 * phone and candle) resolve to the nearest center instead of stealing each other's taps. */
export function createLightInteractions(canvas: HTMLCanvasElement, switches: RoomLightSwitch[],
  options: { camera: () => THREE.Camera; visible: (room: RoomLightSwitch['room']) => boolean;
    sound: (kind: SceneLightSwitch['kind'], on: boolean) => void;
    onCleanup?: (job: FixtureCleanupJob) => void; shared?: SharedPropsConnection }) {
  const host = canvas.parentElement!, abort = new AbortController();
  let saved: Record<string, boolean> = {};
  try { if (!options.shared) saved = readLightPreferences(localStorage); } catch { /* Storage can be disabled. */ }
  const point = new THREE.Vector3(), box = new THREE.Box3(), ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down: { x: number; y: number } | undefined;
  const entries = switches.map(light => {
    if (typeof saved[light.id] === 'boolean') light.setOn(saved[light.id]);
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'scene-light-switch'; button.dataset.lightId = light.id; button.hidden = true;
    button.setAttribute('aria-label', light.label);
    host.append(button);
    button.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation(); if (options.visible(light.room)) toggle(light);
    }, { signal: abort.signal });
    light.target.updateWorldMatrix(true, true); box.setFromObject(light.target);
    const center = box.isEmpty() ? new THREE.Vector3() : light.target.worldToLocal(box.getCenter(new THREE.Vector3()));
    const fall = light.room === 'factory' ? FALLING_FIXTURES[light.id] : undefined;
    const motion = createFixtureRock(light.motionTargets ?? [light.target], {
      canFall: !options.shared && Boolean(fall && options.onCleanup), fallAxis: fall?.axis,
      onFallen() {
        if (!fall || !motion) return;
        const anchor = motion.worldAnchor(new THREE.Vector3());
        options.onCleanup?.({ id: light.id, label: light.label.toLowerCase(),
          point: { x: anchor.x, z: anchor.z }, standAt: { x: anchor.x + fall.x, z: anchor.z + fall.z },
          isPending: () => motion.isPending, recover: () => motion.recover() });
      },
    });
    return { light, button, center, motion, x: 0, y: 0, lastOn: undefined as boolean | undefined,
      presses: undefined as number | undefined, epoch: '' };
  });
  function toggle(light: SceneLightSwitch) {
    if (options.shared) { options.shared.send({ action: 'light', id: light.id, on: !light.isOn() }); return; }
    const on = !light.isOn(); light.setOn(on); saved[light.id] = on;
    entries.find(entry => entry.light === light)?.motion?.press();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* Keep the current scene usable. */ }
    options.sound(light.kind, on); updateLabels();
  }
  function updateLabels() {
    for (const entry of entries) {
      entry.button.dataset.fixtureState = entry.motion?.state ?? 'fixed';
      const { light, button } = entry, on = light.isOn(); if (entry.lastOn === on) continue; entry.lastOn = on;
      button.setAttribute('aria-pressed', String(on));
      button.title = `${on ? 'turn off' : 'turn on'} ${light.label.toLowerCase()}`;
      button.dataset.on = String(on);
    }
  }
  // Capture before underlying room/phone handlers. Keyboard and accessibility
  // activation go directly to their chosen button without spatial reassignment.
  host.addEventListener('pointerdown', event => { down = { x: event.clientX, y: event.clientY }; }, { capture: true, signal: abort.signal });
  host.addEventListener('click', event => {
    if (event.detail === 0 || !(event.target instanceof Element)) return;
    if (event.target.closest('.factory-controls, .factory-preview-tools, .agent-label, .scene-sound, [role="dialog"], #inspect-navigation')) return;
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) {
      if (event.target.closest('.scene-light-switch')) { event.preventDefault(); event.stopImmediatePropagation(); }
      return;
    }
    const active = entries.filter(entry => !entry.button.hidden);
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    ray.setFromCamera(pointer, options.camera());
    const roots = active.flatMap(({ light }) => light.hitTargets ?? [light.target]);
    const direct = ray.intersectObjects(roots, true)[0];
    if (direct) {
      const entry = active.find(({ light }) => (light.hitTargets ?? [light.target]).some(root => {
        let node: THREE.Object3D | null = direct.object;
        while (node) { if (node === root) return true; node = node.parent; }
        return false;
      }));
      if (entry) { event.preventDefault(); event.stopImmediatePropagation(); toggle(entry.light); return; }
    }
    const hit = active
      .map(entry => ({ entry, distance: Math.hypot(entry.x - event.clientX, entry.y - event.clientY) }))
      .filter(hit => hit.distance <= 22).sort((a, b) => a.distance - b.distance)[0];
    if (!hit) return;
    let closest: HTMLButtonElement | undefined, nearest = hit.distance;
    for (const peer of host.querySelectorAll<HTMLButtonElement>('button:not(.scene-light-switch)')) {
      if (peer.hidden || peer.disabled || !peer.getClientRects().length) continue;
      const rect = peer.getBoundingClientRect();
      if (rect.width > 200 || rect.height > 200 || event.clientX < rect.left || event.clientX > rect.right
        || event.clientY < rect.top || event.clientY > rect.bottom) continue;
      const distance = Math.hypot(rect.left + rect.width / 2 - event.clientX, rect.top + rect.height / 2 - event.clientY);
      if (distance < nearest) { closest = peer; nearest = distance; }
    }
    if (closest && !event.target.closest('.scene-light-switch')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (closest) closest.click(); else toggle(hit.entry.light);
  }, { capture: true, signal: abort.signal });
  updateLabels();
  return {
    update(dt = 1 / 60, reduced = false) {
      const camera = options.camera(), rect = canvas.getBoundingClientRect(), parent = host.getBoundingClientRect();
      camera.updateMatrixWorld();
      for (const entry of entries) {
        const shared = options.shared?.state?.lights.find(light => light.id === entry.light.id);
        if (shared) {
          if (entry.epoch !== options.shared!.state!.epoch) { entry.presses = undefined; entry.epoch = options.shared!.state!.epoch; }
          if (shared.on !== null && entry.light.isOn() !== shared.on) entry.light.setOn(shared.on);
          if (entry.presses !== undefined && entry.presses !== shared.presses && options.shared!.now() - shared.changedAt < 1000) {
            entry.motion?.press();
            if (options.visible(entry.light.room) && !document.hidden) options.sound(entry.light.kind, entry.light.isOn());
          }
          entry.presses = shared.presses;
          // Only the upright press spring is local; falling and recovery use shared timestamps.
          if (shared.fallenAt === null) entry.motion?.update(dt, reduced);
          entry.motion?.sync(shared, options.shared!.now(), reduced);
        } else if (!options.shared) entry.motion?.update(dt, reduced);
        const { light, button } = entry;
        // Decide visibility before writing it: an off-screen switch used to flip hidden twice a frame.
        let hidden = document.hidden || !options.visible(light.room);
        if (!hidden) {
          light.target.updateWorldMatrix(true, true);
          point.copy(entry.center); light.target.localToWorld(point);
          point.project(camera);
          hidden = point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1;
        }
        setHidden(button, hidden);
        if (hidden) continue;
        entry.x = rect.left + (point.x + 1) * rect.width / 2;
        entry.y = rect.top + (1 - point.y) * rect.height / 2;
        setPixels(button, 'left', entry.x - parent.left - 22);
        setPixels(button, 'top', entry.y - parent.top - 22);
      }
      updateLabels();
    },
    dispose() { abort.abort(); for (const { button, motion } of entries) { button.remove(); motion?.dispose(); } },
  };
}
