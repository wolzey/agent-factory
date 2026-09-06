import { createPatioStations } from "./factory25dPatioStations";
import './factory25dPatio.css';
import * as THREE from "three";
import { requireElement } from "./dom";
import { propPart, standard } from "./factory25dProps";
import { createPatioTerraces } from "./factory25dPatioTerraces";
import { createPatioWater } from './factory25dPatioWater';
import { patioFloorHeight } from "@shared/factory25d-patio";

export const SIDE_DOOR = { x: 7.94, near: -3.25, far: -1.75, height: 1.8 };

/** An open leaf makes the edge-on side doorway readable from the room camera. */
export function createDoorFrame(scene: THREE.Scene) {
  const frame = new THREE.Group();
  scene.add(frame);
  const trim = standard("#667d80", 1, "#111d23");
  for (const z of [SIDE_DOOR.near, SIDE_DOOR.far]) {
    propPart(frame, [0.085, 1.62, 0.085], [SIDE_DOOR.x, 0.81, z], trim);
  }
  propPart(frame, [0.085, 0.075, 1.58], [SIDE_DOOR.x, 1.66, -2.5], trim);
  propPart(frame, [0.26, 0.012, 1.4], [SIDE_DOOR.x, 0.012, -2.5], trim);
  const leaf = new THREE.Group();
  leaf.position.set(SIDE_DOOR.x, 0.04, SIDE_DOOR.near);
  leaf.rotation.y = 0.92;
  frame.add(leaf);
  const paint = standard("#486260", 1, "#132422");
  propPart(leaf, [1.1, 0.73, 0.045], [-0.55, 0.365, 0], paint);
  for (const x of [-1.055, -0.045])
    propPart(leaf, [0.09, 1.49, 0.055], [x, 0.745, 0], paint);
  for (const y of [0.77, 1.45])
    propPart(leaf, [1.1, 0.08, 0.055], [-0.55, y, 0], paint);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.91, 0.6),
    new THREE.MeshStandardMaterial({
      color: "#9ebaba",
      transparent: true,
      opacity: 0.16,
      roughness: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  glass.position.set(-0.55, 1.1, 0.005);
  leaf.add(glass);
  propPart(
    leaf,
    [0.055, 0.055, 0.085],
    [-0.94, 0.69, 0.035],
    standard("#b9aa77", 0.7),
  );
}

/** Roofless deck: the sky, weather and direct light come from the factory environment. */
export function createSideRoom(scene: THREE.Scene) {
  const room = new THREE.Group();
  scene.add(room);
  const timber = new THREE.MeshPhysicalMaterial({ color: '#94714e', roughness: .96, metalness: .03, emissive: '#151922', clearcoat: 0, clearcoatRoughness: .18 });
  // A single textured receiving surface avoids coplanar plank meshes and shadow acne.
  const grain = document.createElement("canvas");
  grain.width = 128;
  grain.height = 64;
  const ctx = grain.getContext("2d")!;
  ctx.fillStyle = "#f2eddf";
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = "#b7b0a1";
  ctx.fillRect(0, 0, 128, 2);
  ctx.fillStyle = "#e7e1d3";
  for (let i = 0; i < 14; i++)
    ctx.fillRect((i * 43) % 128, 6 + ((i * 17) % 54), 8 + (i % 4) * 7, 1);
  const map = new THREE.CanvasTexture(grain);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1, 1);
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  timber.map = map;
  const terraces = createPatioTerraces(room, timber);
  const iron = standard("#344848", 1, "#0b1217");

  const bulbs: THREE.PointLight[] = [];
  for (const [z, height, count] of [
    [-3.6, 3.65, 15],
    [9.8, 1.7, 12],
  ]) {
    for (const x of [8.5, 23.5])
      propPart(room, [0.07, height, 0.07], [x, height / 2, z], iron);
    const points = Array.from(
      { length: 41 },
      (_, i) =>
        new THREE.Vector3(
          8.5 + (i / 40) * 15,
          height - Math.sin((i / 40) * Math.PI) * 0.5,
          z,
        ),
    );
    const cable = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: "#273132" }),
    );
    room.add(cable);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count,
        x = 8.5 + t * 15,
        y = height - Math.sin(t * Math.PI) * 0.5;
      propPart(room, [0.023, 0.075, 0.023], [x, y - 0.035, z], iron);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.044, 6, 4),
        new THREE.MeshBasicMaterial({
          color: i % 4 === 0 ? "#ffc296" : "#ffe5b0",
        }),
      );
      bulb.position.set(x, y - 0.105, z);
      room.add(bulb);
      // Four pooled lights, instead of a costly light for every bulb.
      if (i === 3 || i === count - 4) {
        const light = new THREE.PointLight("#ffbd79", 1.4, 7, 2);
        light.position.copy(bulb.position);
        room.add(light);
        bulbs.push(light);
      }
    }
  }
  const stations = createPatioStations(room);
  const water = createPatioWater(room, timber);
  const sun = new THREE.DirectionalLight("#fff0d5", 0.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  Object.assign(sun.shadow.camera, {
    left: -11,
    right: 11,
    top: 12,
    bottom: -12,
    near: 0.1,
    far: 70,
  });
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const seeds = Float32Array.from({ length: 180 * 3 }, (_, i) => {
    const n = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return n - Math.floor(n);
  });
  const rainPositions = new Float32Array(180 * 6),
    snowPositions = new Float32Array(180 * 3);
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(rainPositions, 3),
  );
  const snowGeometry = new THREE.BufferGeometry();
  snowGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(snowPositions, 3),
  );
  const rainMaterial = new THREE.LineBasicMaterial({
    color: "#bfd4e1",
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const snowMaterial = new THREE.PointsMaterial({
    color: "#dce8ec",
    size: 0.038,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial),
    snowflakes = new THREE.Points(snowGeometry, snowMaterial);
  rain.frustumCulled = snowflakes.frustumCulled = false;
  room.add(rain, snowflakes);
  return {
    stations,
    dispose: () => water.dispose(),
    update(
      source: THREE.DirectionalLight,
      snow: number,
      rainAmount: number,
      night: boolean,
      time: number,
      wetAmount = rainAmount,
      reducedMotion = false,
    ) {
      terraces.update(snow, rainAmount, night, time, reducedMotion);
      water.update(wetAmount, rainAmount, snow, night, time, reducedMotion);
      rain.visible = rainAmount > 0.05;
      snowflakes.visible = snow > 0.05;
      rainGeometry.setDrawRange(0, Math.floor(rainAmount * 180) * 2);
      snowGeometry.setDrawRange(0, Math.floor(snow * 180));
      for (let i = 0; i < 180; i++) {
        const x = 8.1 + seeds[i * 3] * 15.8,
          z = -4.2 + seeds[i * 3 + 1] * 17.7;
        const ground = patioFloorHeight({ x, z });
        const rainY =
          ground + 0.08 + ((((seeds[i * 3 + 2] - time * 1.2) % 1) + 1) % 1) * 4;
        const snowY =
          ground + 0.08 + ((((seeds[i * 3 + 2] - time * 0.15) % 1) + 1) % 1) * 4;
        rainPositions.set([x, rainY, z, x + 0.025, rainY + 0.13, z], i * 6);
        snowPositions.set(
          [x + Math.sin(time * 0.5 + i) * 0.12, snowY, z],
          i * 3,
        );
      }
      rainGeometry.attributes.position.needsUpdate =
        snowGeometry.attributes.position.needsUpdate = true;
      sun.position.copy(source.position).add(new THREE.Vector3(16, 0, 0));
      sun.target.position
        .copy(source.target.position)
        .add(new THREE.Vector3(16, 0, 0));
      sun.color.copy(source.color);
      sun.intensity = source.intensity;
      sun.castShadow = source.castShadow;
      timber.color.set("#94714e").multiplyScalar(1 - wetAmount * .22).lerp(new THREE.Color("#c8d5dd"), snow * 0.65);
      bulbs.forEach((light) => {
        light.intensity = night ? 4.4 : 1.4;
      });
    },
  };
}

/** Traverse the doorway without zooming out or changing the original room camera. */
export function createSideRoomNavigation(
  canvas: HTMLCanvasElement,
  roomCamera: THREE.OrthographicCamera,
) {
  const door = requireElement<HTMLButtonElement>("#room-doorway");
  const mobile = requireElement<HTMLButtonElement>("#mobile-room");
  const navigation = requireElement<HTMLElement>("#room-navigation");
  const back = requireElement<HTMLButtonElement>("#room-return");
  const homeCamera = roomCamera.clone();
  const camera = homeCamera.clone();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const center = new THREE.Vector3(), projection = new THREE.Matrix4(), lastProjection = new THREE.Matrix4();
  let lastWidth = 0, lastHeight = 0;
  let open = false;
  let available = true;
  let motion: { start: number; from: THREE.Vector3; to: THREE.Vector3 } | null =
    null;
  function move(next: boolean, instant: boolean) {
    if (next && !available) return;
    if (!open && !motion) camera.copy(homeCamera);
    open = next;
    const url = new URL(location.href);
    if (next) url.searchParams.set('room', 'patio');
    else url.searchParams.delete('room');
    history.replaceState(null, '', url);
    navigation.dataset.instant = String(instant);
    navigation.hidden = !next;
    document.body.classList.add("secondary-room");
    motion = {
      start: performance.now() - (instant || reduced.matches ? 380 : 0),
      from: camera.position.clone(),
      to: homeCamera.position
        .clone()
        .add(new THREE.Vector3(next ? 16 : 0, next ? -0.55 : 0, 0)),
    };
    if (next) back.focus({ preventScroll: true });
  }
  door.addEventListener("click", (event) => move(!open, event.detail === 0));
  mobile.addEventListener("click", () => move(true, true));
  back.addEventListener("click", (event) => move(false, event.detail === 0));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      move(false, true);
    }
  });
  if (new URLSearchParams(location.search).get('room') === 'patio') move(true, true);
  return {
    camera,
    visit: (outside: boolean) => { if (outside !== open) move(outside, false); },
    isActive: () => open || Boolean(motion),
    showsFactory: () => !open || Boolean(motion),
    outdoorProgress: () => THREE.MathUtils.clamp((camera.position.x - homeCamera.position.x) / 16, 0, 1),
    update(now: number, canOpen: boolean) {
      available = canOpen;
      if (motion) {
        const t = reduced.matches ? 1 : Math.min(1, (now - motion.start) / 380);
        const eased = 1 - Math.pow(1 - t, 4);
        camera.position.lerpVectors(motion.from, motion.to, eased);
        camera.updateMatrixWorld();
        if (t === 1) {
          motion = null;
          if (!open) {
            document.body.classList.remove("secondary-room");
            door.hidden = false;
            door.focus({ preventScroll: true });
          }
        }
      }
      const hidden = Boolean(motion) || (!open && !canOpen);
      if (door.hidden !== hidden) door.hidden = hidden;
      if (door.hidden) return;
      const activeCamera = open ? camera : roomCamera;
      activeCamera.updateMatrixWorld();
      const width = canvas.clientWidth, height = canvas.clientHeight;
      const text = open ? '←' : '→';
      if (door.textContent !== text) {
        door.textContent = text;
        door.setAttribute('aria-label', open ? 'Return through doorway to the factory' : 'Enter the patio');
      }
      projection.multiplyMatrices(activeCamera.projectionMatrix, activeCamera.matrixWorldInverse);
      if (lastWidth === width && lastHeight === height && lastProjection.equals(projection)) return;
      lastWidth = width; lastHeight = height; lastProjection.copy(projection);
      center.set(SIDE_DOOR.x, .08, (SIDE_DOOR.near + SIDE_DOOR.far) / 2).applyMatrix4(projection);
      const x = ((center.x + 1) * width) / 2, y = ((1 - center.y) * height) / 2;
      door.style.left = `${Math.max(4, Math.min(width - 48, x - 22))}px`;
      door.style.top = `${Math.max(4, Math.min(height - 48, y - 22))}px`;
    },
  };
}
