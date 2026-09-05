import * as THREE from 'three';
import { requireElement } from './dom';
import {
  FLOOR_KEYS,
  FLOOR_Y,
  RUG_TOP,
  KEY_TOP,
  KEY_TRAVEL,
  KEYBOARD_ORIGIN,
  KEYBOARD_WIDTH,
  KEYBOARD_DEPTH,
  keyAt,
  keyIntensity,
} from './factory25dKeyboardState';
import type { FloorPoint } from './factory25dKeyboardState';

export function createFloorKeyboard(
  parent: THREE.Group,
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  onWalk: (point: FloorPoint) => string | void,
) {
  const group = new THREE.Group();
  group.position.set(KEYBOARD_ORIGIN.x, FLOOR_Y, KEYBOARD_ORIGIN.z);
  parent.add(group);
  // A thin woven rectangle, with the key pattern inset into the pile.
  const weaveCanvas = document.createElement('canvas');
  weaveCanvas.width = weaveCanvas.height = 32;
  const weave = weaveCanvas.getContext('2d')!;
  for (let y = 0; y < 32; y += 1)
    for (let x = 0; x < 32; x += 1) {
      weave.fillStyle = (x + y) % 2 ? '#cbd0dc' : x % 4 === 0 ? '#e5e6ea' : '#f5f3ef';
      weave.fillRect(x, y, 1, 1);
    }
  const texture = new THREE.CanvasTexture(weaveCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(9, 4);
  texture.generateMipmaps = false;
  const rugMaterial = new THREE.MeshStandardMaterial({ color: '#373d58', map: texture, roughness: 1 });
  const rug = new THREE.Mesh(
    new THREE.BoxGeometry(KEYBOARD_WIDTH + 0.34, RUG_TOP - FLOOR_Y, KEYBOARD_DEPTH + 0.32),
    rugMaterial,
  );
  rug.position.y = (RUG_TOP - FLOOR_Y) / 2;
  rug.receiveShadow = true;
  group.add(rug);
  const bindingMaterial = new THREE.MeshStandardMaterial({ color: '#8b8499', map: texture, roughness: 1 });
  for (const z of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(KEYBOARD_WIDTH + 0.24, 0.003, 0.035), bindingMaterial);
    edge.position.set(0, RUG_TOP - FLOOR_Y + 0.001, z * (KEYBOARD_DEPTH / 2 + 0.105));
    group.add(edge);
  }
  for (const x of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.003, KEYBOARD_DEPTH + 0.24), bindingMaterial);
    edge.position.set(x * (KEYBOARD_WIDTH / 2 + 0.105), RUG_TOP - FLOOR_Y + 0.001, 0);
    group.add(edge);
  }
  const baseColor = new THREE.Color('#7b7d98');
  const labelColor = new THREE.Color('#bcc5d4');
  const keys = FLOOR_KEYS.map((key) => {
    const cap = new THREE.Group();
    cap.position.set(key.x, 0, key.z);
    group.add(cap);
    const topMaterial = new THREE.MeshStandardMaterial({
      color: baseColor,
      map: texture,
      roughness: 1,
      emissive: key.color,
      emissiveIntensity: 0,
    });
    const top = new THREE.Mesh(new THREE.BoxGeometry(key.width, 0.005, key.depth), topMaterial);
    top.position.y = KEY_TOP - FLOOR_Y - 0.0025;
    top.receiveShadow = true;
    cap.add(top);
    return { ...key, cap, topMaterial, glowColor: new THREE.Color(key.color), intensity: 0 };
  });
  // Two shared lights give footfalls a little floor spill without adding a light per key.
  const lights = Array.from({ length: 2 }, () => {
    const light = new THREE.PointLight(0xffffff, 0, 0.85, 2);
    group.add(light);
    return light;
  });
  const button = requireElement<HTMLButtonElement>('#keyboard-walk');
  const status = requireElement<HTMLSpanElement>('#keyboard-status');
  const raycaster = new THREE.Raycaster();
  const hit = new THREE.Vector3();
  const worldPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -KEY_TOP);
  let hover = -1;
  let selected = FLOOR_KEYS.findIndex(key => key.label === 'space');
  let lastActive = '';
  function pointer(event: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      ),
      camera,
    );
    if (!raycaster.ray.intersectPlane(worldPlane, hit)) return -1;
    group.updateWorldMatrix(true, false);
    return keyAt(group.worldToLocal(hit.clone()));
  }
  function walk(index: number) {
    if (index < 0) return;
    selected = index;
    const key = FLOOR_KEYS[index];
    status.textContent = onWalk({ x: KEYBOARD_ORIGIN.x + key.x, z: KEYBOARD_ORIGIN.z + key.z }) || `Walking to ${key.label.toUpperCase()}`;
  }
  button.addEventListener('pointermove', (event) => {
    hover = pointer(event);
  });
  button.addEventListener('pointerleave', () => {
    hover = -1;
  });
  button.addEventListener('click', (event) => walk(event.detail === 0 ? selected : pointer(event)));
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      status.textContent = onWalk({ x: KEYBOARD_ORIGIN.x, z: KEYBOARD_ORIGIN.z - 1.1 }) || 'Walking off keyboard';
      return;
    }
    const directions: Record<string, FloorPoint> = {
      ArrowLeft: { x: -1, z: 0 },
      ArrowRight: { x: 1, z: 0 },
      ArrowUp: { x: 0, z: -1 },
      ArrowDown: { x: 0, z: 1 },
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const from = FLOOR_KEYS[selected];
    let nearest = selected;
    let best = Infinity;
    FLOOR_KEYS.forEach((key, index) => {
      const dx = key.x - from.x;
      const dz = key.z - from.z;
      const along = dx * direction.x + dz * direction.z;
      if (along < 0.05) return;
      const across = Math.abs(dx * direction.z - dz * direction.x);
      const score = along + across * 5;
      if (score < best) {
        best = score;
        nearest = index;
      }
    });
    walk(nearest);
  });
  return {
    floorHeight(point: FloorPoint) {
      const local = { x: point.x - KEYBOARD_ORIGIN.x, z: point.z - KEYBOARD_ORIGIN.z };
      const index = keyAt(local);
      if (index >= 0) return KEY_TOP + keys[index].cap.position.y;
      return Math.abs(local.x) <= (KEYBOARD_WIDTH + 0.34) / 2 &&
        Math.abs(local.z) <= (KEYBOARD_DEPTH + 0.32) / 2
        ? RUG_TOP
        : point.z < 3.59
          ? 0
          : FLOOR_Y;
    },
    update(dt: number, feet: FloorPoint[], canInteract: boolean) {
      const active = new Set(
        feet
          .map((point) => keyAt({ x: point.x - KEYBOARD_ORIGIN.x, z: point.z - KEYBOARD_ORIGIN.z }))
          .filter((index) => index >= 0),
      );
      let lightIndex = 0;
      keys.forEach((key, index) => {
        const occupied = active.has(index);
        key.intensity = keyIntensity(key.intensity, occupied, dt);
        key.cap.position.y = occupied ? -KEY_TRAVEL : 0;
        key.topMaterial.color.copy(baseColor).lerp(key.glowColor, key.intensity * 0.6);
        if (hover === index && canInteract) key.topMaterial.color.lerp(labelColor, 0.16);
        key.topMaterial.emissiveIntensity = key.intensity * 0.95;
        if (key.intensity > 0.02 && lightIndex < lights.length) {
          const light = lights[lightIndex++];
          light.color.set(key.color);
          light.position.set(key.x, 0.17, key.z);
          light.intensity = key.intensity * 0.27;
        }
      });
      for (; lightIndex < lights.length; lightIndex += 1) lights[lightIndex].intensity = 0;
      const activeNames = [...active].map((index) => FLOOR_KEYS[index].label.toUpperCase()).join(', ');
      if (activeNames !== lastActive) {
        status.textContent = activeNames ? `Lit keys: ${activeNames}` : 'Keyboard at rest';
        lastActive = activeNames;
      }
      button.dataset.litKeys = activeNames;
      button.hidden = !canInteract;
      if (!canInteract) {
        hover = -1;
        return;
      }
      group.updateWorldMatrix(true, false);
      camera.updateMatrixWorld();
      const points = [-1, 1].flatMap((x) =>
        [-1, 1].map((z) =>
          new THREE.Vector3((x * (KEYBOARD_WIDTH + 0.34)) / 2, 0.05, (z * (KEYBOARD_DEPTH + 0.32)) / 2)
            .applyMatrix4(group.matrixWorld)
            .project(camera),
        ),
      );
      const xs = points.map((p) => ((p.x + 1) / 2) * canvas.clientWidth);
      const ys = points.map((p) => ((1 - p.y) / 2) * canvas.clientHeight);
      Object.assign(button.style, {
        left: `${Math.min(...xs)}px`,
        top: `${Math.min(...ys)}px`,
        width: `${Math.max(...xs) - Math.min(...xs)}px`,
        height: `${Math.max(...ys) - Math.min(...ys)}px`,
      });
    },
  };
}
