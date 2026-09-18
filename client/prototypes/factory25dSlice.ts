import { installSharedPickups } from './factory25dSharedPickup';
import { createSharedProps } from './factory25dSharedProps';
import { createWindowReflections } from './factory25dWindowReflections';
import { createWhatsNew } from './factory25dWhatsNew';
import { startSceneLoop } from './factory25dSceneLoop';
import {batchStaticSiblings} from './factory25dStaticBatch';
import { createAmbientBackdrop } from './factory25dAmbientBackdrop';
import { createStationTickets } from './factory25dStationTickets';
import {createGarage} from './factory25dGarage';
import { createVendingMachine } from './factory25dVendingMachine';
import { createConsoleCandidate, CONSOLE_CANDIDATES } from './factory25dConsoleCandidates';
import { createSnackCarry } from './factory25dSnackCarry';
import { createLightInteractions } from './factory25dLightSwitches';
import { createThunderstorm } from './factory25dThunderstorm';
import { createRoomNavigation } from './factory25dRoomNavigation';
/// <reference types="vite/client" />
import { createTeamDesk } from './factory25dTeamDesk';
import { createBrandLibrary } from './factory25dBrandLibrary';
import { createBrandFlag } from './factory25dBrandFlag';
import { createMistFlag } from './factory25dMistFlag';
import { createAvatarStage } from './factory25dAvatarStage';
import { createVisitorBasketball } from './factory25dVisitorBasketball';
import { createNewspaper } from './factory25dNewspaper';
import { createLoungeRadio } from './factory25dLoungeRadio';
import { createNatureTv } from './factory25dNatureTv';
import { createCeilingLights } from './factory25dCeilingLights';
import * as THREE from 'three';
import { FRONT_COUNTER, FRONT_VENDING, INTERIOR_Z } from '@shared/factory25d-layout';
import { createRoomStaff } from './factory25dRoomStaff';
import { createLiveAgents } from './factory25dLiveAgents';
import { createFactoryControls } from './factory25dControls';
import { createActivityFeedback, type StationFeedback } from './factory25dActivityFeedback';
import { watchLiveWeather, liveSunAt } from './factory25dLiveWeather';
import { resolveSkyClock } from '../sky/clock';
import { WORKSTATIONS } from './factory25dWorkstations';
import { createMountainView } from './factory25dMountains';
import { requireElement } from './dom';
import { signTexture } from './factory25dLabels';
import { createWallClock, factoryTitleTexture } from './factory25dSigns';
import { watchFactoryTitle } from './factory25dSite';
import { installWeatherShortcut } from './factory25dDebug';
import { createWindowWeather } from './factory25dWeather';
import { createWhiteboardInteraction } from './factory25dWhiteboard';
import { createWindowInteraction } from './factory25dWindow';
import { createPointerZoom } from './factory25dZoom';
import { createGarageDriving } from './factory25dDriving';
import { createSideRoom, createSideRoomNavigation, createDoorFrame, SIDE_DOOR } from './factory25dSideRoom';
import { INDOOR_COLUMNS, INDOOR_ROWS } from './factory25dWorkstations';
import { createBasketball } from './factory25dBasketball';
import { createBasketballChallenges } from './factory25dBasketballChallenge';
import { createFactoryAudio } from './factory25dAudio';
import { createDuckHunt } from './factory25dDuckHunt';
import { createLoungeDetails } from './factory25dLounge';
import { MOON_PHASES, celestialTexture, moonPhaseFromSearch, moonIllumination } from './factory25dCelestials';
import { createHangingPothos } from './factory25dPothos';
import { createFloorKeyboard } from './factory25dKeyboard';
import { standard, propPart } from './factory25dProps';
import { createIndoorPlants } from './factory25dPlants';
import { contactShadow } from './factory25dContactShadows';
import type { FloorPoint } from './factory25dKeyboardState';
import { WeatherTransition, weatherLighting } from './factory25dWeatherState';
import { CLEAR_WEATHER, weatherPalette } from '../sky/weather';
import { paletteForElevation } from '../sky/skyPhase';
import { WEATHER_PRESETS, searchWithWeatherPreset, weatherPresetById, weatherPresetFromSearch } from '../sky/weatherPresets';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

const canvas = requireElement<HTMLCanvasElement>('#slice-canvas');
const pointerZoom = createPointerZoom(canvas);
const sceneAudio = createFactoryAudio();
const lightSlider = requireElement<HTMLInputElement>('#slice-light');
const weatherSelect = requireElement<HTMLSelectElement>('#slice-weather');
const timeSelect = requireElement<HTMLSelectElement>('#slice-time');
const moonSelect = requireElement<HTMLSelectElement>('#slice-moon');
let moonPhase = moonPhaseFromSearch(location.search);
for (const phase of MOON_PHASES) {
  const option = document.createElement('option');
  option.value = phase.id; option.textContent = phase.label; moonSelect.append(option);
}
moonSelect.value = moonPhase;
let liveTime = !['night', 'day'].includes(new URLSearchParams(location.search).get('skyTime') ?? '');
const skyClock = resolveSkyClock(location.search);
let isNight = liveTime ? liveSunAt(skyClock()).night : new URLSearchParams(location.search).get('skyTime') === 'night';
timeSelect.value = liveTime ? 'live' : isNight ? 'night' : 'day';

const initialWeather = weatherPresetFromSearch(location.search);
let liveWeather = !initialWeather;
let latestLiveWeather = CLEAR_WEATHER;
let weather = initialWeather?.state ?? CLEAR_WEATHER;
const weatherTransition = new WeatherTransition(weather);
let currentPalette = paletteForElevation(45, true);
const liveWeatherOption = document.createElement('option'); liveWeatherOption.value = 'live'; liveWeatherOption.textContent = 'Live · Lehi'; weatherSelect.append(liveWeatherOption);
for (const preset of WEATHER_PRESETS) {
  const option = document.createElement('option');
  option.value = preset.id;
  option.textContent = preset.label;
  weatherSelect.append(option);
}
weatherSelect.value = initialWeather?.id ?? 'live';
installWeatherShortcut();

const scene = new THREE.Scene();
scene.background = new THREE.Color('#171a35');
const windowReflections = createWindowReflections(scene);

// Retired visual experiments should not linger in bookmarked preview URLs.
const cleanPreviewUrl = new URL(location.href);
for (const key of ['display','landscape','dof','crtSize','crtStrength','crtControls']) cleanPreviewUrl.searchParams.delete(key);
history.replaceState(null, '', cleanPreviewUrl.pathname + cleanPreviewUrl.search + cleanPreviewUrl.hash);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
// Shader diagnostics synchronously query the GPU; keep them in development only.
renderer.debug.checkShaderErrors = import.meta.env.DEV;
renderer.setPixelRatio(1);
renderer.setSize(800, 564, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
// Hardware depth filtering smooths single-texel crawl without a larger shadow map.
renderer.shadowMap.type = THREE.PCFShadowMap;
const ambientBackdrop = createAmbientBackdrop(canvas);
RectAreaLightUniformsLib.init();

const camera = new THREE.OrthographicCamera(-8, 8, 5.64, -5.64, 0.1, 50);
camera.position.set(0, 9, 14.6);
camera.lookAt(0, 0.35, 0.45);

// A deeper occupied floor gives the window a clear walking strip. Translating
// the furniture together preserves cabinet/agent scale and the lounge layout.
const interior = new THREE.Group();
interior.position.z = 1.95;
scene.add(interior);

const fixedRoomBoxes:THREE.Mesh[]=[];
let roomBatchSavings=0;
function box(
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  castShadow = true,
  receiveShadow = true,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  scene.add(mesh);
  fixedRoomBoxes.push(mesh);
  return mesh;
}

function floorTexture(roughness = false): THREE.CanvasTexture {
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 32;
  floorCanvas.height = 32;
  const context = floorCanvas.getContext('2d');
  if (context) {
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        const alternate = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0;
        context.fillStyle = roughness ? '#c8c8c8' : (alternate ? '#212335' : '#222436');
        context.fillRect(x, y, 1, 1);
      }
    }
    context.fillStyle = roughness ? '#d4d4d4' : 'rgba(16, 18, 32, 0.24)';
    context.fillRect(0, 0, 32, 1);
    context.fillRect(0, 0, 1, 32);
  }
  const texture = new THREE.CanvasTexture(floorCanvas);
  texture.colorSpace = roughness ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(28, 32);
  return texture;
}

// Sealed tile gets its color from illumination, with a broad, slightly varied
// highlight. A tiny emission floor preserves readability when fixtures are off.
const floorRoughness = floorTexture(true);
const mainFloorMaterial = new THREE.MeshStandardMaterial({
  map: floorTexture(),
  color: '#b5bbd4',
  emissive: '#0d1028',
  emissiveIntensity: 0.35,
  roughness: 0.38,
  roughnessMap: floorRoughness,
  metalness: 0.02,
});
const mainFloor: THREE.Mesh<THREE.BufferGeometry> = new THREE.Mesh(new THREE.PlaneGeometry(16.4, 18.5), mainFloorMaterial);
mainFloor.rotation.x = -Math.PI / 2;
mainFloor.position.z = 4.65;
mainFloor.receiveShadow = true;
scene.add(mainFloor);

/** Staggered oak boards with quiet, pixel-sized grain; fixed pattern never shimmers. */
function woodFloorTexture(width: number, depth: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const tones = ['#795636', '#80603d', '#745333', '#886443', '#7d5939', '#8a6744'];
    for (let row = 0; row < 8; row++) {
      const offset = (row % 3) * 21;
      for (let col = -1; col < 3; col++) {
        const x = col * 64 + offset, y = row * 16;
        ctx.fillStyle = tones[(row * 3 + col + 7) % tones.length];
        ctx.fillRect(x, y, 64, 16);
        ctx.fillStyle = '#493522'; ctx.fillRect(x, y, 64, 1); ctx.fillRect(x, y, 1, 16);
        ctx.fillStyle = 'rgba(234,191,131,.12)'; ctx.fillRect(x + 1, y + 1, 62, 1);
        for (let grain = 0; grain < 5; grain++) {
          ctx.fillStyle = grain % 2 ? 'rgba(40,25,15,.10)' : 'rgba(231,181,118,.09)';
          ctx.fillRect(x + 4 + (row * 7 + grain * 11) % 22, y + 3 + grain * 2, 15 + (row * 13 + grain * 7) % 24, 1);
        }
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(width / 2.8, depth / 1.76);
  return texture;
}

function floorZone(width: number, depth: number, x: number, z: number, color: string): THREE.Mesh {
  const zone = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({
      color: x < 0 ? '#ffffff' : color,
      map: x < 0 ? woodFloorTexture(width, depth) : null,
      emissive: new THREE.Color(color).multiplyScalar(0.12),
      emissiveIntensity: 0.45,
      roughness: x < 0 ? 0.48 : 0.86,
      roughnessMap: x < 0 ? null : floorRoughness,
      metalness: 0,
    }),
  );
  zone.rotation.x = -Math.PI / 2;
  zone.position.set(x, 0.018, z);
  zone.receiveShadow = true;
  interior.add(zone);
  return zone;
}

floorZone(7.8, 8, -4.08, 7.6, '#292113');
floorZone(8.2, 8, 3.92, 7.6, '#29173d');
// The diorama's front edge is outside the normal framing. Close-ups can see
// past it, so continue the same floor under the camera instead of exposing sky.
const closeUpFloor = new THREE.Group(); closeUpFloor.name = 'close-up-floor-continuation';
scene.add(closeUpFloor); closeUpFloor.visible = false;
const continuedBase = new THREE.Mesh(new THREE.PlaneGeometry(16.4, 80), mainFloorMaterial);
continuedBase.rotation.x = -Math.PI / 2; continuedBase.position.z = 13.9 + 40;
continuedBase.receiveShadow = true; closeUpFloor.add(continuedBase);
for (const [w,x,color] of [[7.8,-4.08,'#292113'],[8.2,3.92,'#29173d']] as const) {
  const extension = floorZone(w,80,x,11.6+40,color);
  // Preserve world position when moving out of the translated interior group.
  extension.position.z += interior.position.z; closeUpFloor.add(extension);
}


// Floor-to-ceiling glass with a narrow header, side jambs and floor track.
// The real header and uprights share a depth and meeting edge, so their shadows join.
// Low cutaway side walls remain non-occluding.
const shellMaterial = standard('#22283d', 1, '#0a0c18');
const trimMaterial = standard('#303950', 1, '#080a16');
const glassBottom = 0.012;
const glassTop = 3.61;
const glassHeight = glassTop - glassBottom;
const glassCenterY = (glassTop + glassBottom) / 2;
// Keep the roof and full wall height for sunlight, but omit their color/depth
// from the cutaway camera so the room and close-up interactions stay visible.
const ceilingY = glassTop + 0.43;
const cutawayMaterial = new THREE.MeshBasicMaterial({
  colorWrite: false, depthWrite: false, shadowSide: THREE.DoubleSide,
});
box([16.4, 0.18, 18.5], [0, ceilingY + 0.09, 4.65], cutawayMaterial, true, false);
box([0.1, ceilingY, 18.5], [-8.05, ceilingY / 2, 4.65], cutawayMaterial, true, false);
for (const [near, far] of [[-4.6, SIDE_DOOR.near], [SIDE_DOOR.far, 13.9]]) {
  box([0.1, ceilingY, far - near], [SIDE_DOOR.x, ceilingY / 2, (near + far) / 2], cutawayMaterial, true, false);
}
box([0.1, ceilingY - SIDE_DOOR.height, SIDE_DOOR.far - SIDE_DOOR.near],
  [SIDE_DOOR.x, (ceilingY + SIDE_DOOR.height) / 2, (SIDE_DOOR.near + SIDE_DOOR.far) / 2], cutawayMaterial, true, false);
box([16.4, ceilingY, 0.18], [0, ceilingY / 2, 13.9], cutawayMaterial, true, false);
box([16.4, 0.43, 0.22], [0, glassTop + 0.215, -4.37], shellMaterial);
box([16, 0.045, 0.36], [0, glassTop + 0.43, -4.43], trimMaterial, false);
// The walls still block sunlight, but their cutaway color is omitted all the
// way to the frame edge. A thin raised curb read as an exposed neighboring room.
createDoorFrame(scene);
const sideRoomScene = new THREE.Scene();
const sideRoomBackground = new THREE.Color('#08091a');
const patio = createSideRoom(sideRoomScene);
const brandFlag = createBrandFlag(sideRoomScene);
const mistFlag = createMistFlag(sideRoomScene, canvas);
const sideRoom = createSideRoomNavigation(canvas, camera, scene, sideRoomScene);

// Outer passages enter beside the rooms, away from the central couch corner.
for (const [left, right] of [[-8.1, -7.6], [-6.2, 5.8], [7.2, 8.1]]) {
  const width = right - left;
  const x = (left + right) / 2;
  interior.add(box([width, 0.28, 0.13], [x, 0.14, 3.59], shellMaterial, false));
  interior.add(box([width, 0.045, 0.17], [x, 0.3, 3.59], trimMaterial, false));
}
for (const x of [-7.6, -6.2, 5.8, 7.2]) {
  interior.add(box([0.15, 0.4, 0.22], [x, 0.2, 3.59], trimMaterial, false));
}
interior.add(box([0.13, 0.28, 8.36], [-0.13, 0.14, 7.77], shellMaterial, false));
interior.add(box([0.17, 0.045, 8.36], [-0.13, 0.3, 7.77], trimMaterial, false));

const backdropCanvas = document.createElement('canvas');
backdropCanvas.width = 256;
backdropCanvas.height = 96;
const backdropContext = backdropCanvas.getContext('2d');
const backdropTexture = new THREE.CanvasTexture(backdropCanvas);
backdropTexture.colorSpace = THREE.SRGBColorSpace;
backdropTexture.magFilter = THREE.NearestFilter;
backdropTexture.minFilter = THREE.NearestFilter;
const backdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(15.84, glassHeight),
  new THREE.MeshBasicMaterial({ map: backdropTexture }),
);
backdrop.position.set(0, glassCenterY, -4.63);
scene.add(backdrop);

const sunTexture = celestialTexture('sun');
const moonTextures = new Map(MOON_PHASES.map(phase => [phase.id, celestialTexture(phase.id)]));
const sunMaterial = new THREE.MeshBasicMaterial({
  map: sunTexture, color: '#fff2b3', transparent: true, depthWrite: false,
});
const sun = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.88), sunMaterial);
sun.position.z = -4.62;
const celestialReferenceEye=new THREE.Vector3(0,9,14.6);
const celestialPoint=new THREE.Vector3(),celestialRay=new THREE.Vector3();
scene.add(sun);

const mountainView = createMountainView(renderer, glassHeight);
const mountainWindow = new THREE.Mesh(
  new THREE.PlaneGeometry(15.84, glassHeight),
  new THREE.MeshBasicMaterial({ map: mountainView.texture, transparent: true, alphaTest: 0.02 }),
);
mountainWindow.position.set(0, glassCenterY, -4.55);
scene.add(mountainWindow);
const windowWeather = createWindowWeather(scene, renderer, 15.84, glassHeight, glassCenterY,
  [{ mesh: backdrop, garageDepth: -4.35 }, { mesh: sun }, { mesh: mountainWindow, garageDepth: -4.33 }]);
for (const source of [backdrop, sun, mountainWindow]) {
  const copy = source.clone(); copy.position.x += 16; sideRoomScene.add(copy);
  if (source === sun) copy.name = 'patio-sun';
}
windowWeather.mirrorOutside(sideRoomScene, 16);
const patioSun = sideRoomScene.getObjectByName('patio-sun')!;
const sceneryBounds = new THREE.Box3(new THREE.Vector3(-7.92, glassBottom, -4.64), new THREE.Vector3(7.92, glassTop, -4.4));
const viewFrustum = new THREE.Frustum(), viewProjection = new THREE.Matrix4();

const mullionMaterial = standard('#1c2740', 1, '#060817');
// At 50 render pixels per world unit, every upright is exactly four pixels
// wide and each clear pane is 128 pixels across, including the end panes.
const mullionWidth = 0.08;
const panePitch = 2.64;
for (let index = -2; index <= 2; index += 1) {
  box([mullionWidth, glassHeight, 0.22], [index * panePitch, glassCenterY, -4.37], mullionMaterial);
}
box([15.84, glassBottom, 0.055], [0, glassBottom / 2, -4.49], mullionMaterial, false);
const windowInteraction = createWindowInteraction({ camera, renderer, canvas, width: 15.84, bottom: glassBottom, top: glassTop,
  onChange: open => mountainView.setDetail(open || duckHunt.isActive()),
});
// The hunt frames the same valley from the deck edge; the close-up shares the window's detailed render.
const duckHunt = createDuckHunt(sideRoomScene, canvas, { sky: backdropTexture, onActive: active => mountainView.setDetail(windowInteraction.isOpen() || active) });
createHangingPothos(scene, glassTop + 0.35);
const reducedSceneMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function textPlane(
  text: string,
  width: number,
  height: number,
  textColor: string,
  background: string,
): THREE.Mesh {
  const texture = signTexture(text, textColor, background, 2, width / height);
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
  );
}

const factorySign = textPlane('FLUID FACTORY', 2.8, 0.3, '#ff52de', '#080b1a');
factorySign.position.set(0, glassTop + 0.22, -4.255);
scene.add(factorySign);
let configuredTitle = '', titleDisposed = false;
function applyFactoryTitle(title: string) {
  if (titleDisposed) return;
  configuredTitle = title; document.title = title;
  canvas.setAttribute('aria-label', `${title} · live agent workspace`);
  const material = factorySign.material as THREE.MeshBasicMaterial;
  material.map?.dispose(); material.map = factoryTitleTexture(title); material.needsUpdate = true;
}
applyFactoryTitle('FLUID FACTORY');
const stopTitle = watchFactoryTitle(applyFactoryTitle);
void document.fonts.ready.then(() => { if (configuredTitle) applyFactoryTitle(configuredTitle); });
const wallClock = createWallClock(scene, glassTop + 0.22);
for (const x of [-4.65, 4.65]) {
  box([5.9, 0.025, 0.012], [x, glassTop + 0.21, -4.26], standard('#452555', 1, '#1c0c2b'), false, false);
}

// Solid props share one construction rule: small matte forms, real depth,
// and live lighting. Only the changing screen content remains a pixel texture.

function screenTexture(active: boolean): THREE.CanvasTexture {
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 96;
  screenCanvas.height = 16;
  const context = screenCanvas.getContext('2d');
  if (context) {
    for (let frame = 0; frame < 4; frame += 1) {
      const x = frame * 24;
      context.fillStyle = active ? '#051b28' : '#080e1d';
      context.fillRect(x, 0, 24, 16);
      if (!active) continue;
      context.fillStyle = '#5beca5';
      for (let row = 0; row < 5; row += 1) {
        context.fillRect(x + 2 + (row % 2) * 2, 2 + row * 2, 7 + (row + frame) % 4 * 3, 1);
      }
      context.fillStyle = '#b6ffdc';
      context.fillRect(x + 3 + frame * 3, 13, 2, 1);
      context.fillStyle = '#174055';
      context.fillRect(x + 21, 2, 1, 12);
    }
  }
  const texture = new THREE.CanvasTexture(screenCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(0.25, 1);
  return texture;
}

const activeScreenTexture = screenTexture(true);
const idleScreenTexture = screenTexture(false);
const cabinetBody = standard('#303049', 1, '#0a0917');
const cabinetSide = standard('#3e3459', 1, '#0b0819');
const cabinetBezel = standard('#181c30', 0.95, '#060713');
const cabinetDeck = standard('#4c4164', 1, '#0c0918');
const cabinetFoot = standard('#191b28', 1);
const idleMarquee = standard('#592563', 0.9, '#160720');
const activeMarquee = standard('#cb36bb', 0.8, '#9c168e');
const screenMaterials = [false, true].map((active) => {
  const map = active ? activeScreenTexture : idleScreenTexture;
  return new THREE.MeshStandardMaterial({
    map, emissiveMap: map, emissive: active ? '#baffdf' : '#263455',
    emissiveIntensity: active ? 0.9 : 0.15, roughness: 0.55, metalness: 0,
  });
});
// Keep the solid cabinets compact enough for the agents to reach the deck.
const workstationScale = 0.66;
const machinePositions = INDOOR_COLUMNS;

const stationVisuals = new Map<string, { setFeedback(state?: StationFeedback): void }>();
const consoleDisposals: Array<() => void> = [];
function workstation(x: number, z: number, active: boolean, contender?: number): void {
  const cabinet = new THREE.Group();
  const screenMaterial = screenMaterials[Number(active)].clone();
  const marqueeMaterial = (active ? activeMarquee : idleMarquee).clone();
  if (contender !== undefined) {
    const candidate = createConsoleCandidate(cabinet, contender, screenMaterial, marqueeMaterial);
    consoleDisposals.push(() => { candidate.dispose(); screenMaterial.dispose(); marqueeMaterial.dispose(); });
  } else {
  propPart(cabinet, [0.88, 0.13, 0.56], [0, 0.12, 0.015], cabinetFoot);
  propPart(cabinet, [0.84, 0.37, 0.48], [0, 0.35, 0.02], cabinetBody);
  propPart(cabinet, [0.86, 0.55, 0.4], [0, 0.84, -0.055], cabinetBody);
  for (const side of [-1, 1]) {
    propPart(cabinet, [0.09, 0.93, 0.5], [side * 0.46, 0.65, -0.015], cabinetSide);
    propPart(cabinet, [0.12, 0.08, 0.14], [side * 0.33, 0.04, 0.18], cabinetFoot);
  }
  propPart(cabinet, [0.84, 0.47, 0.08], [0, 0.85, 0.175], cabinetBezel);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.34), screenMaterial);
  screen.position.set(0, 0.86, 0.221);
  cabinet.add(screen);
  propPart(cabinet, [1.02, 0.095, 0.54], [0, 1.145, -0.015], cabinetSide);
  propPart(cabinet, [0.86, 0.065, 0.035], [0, 1.145, 0.274], marqueeMaterial);
  propPart(cabinet, [0.86, 0.018, 0.15], [0, 1.202, 0.18], marqueeMaterial);
  const deck = propPart(cabinet, [0.98, 0.09, 0.33], [0, 0.565, 0.24], cabinetDeck);
  deck.rotation.x = 0.12;
  propPart(cabinet, [0.045, 0.095, 0.045], [-0.22, 0.65, 0.26], cabinetBezel);
  propPart(cabinet, [0.08, 0.05, 0.07], [-0.22, 0.715, 0.26], standard('#be3f71', 0.8));
  propPart(cabinet, [0.07, 0.03, 0.075], [0.1, 0.628, 0.29], standard('#56a889', 0.8));
  propPart(cabinet, [0.07, 0.03, 0.075], [0.25, 0.628, 0.29], standard('#ac8c52', 0.8));
  propPart(cabinet, [0.08, 0.025, 0.012], [0, 0.37, 0.267], cabinetFoot);
  }
  cabinet.scale.setScalar(workstationScale);
  cabinet.position.set(x, 0, z);
  interior.add(cabinet);
  contactShadow(interior, { x, z: z + 0.025, width: 0.88 * workstationScale,
    depth: 0.56 * workstationScale, spread: 0.14, opacity: 0.32 });
  {
    const glow = new THREE.PointLight('#32dca5', 1.1, 2.2, 2);
    glow.position.set(x, 0.84 * workstationScale, z + 0.56 * workstationScale);
    interior.add(glow);
    const id = WORKSTATIONS.find(station => station.x === x && Math.abs(station.z - (z + 1.95)) < 0.01)?.id;
    if (id) stationVisuals.set(id, { setFeedback(state) {
      const on = state?.active ?? false, error = state?.error ?? 0, pulse = reducedSceneMotion.matches ? 0 : state?.pulse ?? 0, heat = state?.heat ?? 0;
      const color = state?.color ?? '#66b9be';
      screenMaterial.map = screenMaterial.emissiveMap = on ? activeScreenTexture : idleScreenTexture;
      screenMaterial.emissive.set(on || error ? color : '#263455');
      screenMaterial.emissiveIntensity = on ? 0.9 + heat * 0.15 + pulse * 0.15 : 0.15;
      const idleAccent = contender === undefined ? '#592563' : CONSOLE_CANDIDATES[contender].color;
      marqueeMaterial.color.set(on || error ? color : idleAccent);
      marqueeMaterial.emissive.set(on || error ? color : contender === undefined ? '#160720' : idleAccent);
      marqueeMaterial.emissiveIntensity = on ? 0.35 + pulse * 0.15 : error * 0.4 + (contender === undefined ? 0 : .2);
      glow.color.set(color); glow.intensity = on ? 1.1 + heat * 0.2 + pulse * 0.2 : error * 0.4;
    } });
  }
}

for (const [column, x] of machinePositions.entries()) workstation(x, INDOOR_ROWS[0], false, column + 5);
for (const [column, x] of machinePositions.entries()) workstation(x, INDOOR_ROWS[1], false, column > 0 ? column - 1 : undefined);
if (import.meta.hot) import.meta.hot.dispose(() => consoleDisposals.forEach(dispose => dispose()));
const ceilingLights = createCeilingLights(interior, isNight);

const liveAgents = createLiveAgents(scene, sideRoomScene, canvas);
const garage = createGarage(scene,canvas,camera,mountainWindow.material,backdrop.material,windowWeather.cloudMaterial,windowWeather.windowMaterials);
liveAgents.configureGarage({scene:garage.scene,isVisible:()=>garage.isActive() || garage.isTransitioning()});
garage.carAnimation.configure(liveAgents);
const stationTickets = createStationTickets({ factory: scene, patio: sideRoomScene, garage: garage.scene }, canvas);
garage.miniWork.configure(liveAgents);

const activityFeedback = createActivityFeedback(canvas.parentElement!);

// Small, uneven groups sit on the room floor, with a walking strip behind the desks.
const indoorPlants = createIndoorPlants(interior);
const plant = indoorPlants.plant;
plant('broad', -5.83, -5.72, 1.12, 0);
plant('rubber', -4.85, -5.77, 0.92, 0.8);
plant('fern', -4.1, -5.38, 0.78, 1.6);
plant('cactus', -3.3, -5.74, 0.72, 0);
plant('trailing', 4.38, -5.2, 0.79, 2.4);
plant('calathea', 5.85, -5.25, 0.85, 3.2);
plant('bird', 7.05, -5.98, 1.02, 4);
plant('succulent', 6.68, -5.05, 0.64, 1);
plant('palm', -6.25, 4.12, 0.92, 1.1);
plant('snake', 1.85, 4.72, 0.82, 2.1);
plant('bonsai', -1.25, 4.62, 0.48, 2, 0.53);
plant('rubber', -5.55, 5.55, 0.83, 0.4);
plant('fern', -1.0, 5.55, 0.7, 2.6);

// Build the board from the same small, solid forms as the couch, so its frame,
// enamel face, tray and wheels respond to the room light rather than baked art.
const whiteboard = new THREE.Group();
const boardPanel = new THREE.Group(); whiteboard.add(boardPanel);
const boardFrame = standard('#4e5267', 1, '#0c0d1b');
const boardEdge = standard('#71758a', 1, '#0c0d1b');
const boardFace = standard('#e7ebed', 0.82, '#657186');
const boardWheel = standard('#252639', 1);
// Shorten the stand to lower the writing surface while preserving the approved
// panel proportions, frame thickness, tray and wheels.
const boardDrop = 0.4;
function boardPart(size: [number, number, number], position: [number, number, number], material: THREE.Material, parent = whiteboard): void {
  const part = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  part.position.set(...position);
  part.castShadow = true;
  part.receiveShadow = true;
  parent.add(part);
}
boardPart([1.12, 1.12, 0.1], [0, 1.2 - boardDrop, 0], boardFrame, boardPanel);
boardPart([0.98, 0.98, 0.045], [0, 1.2 - boardDrop, 0.069], boardFace, boardPanel);
boardPart([0.98, 0.98, 0.045], [0, 1.2 - boardDrop, -0.069], boardFace, boardPanel);
for (const x of [-0.52, 0.52]) {
  boardPart([0.075, 1.52 - boardDrop, 0.075], [x, 0.9 - boardDrop / 2, -0.025], boardEdge);
  boardPart([0.12, 0.075, 0.55], [x, 0.115, 0.015], boardFrame);
  for (const z of [-0.2, 0.23]) boardPart([0.115, 0.12, 0.12], [x, 0.06, z], boardWheel);
}
boardPart([1.12, 0.07, 0.18], [0, 0.64 - boardDrop, 0.1], boardEdge);
boardPart([0.20, 0.03, 0.04], [0.29, 0.69 - boardDrop, 0.15], standard('#dddeda'));
boardPart([0.095, 0.033, 0.045], [0.15, 0.69 - boardDrop, 0.15], standard('#204eba'));
boardPart([0.035, 0.033, 0.04], [0.405, 0.69 - boardDrop, 0.15], standard('#222331'));
boardPart([0.11, 0.045, 0.065], [-0.28, 0.7 - boardDrop, 0.14], boardWheel);
whiteboard.position.set(-7.0, 0, -2.35);
whiteboard.rotation.y = 0.28;
interior.add(whiteboard);
contactShadow(whiteboard, { width: 1.04, depth: 0.28, z: 0.015, spread: 0.18, opacity: 0.1 });
for (const x of [-0.52, 0.52]) for (const z of [-0.2, 0.23]) {
  contactShadow(whiteboard, { x, z, width: 0.115, depth: 0.12, spread: 0.055, opacity: 0.32 });
}
const whiteboardInteraction = createWhiteboardInteraction({
  board: whiteboard, panel: boardPanel, centerY: 1.2 - boardDrop, camera, canvas, renderer,
});

// A shorter counter joins the low brand cabinet; both share the front wall line.
const counterWidth = FRONT_COUNTER.width;
const counterTopWidth = FRONT_COUNTER.width;
const counterCenter = FRONT_COUNTER.x;
const counterTopCenter = FRONT_COUNTER.x;
const counterZ = FRONT_COUNTER.z - INTERIOR_Z;
// A recessed toe-kick and continuous cabinet body visibly meet the floor.
interior.add(box([counterWidth - 0.14, 0.055, 0.29], [counterCenter, 0.0275, counterZ], standard('#4b3b1c')));
interior.add(box([counterWidth - 0.08, 0.31, 0.31], [counterCenter, 0.205, counterZ], standard('#70551c')));
interior.add(box([counterWidth, 0.16, 0.34], [counterCenter, 0.36, counterZ], standard('#8b6914')));
interior.add(box([counterTopWidth, 0.1, FRONT_COUNTER.depth], [counterTopCenter, FRONT_COUNTER.topY-.05, counterZ], standard('#c4991a')));
contactShadow(interior, { x: counterCenter, z: counterZ, floorY: 0.018,
  width: counterWidth - 0.14, depth: 0.29, spread: 0.18, opacity: 0.32 });
const vendingMachine=createVendingMachine(interior);
vendingMachine.root.position.set(FRONT_VENDING.x,0,FRONT_VENDING.z-INTERIOR_Z);
// Front desk room, beside its right divider; the display faces left into the room.
vendingMachine.root.rotation.y=FRONT_VENDING.rotationY;
const teamDesk = createTeamDesk(interior, canvas, camera, renderer, () => factoryControls.state.stop(), mountainView.setVisitors, liveAgents.contributionFor);
const brandLibrary = createBrandLibrary(interior, canvas, () => factoryControls.state.stop(), camera, renderer);
brandLibrary.addTrigger(brandFlag.target, 'patio', 'Open the WE flag and brand shelf');

function cornerCouch(x: number, z: number): void {
  const group = new THREE.Group();
  const back = standard('#442266', 1, '#10091d');
  const seat = standard('#5b3890', 1, '#10091d');
  const highlight = standard('#6b48a0', 1, '#120a20');
  const foot = standard('#222222', 1);

  const addPart = (size: [number, number, number], position: [number, number, number], material: THREE.Material) => {
    const part = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    part.position.set(...position);
    part.castShadow = true;
    part.receiveShadow = true;
    group.add(part);
  };

  addPart([1.3, 0.48, 0.16], [0, 0.31, -0.34], back);
  addPart([1.18, 0.18, 0.5], [0.02, 0.17, -0.03], seat);
  addPart([1.08, 0.07, 0.44], [0.02, 0.29, -0.03], highlight);
  addPart([0.16, 0.48, 1.02], [0.87, 0.31, 0.1], back);
  addPart([0.52, 0.18, 0.86], [0.6, 0.17, 0.25], seat);
  addPart([0.46, 0.07, 0.76], [0.6, 0.29, 0.25], highlight);
  addPart([0.16, 0.34, 0.55], [-0.65, 0.24, -0.03], back);
  addPart([0.54, 0.34, 0.16], [0.6, 0.24, 0.69], back);
  addPart([0.1, 0.1, 0.1], [-0.58, 0.05, -0.28], foot);
  addPart([0.1, 0.1, 0.1], [0.58, 0.05, -0.28], foot);
  addPart([0.1, 0.1, 0.1], [0.82, 0.05, 0.62], foot);
  roomBatchSavings+=batchStaticSiblings(group,[...group.children] as THREE.Mesh[]);
  group.position.set(x, 0, z);
  // The two contact footprints follow the L-shaped base, with a soft edge.
  // The group is scaled vertically below, so convert the receiving floor to local Y.
  contactShadow(group, { x: 0.02, z: -0.03, width: 1.3, depth: 0.53, floorY: 0.018 / 0.8,
    spread: 0.18, opacity: 0.24 });
  contactShadow(group, { x: 0.65, z: 0.35, width: 0.56, depth: 0.85, floorY: 0.018 / 0.8,
    spread: 0.18, opacity: 0.24 });
  // Seat faces the keyboard; the long back sits toward the counter.
  group.rotation.y = Math.PI / 2;
  // Keep the L-shaped footprint, with a lower seat and shoulder-height back.
  group.scale.y = 0.8;
  interior.add(group);
}

// Keep the doorway and a walking lane open along the couch’s right side.
cornerCouch(0.65, 5.8);
const newspaper = createNewspaper(interior, canvas, camera);
// The plant shelf moved into the garage, keeping the lift and side aisle clear.
const natureTv = createNatureTv(interior);
const sharedPickups = installSharedPickups(canvas);
const sharedProps = createSharedProps();
const roomStaff = createRoomStaff(scene, whiteboard, canvas, whiteboardInteraction.openBoard, whiteboardInteraction.boardMotion, sharedProps);
const loungeDetails = createLoungeDetails(interior, canvas, camera, renderer, teamDesk.members);
const loungeRadio = createLoungeRadio(interior, canvas, camera, { preferences: sceneAudio.musicPreferences, enable: sceneAudio.enableMusic });
loungeDetails.chat.configureNotifications({ buzz: sceneAudio.phoneBuzz, stop: sceneAudio.stopPhoneBuzz });

let currentViewCamera: THREE.Camera = camera;
// Modal transitions blend from an orthographic pose; the basketball close-up is a perspective camera and must not be their source.
let currentPoseCamera: THREE.OrthographicCamera = camera;
let carDrivingActive = () => false;
const roomNavigation = createRoomNavigation(garage, sideRoom);
const avatarStage = createAvatarStage(scene, sideRoomScene, garage.scene, liveAgents, canvas, renderer,
  () => currentPoseCamera, () => factoryControls.getTargetSessionId() ?? undefined,
  point => floorKeyboard.floorHeight({ x: point.x, z: point.z - interior.position.z }));
const factoryControls = createFactoryControls(canvas, liveAgents, () => currentViewCamera,
  () => !carDrivingActive() && !garage.isTransitioning() && !avatarStage.isActive() && !whiteboardInteraction.isTransitioning() && whiteboardInteraction.isRoomView() && !windowInteraction.isOpen() && !loungeDetails.chat.isActive() && !teamDesk.isActive() && !brandLibrary.isActive() && !document.body.matches('.inspect-open,.newspaper-open'),
  room => roomNavigation.request(room), avatarStage,
  () => garage.isActive() ? 'garage' : sideRoom.isActive() ? 'patio' : 'factory',
  () => roomNavigation.destination() ?? (garage.isActive() ? 'garage' : sideRoom.isActive() ? 'patio' : 'factory'),
  () => roomNavigation.destination() !== undefined);
const garageDriving = createGarageDriving(garage.room, garage.cars, liveAgents, canvas, () => {
  factoryControls.state.stop(); if (factoryControls.state.active) factoryControls.state.release();
});
carDrivingActive = garageDriving.isActive;
garage.setDriveAction(garageDriving.claim);
loungeDetails.chat.configureCommands({
  getTargetSessionId: () => factoryControls.getTargetSessionId(),
  logout: () => factoryControls.logout(),
  requestRoom() {
    if (!whiteboardInteraction.isRoomView() || windowInteraction.isOpen() || teamDesk.isActive() || brandLibrary.isActive() || document.body.classList.contains('inspect-open')) return false;
    factoryControls.state.stop(); roomNavigation.request('factory'); return true;
  },
});
const floorKeyboard = createFloorKeyboard(interior, canvas, camera, () => factoryControls.guideMovement());
vendingMachine.attachInteraction({ canvas, shared: sharedProps, camera: () => currentViewCamera,
  sounds: { select: sceneAudio.vendingSelect, dispense: sceneAudio.vendingDispense, land: sceneAudio.vendingLand, stop: sceneAudio.stopPropSounds },
  visible: () => !garage.isActive() && !garage.isTransitioning() && !sideRoom.isActive() && !avatarStage.isActive()
    && whiteboardInteraction.isRoomView() && !windowInteraction.isOpen() && !loungeDetails.chat.isActive()
    && !teamDesk.isActive() && !brandLibrary.isActive() && !document.body.matches('.inspect-open,.newspaper-open'),
});
const lightInteractions = createLightInteractions(canvas, [
  ...[...loungeDetails.lightSwitches, ...ceilingLights.lightSwitches].map(light => ({ ...light, room: 'factory' as const })),
  ...garage.lightSwitches.map(light => ({ ...light, room: 'garage' as const })),
  ...patio.lightSwitches.map(light => ({ ...light, room: 'patio' as const })),
], {
  camera: () => currentViewCamera,
  visible: room => !duckHunt.isActive() && !loungeRadio.isActive() && !garage.isTransitioning() && !avatarStage.isActive() && whiteboardInteraction.isRoomView()
    && !windowInteraction.isOpen() && !loungeDetails.chat.isActive() && !teamDesk.isActive() && !brandLibrary.isActive()
    && (room === 'garage' ? garage.isActive() : room === 'patio' ? sideRoom.isActive() && !garage.isActive()
      : !garage.isActive() && !sideRoom.isActive()),
  sound: (kind, on) => kind === 'candle' ? sceneAudio.candle(on) : sceneAudio.lampSwitch(on),
  onCleanup: job => roomStaff.enqueueCleanup(job), shared: sharedProps,
});
const basketball = createBasketball(interior, canvas, [], {
  tap: () => sceneAudio.ballTap(), swish: () => sceneAudio.ballSwish(), bounce: energy => sceneAudio.ballBounce(energy),
});
const visitorBasketball = createVisitorBasketball(interior, canvas, basketball.pickups, index => index > 0 || !basketball.active,
  { result: made => basketball.showResult(made), rim: energy => basketball.hitRim(energy), swish: () => { basketball.swishNet(); sceneAudio.ballSwish(); }, bounce: energy => sceneAudio.ballBounce(energy) },
  { factory: interior, patio: sideRoomScene, garage: garage.room,
    current: () => garage.isActive() ? 'garage' : sideRoom.isActive() ? 'patio' : 'factory',
    visit: room => roomNavigation.request(room), transitioning: () => garage.isTransitioning() }, basketball.pickupShadows);
// Asynchronous HORSE between durable people from the front-desk roster: floor mark and island turn status.
const basketballChallenges = createBasketballChallenges(interior, canvas, visitorBasketball, { principal: () => whiteboardInteraction.getData().principal, members: () => teamDesk.members(),
  replayEffects: { rim: energy => basketball.hitRim(energy), swish: () => { basketball.swishNet(); sceneAudio.ballSwish(); }, bounce: energy => sceneAudio.ballBounce(energy), result: made => basketball.showResult(made) } });
const snackCarry = createSnackCarry(vendingMachine, canvas, () => liveAgents.entries.values(),
  entry => !liveAgents.isPerforming(entry.session.sessionId)
    && !(basketball.active && basketballPlayers[basketball.player]?.id === entry.session.sessionId), sharedProps);
let basketballRoster = '';
let basketballPlayers: { id: string; name: string; position: THREE.Vector3; home: FloorPoint }[] = [];

const ambient = new THREE.HemisphereLight('#9bb6df', '#363453', 4.1);
scene.add(ambient);
// The roofless patio has cooler sky fill and warm timber bounce of its own;
// keep it separate from the enclosed room's deliberately generous fill.
const sideRoomAmbient = ambient.clone();
const patioSkyFill = new THREE.Color('#b6cbed');
sideRoomScene.add(sideRoomAmbient);

// A real window-sized source supplies the broad room wash. It intentionally
// does not cast shadows; the directional light below only provides object form.
const windowWashLight = new THREE.RectAreaLight('#c2dcff', 8, 15.2, glassHeight - 0.1);
windowWashLight.position.set(0, glassCenterY, -4.49);
windowWashLight.lookAt(0, glassCenterY, 2.8);
scene.add(windowWashLight);

const windowLight = new THREE.DirectionalLight('#dcecff', 0.95);
windowLight.position.set(-3, 5.8, -6.1);
windowLight.castShadow = true;
windowLight.shadow.mapSize.set(1024, 1024);
windowLight.shadow.camera.left = -14;
windowLight.shadow.camera.right = 14;
windowLight.shadow.camera.top = 11;
windowLight.shadow.camera.bottom = -11;
windowLight.shadow.camera.near = 0.5;
windowLight.shadow.camera.far = 70;
windowLight.shadow.bias = -0.0001;
windowLight.shadow.radius = 0;
windowLight.target.position.set(0, 0, 1.6 + interior.position.z);
scene.add(windowLight, windowLight.target);

const magentaBounce = new THREE.PointLight('#ff2bdd', 0.9, 7.5, 2);
magentaBounce.position.set(6.2, 1.1, 3.5 + interior.position.z);
scene.add(magentaBounce);
const thunderstorm=createThunderstorm({scene,patioScene:sideRoomScene,garageScene:garage.scene,
  width:15.84,height:glassHeight,centerY:glassCenterY,onThunder:(energy,pan)=>sceneAudio.thunder(energy,pan)});

let dragging = false;
let sunArc = -3;
let weatherSettled = true;
let lastWeatherUpdate = 0;

function rgb(color: THREE.Color): readonly [number, number, number] {
  const value = color.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
  return [Math.round(value.r * 255), Math.round(value.g * 255), Math.round(value.b * 255)];
}

function setLightX(value: number): void {
  sunArc = THREE.MathUtils.clamp(value, -7, 7);
  const horizon = Math.pow(Math.abs(sunArc) / 7, 1.35);
  const evening = sunArc > 0;
  const lunarLight = moonIllumination(moonPhase);
  sunMaterial.map = isNight ? moonTextures.get(moonPhase)! : sunTexture;
  moonSelect.hidden = !isNight;
  // The same day position drives the visible sun, sky, mountain tint and room.
  sun.position.set(sunArc, THREE.MathUtils.lerp(glassTop - 0.52, glassTop - 1.95, horizon), -4.62);
  sunMaterial.color.set(evening ? '#ffbf78' : '#ffdc9c').lerp(new THREE.Color('#fff4be'), 1 - horizon);
  if (isNight) sunMaterial.color.set('#d5e2f2');
  windowLight.position.set(
    sunArc,
    THREE.MathUtils.lerp(9.2, 3.25, horizon),
    THREE.MathUtils.lerp(-6.4, -5.35, horizon),
  );
  // Directional sunlight is parallel. Moving its shadow camera back along
  // the same ray keeps the roof ahead of its near plane at every sun angle.
  windowLight.position.sub(windowLight.target.position).normalize().multiplyScalar(40).add(windowLight.target.position);
  const top = new THREE.Color('#80acd8').lerp(new THREE.Color(evening ? '#756588' : '#9697bd'), horizon);
  const bottom = new THREE.Color('#c3d2e3').lerp(new THREE.Color(evening ? '#eea174' : '#efd0a6'), horizon);
  currentPalette = weatherPalette(liveTime ? liveSunAt(skyClock()).palette : isNight ? paletteForElevation(-18, false) : {
    ...paletteForElevation(45, !evening), skyTop: rgb(top), skyHorizon: rgb(bottom),
  }, weather);
  top.setRGB(...currentPalette.skyTop.map(value => value / 255) as [number, number, number], THREE.SRGBColorSpace);
  bottom.setRGB(...currentPalette.skyHorizon.map(value => value / 255) as [number, number, number], THREE.SRGBColorSpace);
  const light = weatherLighting(weather);
  boardFace.emissiveIntensity = (isNight ? 0.42 : 0.65) * light.ambient;
  sunMaterial.opacity = light.direct;
  if (backdropContext) {
    for (let y = 0; y < backdropCanvas.height; y += 1) {
      const t = y / (backdropCanvas.height - 1);
      const color = top.clone().lerp(bottom, Math.pow(t, 0.9));
      backdropContext.fillStyle = color.getStyle();
      backdropContext.fillRect(0, y, backdropCanvas.width, 1);
    }
    if (isNight) {
      // The existing palette controls star visibility; cloud layers still occlude them.
      const stars = currentPalette.stars * (1 - weather.cloud01);
      backdropContext.fillStyle = `rgba(197,210,237,${stars * 0.72})`;
      for (let i = 0; i < 70; i += 1) {
        const x = (i * 73 + i * i * 17) % 256; const y = (i * 37 + i * i * 11) % 74;
        // The dark part of the moon still blocks stars. Include the largest
        // vertical correction used by the room/window cameras and a pixel margin.
        const starX = (x / 256 - 0.5) * 15.84;
        const starY = glassTop - y / 96 * glassHeight;
        if (Math.abs(starX - sun.position.x) < 0.29 && Math.abs(starY - sun.position.y) < 0.48) continue;
        backdropContext.fillRect(x, y, 1, 1);
      }
    }
    backdropTexture.needsUpdate = true;
  }
  mountainView.setEnvironment(sunArc, weather, currentPalette, isNight, lunarLight);
  windowWashLight.color.copy(bottom).lerp(new THREE.Color('#ffe0b5'), horizon * 0.55 * (1 - weather.cloud01));
  windowLight.color.set('#fff1da').lerp(new THREE.Color(evening ? '#ffc58d' : '#ffdfb4'), horizon);
  ambient.color.set('#9bb6df').lerp(new THREE.Color(evening ? '#a395be' : '#b4b7d4'), horizon * 0.65);
  ambient.color.lerp(new THREE.Color('#97abc7'), weather.cloud01 * 0.45);
  windowWashLight.intensity = THREE.MathUtils.lerp(8, 6.4, horizon) * light.window;
  windowLight.intensity = THREE.MathUtils.lerp(0.95, 1.1, horizon) * light.direct;
  windowLight.castShadow = light.direct > 0.02;
  ambient.intensity = THREE.MathUtils.lerp(4.1, 3.6, horizon) * light.ambient;
  if (isNight) {
    windowWashLight.color.set('#7184b0'); windowWashLight.intensity *= 0.12 * (0.25 + lunarLight * 0.75);
    windowLight.color.set('#b2c9ee'); windowLight.intensity *= 0.12 * lunarLight;
    ambient.color.set('#6c7baf'); ambient.intensity *= 0.42;
  }
  lightSlider.value = sunArc.toFixed(1);
  lightSlider.setAttribute('aria-label', isNight ? 'Moon arc' : 'Sun arc');
  requireElement<HTMLLabelElement>('label[for="slice-light"]').textContent = isNight ? 'moon arc' : 'sun arc';
  const timeLabel = Math.abs(sunArc) < 1 ? 'midday' : sunArc < 0 ? 'morning' : 'evening';
  lightSlider.setAttribute('aria-valuetext', isNight ? 'moon position' : timeLabel);
}

const sceneEvents = new AbortController();
timeSelect.addEventListener('change', () => {
  liveTime = timeSelect.value === 'live';
  isNight = liveTime ? liveSunAt(skyClock()).night : timeSelect.value === 'night';
  const search = new URLSearchParams(location.search);
  if (liveTime) { search.delete('skyTime'); search.delete('skySpeed'); } else search.set('skyTime', isNight ? 'night' : 'day');
  history.replaceState(null, '', `${location.pathname}?${search}${location.hash}`);
  setLightX(sunArc);
}, { signal: sceneEvents.signal });

lightSlider.addEventListener('input', () => { liveTime = false; timeSelect.value = isNight ? 'night' : 'day'; setLightX(Number(lightSlider.value)); }, { signal: sceneEvents.signal });
moonSelect.addEventListener('change', () => {
  const search = new URLSearchParams(location.search);
  search.set('moonPhase', moonSelect.value);
  moonPhase = moonPhaseFromSearch(search.toString());
  if (moonPhase === 'full') search.delete('moonPhase');
  history.replaceState(null, '', `${location.pathname}?${search}${location.hash}`);
  setLightX(sunArc);
}, { signal: sceneEvents.signal });
weatherSelect.addEventListener('change', () => {
  liveWeather = weatherSelect.value === 'live';
  if (liveWeather) {
    weatherTransition.select(latestLiveWeather, performance.now()); weatherSettled = false;
    const search = new URLSearchParams(location.search); search.delete('skyWeather');
    history.replaceState(null, '', `${location.pathname}?${search}${location.hash}`); return;
  }
  const preset = weatherPresetById(weatherSelect.value);
  if (!preset) return;
  weatherTransition.select(preset.state, performance.now());
  weatherSettled = false;
  history.replaceState(null, '', `${location.pathname}${searchWithWeatherPreset(location.search, preset.id)}${location.hash}`);
}, { signal: sceneEvents.signal });
canvas.addEventListener('pointerdown', (event) => {
  if (windowInteraction.isOpen() || !whiteboardInteraction.isRoomView() || event.button !== 0 || !requireElement<HTMLDetailsElement>('.scene-settings').open) return;
  dragging = true;
  canvas.setPointerCapture(event.pointerId);
  const rect = canvas.getBoundingClientRect();
  setLightX(THREE.MathUtils.lerp(-7, 7, (event.clientX - rect.left) / rect.width));
}, { signal: sceneEvents.signal });
canvas.addEventListener('pointermove', (event) => {
  if (!dragging || !whiteboardInteraction.isRoomView()) return;
  const rect = canvas.getBoundingClientRect();
  setLightX(THREE.MathUtils.lerp(-7, 7, (event.clientX - rect.left) / rect.width));
}, { signal: sceneEvents.signal });
canvas.addEventListener('pointerup', (event) => {
  dragging = false;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
}, { signal: sceneEvents.signal });
canvas.addEventListener('pointercancel', () => { dragging = false; }, { signal: sceneEvents.signal });

setLightX(Number(lightSlider.value));
magentaBounce.intensity = 0.58;

const weatherStatus = document.createElement('p'); weatherStatus.className = 'live-weather-status';
weatherSelect.parentElement!.append(weatherStatus);
const weatherBadge = document.createElement('p'); weatherBadge.className = 'live-weather-badge';
document.body.append(weatherBadge);
function showWeatherSource() {
  const message = liveWeather ? weatherStatus.textContent ?? 'weather connecting' : `preview weather · ${weatherSelect.value}`;
  weatherBadge.textContent = message;
  document.querySelector('#window-open')?.setAttribute('title', message);
}
weatherSelect.addEventListener('change', showWeatherSource, { signal: sceneEvents.signal });
const stopWeather = watchLiveWeather(next => {
  latestLiveWeather = next;
  if (liveWeather) { weatherTransition.select(next, performance.now()); weatherSettled = false; }
}, message => { weatherStatus.textContent = message; showWeatherSource(); });
let lastSunUpdate = -Infinity;
// Batch only explicitly constructed fixed architecture; dynamic props stay separate.
for(const parent of [scene,interior])roomBatchSavings+=batchStaticSiblings(parent,fixedRoomBoxes);
canvas.dataset.roomBatchSavings=String(roomBatchSavings);
canvas.dataset.plantBatchSavings=String(interior.userData.plantBatchSavings??0);
const startedAt = performance.now();
let previousElapsed = 0;

function animate(): void {
  // Embedded browsers may keep scheduling hidden tabs. Pause all scene work.
  if(document.hidden){previousElapsed=(performance.now()-startedAt)/1000;return;}
  const elapsed = (performance.now() - startedAt) / 1000;
  const frameDt = Math.max(0, elapsed - previousElapsed);
  const dt = Math.min(frameDt, 0.1);
  previousElapsed = elapsed;
  const now = performance.now();
  wallClock.update(now);
  // Sun direction changes slowly; avoid rebuilding the sky palette every second.
  if (liveTime && now - lastSunUpdate >= 10000) { const sun = liveSunAt(skyClock()); isNight = sun.night; setLightX(sun.arc); lastSunUpdate = now; }
  whiteboardInteraction.update(now);
  const djViewActive = loungeRadio.isActive();
  const roomNavigationAvailable = !duckHunt.isActive() && !djViewActive && !avatarStage.isActive() && whiteboardInteraction.isRoomView() && !windowInteraction.isOpen() && !loungeDetails.chat.isActive() && !teamDesk.isActive() && !brandLibrary.isActive() && !document.body.matches('.inspect-open,.newspaper-open');
  garage.update(now, roomNavigationAvailable && !sideRoom.isActive() && !carDrivingActive(), currentViewCamera, factoryControls.controlledAgent(), factoryControls.serverNow(), roomNavigationAvailable && carDrivingActive(), whiteboardInteraction.getData().world?.environment === 'factory25d' ? whiteboardInteraction.getData().world?.agents : []);
  scene.position.y=sideRoomScene.position.y=garage.upperFloorOffset();
  sideRoom.update(now, roomNavigationAvailable && !garage.isActive() && !garage.isTransitioning());
  roomNavigation.update(roomNavigationAvailable);
  const factoryRoomVisible = !garage.isActive() && !garage.isTransitioning() && whiteboardInteraction.isRoomView() && !windowInteraction.isOpen() && !sideRoom.isActive() && !loungeDetails.chat.isActive() && !teamDesk.isActive() && !brandLibrary.isActive();
  const mainRoomVisible = factoryRoomVisible && !djViewActive;
  newspaper.update(factoryRoomVisible && !djViewActive);
  windowInteraction.update(now, !djViewActive && !garage.isActive() && !garage.isTransitioning() && whiteboardInteraction.isRoomView() && !sideRoom.isActive() && !loungeDetails.chat.isActive() && !teamDesk.isActive() && !brandLibrary.isActive());
  teamDesk.update(now, mainRoomVisible);
  natureTv.update(elapsed, reducedSceneMotion.matches, mainRoomVisible);
  ceilingLights.update(dt, isNight);


  if (!weatherSettled && now - lastWeatherUpdate >= 50) {
    weather = weatherTransition.at(now);
    weatherSettled = !weatherTransition.isChanging(now);
    lastWeatherUpdate = now;
    setLightX(sunArc);
  }
  sceneAudio.update({ weather, patio01: sideRoom.outdoorProgress(), window01: windowInteraction.proximity(), night: isNight,
    reading: newspaper.isActive() || !whiteboardInteraction.isRoomView() || loungeDetails.chat.isActive() || teamDesk.isActive() || brandLibrary.isActive() });
  activeScreenTexture.offset.x = (Math.floor(elapsed * 4) % 4) * 0.25;
  const factoryData = whiteboardInteraction.getData();
  liveAgents.sync(factoryData.world); factoryControls.sync(factoryData);
  teamDesk.setTickets(factoryData.world?.stationTickets);
  activityFeedback.sync(factoryData.world, liveAgents.entries.values());
  const eligible = [...liveAgents.entries.values()].filter(entry => entry.session.activity === 'idle' && !entry.session.manualControl && entry.seatBlend < .01
    && !liveAgents.isPerforming(entry.session.sessionId) && entry.mesh.userData.room === 'factory').slice(0, 2);
  const roster = eligible.map(entry => entry.session.sessionId).join('|');
  if (roster !== basketballRoster) {
    basketballRoster = roster;
    basketballPlayers = eligible.map(entry => ({ id: entry.session.sessionId, name: entry.session.sessionName || entry.session.username,
      position: new THREE.Vector3(entry.mesh.position.x, 0, entry.mesh.position.z - 1.95), home: { x: entry.mesh.position.x, z: entry.mesh.position.z - 1.95 } }));
    basketball.setPlayers(basketballPlayers);
  }
  // Idle roaming stays authoritative between shots. Only an active local game
  // temporarily supplies its player's pose, and live work/control cancels it.
  if (!basketball.active) for (const player of basketballPlayers) {
    const entry = liveAgents.entries.get(player.id)!;
    player.position.set(entry.mesh.position.x, 0, entry.mesh.position.z - 1.95);
    player.home.x = player.position.x; player.home.z = player.position.z;
  }
  basketball.update(dt, camera, mainRoomVisible, !factoryControls.state.active && !visitorBasketball.busy && !avatarStage.isActive(), reducedSceneMotion.matches);
  const stationFeedback = activityFeedback.stationStates();
  for (const [id, station] of stationVisuals) station.setFeedback(stationFeedback.get(id));
  garage.setStationFeedback(stationFeedback);
  const feet = [...liveAgents.entries.values()].filter(entry => entry.mesh.userData.room === 'factory').map(entry => ({ x: entry.mesh.position.x, z: entry.mesh.position.z - 1.95 }));
  floorKeyboard.update(dt, feet, mainRoomVisible);
  indoorPlants.update(elapsed, reducedSceneMotion.matches, mainRoomVisible ? feet : []);

  vendingMachine.update(elapsed,reducedSceneMotion.matches,dt);
  loungeDetails.update(elapsed, reducedSceneMotion.matches, factoryData, camera, mainRoomVisible);
  brandLibrary.update(now, currentPoseCamera, roomNavigationAvailable && !garage.isActive() && !garage.isTransitioning()
    ? sideRoom.isActive() && !sideRoom.showsFactory() ? 'patio' : mainRoomVisible ? 'factory' : undefined : undefined);
  const baseCamera = avatarStage.isActive() ? avatarStage.camera : brandLibrary.isActive() ? brandLibrary.camera : (garage.isActive() || garage.isTransitioning()) ? garage.camera : teamDesk.isActive() ? teamDesk.camera : loungeDetails.chat.isActive() ? loungeDetails.chat.camera : windowInteraction.isOpen() ? windowInteraction.camera : sideRoom.isActive() ? sideRoom.camera : camera;
  const zoomedCamera = avatarStage.isActive() ? baseCamera : pointerZoom.cameraFor(baseCamera, now);
  const viewCamera = duckHunt.cameraFor(loungeRadio.cameraFor(visitorBasketball.cameraFor(zoomedCamera,dt),dt),dt);
  loungeRadio.update(viewCamera, factoryRoomVisible && !avatarStage.isActive() && whiteboardInteraction.isRoomView() && !windowInteraction.isOpen()
    && !loungeDetails.chat.isActive() && !teamDesk.isActive() && !brandLibrary.isActive() && !document.body.matches('.inspect-open,.newspaper-open'),
    sideRoom.isActive() && !sideRoom.showsFactory() && !garage.isActive());
  viewCamera.updateMatrixWorld(); currentViewCamera = viewCamera;
  currentPoseCamera = viewCamera instanceof THREE.OrthographicCamera ? viewCamera : zoomedCamera;
  if (sideRoom.isActive() && !document.hidden) brandFlag.update(elapsed, weather.wind01, reducedSceneMotion.matches);
  mistFlag.update(elapsed, dt, weather.wind01, viewCamera,
    sideRoom.isActive() && !sideRoom.showsFactory() && !garage.isTransitioning() && !garage.isActive()
      && !avatarStage.isActive() && !brandLibrary.isActive() && !teamDesk.isActive() && !loungeDetails.chat.isActive(), reducedSceneMotion.matches);
  stationTickets.update(factoryData.world, liveAgents.serverNow(), viewCamera, room => roomNavigationAvailable && !garage.isTransitioning() && (room === 'garage' ? garage.isActive() : room === 'patio' ? sideRoom.isActive() && !garage.isActive() : mainRoomVisible), reducedSceneMotion.matches);
  roomStaff.update(now, viewCamera, mainRoomVisible && !visitorBasketball.cameraActive, reducedSceneMotion.matches, factoryData, whiteboardInteraction.managerTask());
  liveAgents.update(elapsed, viewCamera, mainRoomVisible || garage.isTransitioning(), sideRoom.isActive(), point => floorKeyboard.floorHeight(point), whiteboard, garage.isCrossSection()?garage.lowerFloorCamera:undefined);
  if (basketball.active) {
    const player = basketballPlayers[basketball.player], entry = player && liveAgents.entries.get(player.id);
    if (entry) liveAgents.placeOverride(player.id, { x: player.position.x, z: player.position.z + 1.95 }, basketball.jump);
  }
  factoryControls.update();
  windowReflections.update(liveAgents.entries.values(),viewCamera,dt,mainRoomVisible && !avatarStage.isActive());
  garage.carAnimation.update(garage.isActive() && !garage.isTransitioning() && !avatarStage.isActive(), reducedSceneMotion.matches, garageDriving.busy);
  garage.miniWork.update(reducedSceneMotion.matches, !avatarStage.isActive() && !garageDriving.busy.has('mini'));
  garageDriving.update(dt, now, garage.isActive() && !garage.isTransitioning() && roomNavigationAvailable, reducedSceneMotion.matches);
  snackCarry.update(elapsed, mainRoomVisible && !garage.isTransitioning() && !avatarStage.isActive(), reducedSceneMotion.matches);
  sceneAudio.garageEngine(garageDriving.engine() ?? garage.carAnimation.engine());
  avatarStage.update(now);
  const editingAvatar = avatarStage.isActive();
  closeUpFloor.visible = brandLibrary.isActive() || teamDesk.isActive() || loungeDetails.chat.isActive() || editingAvatar;
  const floorSection = !editingAvatar && garage.isCrossSection();
  const showFactory = editingAvatar ? avatarStage.scene() === scene : floorSection || !garage.isActive() && sideRoom.showsFactory();
  const showGarage = editingAvatar ? avatarStage.scene() === garage.scene : floorSection || garage.isActive();
  if (showGarage) garage.lighting.sync({ ambient, window: windowWashLight, sun: windowLight });
  const showPatio = editingAvatar ? avatarStage.scene() === sideRoomScene : floorSection || sideRoom.isActive();
  viewFrustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(viewCamera.projectionMatrix, viewCamera.matrixWorldInverse));
  // Patio puddles also need the panorama even when it is above the camera's view.
  const sceneryVisible = showGarage || showPatio || (showFactory && viewFrustum.intersectsBox(sceneryBounds));
  const lightning=thunderstorm.update(dt,weather,reducedSceneMotion.matches,!document.hidden);
  canvas.dataset.lightning=lightning.toFixed(3);
  windowWeather.update(frameDt, weather, currentPalette, sunArc, isNight, sceneryVisible,lightning);
  mountainView.setLightning(lightning);
  mountainView.render(elapsed, sceneryVisible, viewCamera, glassCenterY);
  const visitorBallVisible = !duckHunt.isActive() && !djViewActive && !garage.isTransitioning() && !avatarStage.isActive() && whiteboardInteraction.isRoomView() && !windowInteraction.isOpen() && !loungeDetails.chat.isActive() && !teamDesk.isActive() && !brandLibrary.isActive();
  visitorBasketball.update(dt, viewCamera, visitorBallVisible);
  basketballChallenges.update(visitorBallVisible && mainRoomVisible, viewCamera,
    (visitorBallVisible && mainRoomVisible) || teamDesk.isExiting());
  activityFeedback.update();
  duckHunt.update(dt, viewCamera, sideRoom.isActive() && !sideRoom.showsFactory());
  // Keep a square sky image in both the tilted room view and the straight-on window view.
  // Its plane stays behind mountains/clouds instead of rotating through those layers.
  // Project a translation-invariant sky direction onto the panorama. This keeps
  // the sun at optical infinity while retaining window/cloud occlusion.
  const celestialHorizon=Math.pow(Math.abs(sunArc)/7,1.35);
  celestialPoint.set(sunArc,THREE.MathUtils.lerp(glassTop-.52,glassTop-1.95,celestialHorizon),-4.62)
    .add(viewCamera.position).sub(celestialReferenceEye);
  if(viewCamera instanceof THREE.PerspectiveCamera)celestialRay.copy(celestialPoint).sub(viewCamera.position).normalize();
  else viewCamera.getWorldDirection(celestialRay);
  if(Math.abs(celestialRay.z)>.001){
    const distance=(-4.62-celestialPoint.z)/celestialRay.z;
    sun.position.copy(celestialPoint).addScaledVector(celestialRay,distance);
  }
  sun.scale.y = 1 / Math.max(0.5, Math.abs(viewCamera.matrixWorldInverse.elements[5]));
  windowWeather.renderRefraction(viewCamera, showFactory && !document.hidden, showGarage && !document.hidden, garage.isCrossSection()?garage.lowerFloorCamera:undefined);
  if (showPatio) {
    sideRoomAmbient.color.copy(ambient.color);
    sideRoomAmbient.groundColor.set(isNight ? '#363453' : '#665b4f');
    sideRoomAmbient.intensity = ambient.intensity * (isNight ? 1 : 0.82);
    if (!isNight) sideRoomAmbient.color.lerp(patioSkyFill, 0.3);
    patio.stations.setFeedback(stationFeedback, reducedSceneMotion.matches);
    patio.update(windowLight, weather.snow01, weather.rain01, isNight, elapsed*(reducedSceneMotion.matches?0.2:1), weather.wet01, reducedSceneMotion.matches,
      (viewCamera instanceof THREE.OrthographicCamera ? (viewCamera.right-viewCamera.left)/viewCamera.zoom : 2*Math.tan(THREE.MathUtils.degToRad(viewCamera.fov/2))*5*viewCamera.aspect));
    patioSun.position.copy(sun.position).x += 16; patioSun.scale.copy(sun.scale);
  }
  lightInteractions.update(dt, reducedSceneMotion.matches);
  if (floorSection) {
    // Each floor keeps its own viewing angle while they slide past each other.
    const lowerBackground=garage.scene.background;
    garage.scene.background=garage.travelBackground;
    renderer.render(garage.scene,garage.lowerFloorCamera);
    garage.scene.background=lowerBackground;
    renderer.autoClear=false;
    renderer.clearDepth();
    const upperBackground=scene.background;scene.background=null;
    renderer.render(scene,viewCamera);
    scene.background=upperBackground;
  }
  else if (showGarage) renderer.render(garage.scene,viewCamera);
  else if (showFactory) renderer.render(scene, viewCamera);
  if (showPatio) {
    // Show both rooms only while traveling through the door. The small camera
    // margin must never expose the neighboring room in a settled view.
    renderer.autoClear = !showFactory;
    sideRoomScene.background = showFactory ? null : sideRoomBackground;
    renderer.render(sideRoomScene, viewCamera);
  }
  renderer.autoClear = true;
  ambientBackdrop.update(now);
}

const whatsNew = createWhatsNew(() => roomNavigation.request('patio'));
const stopSceneLoop = startSceneLoop(animate);

if (import.meta.hot) import.meta.hot.dispose(() => { stopSceneLoop(); newspaper.dispose(); sharedPickups?.dispose(); sharedProps?.dispose(); windowReflections.dispose(); whatsNew.dispose(); duckHunt.dispose(); sceneEvents.abort(); titleDisposed = true; ambientBackdrop.dispose(); loungeRadio.dispose(); roomStaff.dispose(); stationTickets.dispose(); mountainView.dispose(); garageDriving.dispose();brandLibrary.dispose();brandFlag.dispose();mistFlag.dispose();thunderstorm.dispose();lightInteractions.dispose();snackCarry.dispose();vendingMachine.dispose();garage.dispose(); windowWeather.dispose(); stopTitle(); patio.dispose(); sceneAudio.dispose(); stopWeather(); visitorBasketball.dispose(); basketballChallenges.dispose(); factoryControls.dispose(); avatarStage.dispose(); activityFeedback.dispose(); liveAgents.dispose(); loungeDetails.dispose(); teamDesk.dispose(); weatherStatus.remove(); weatherBadge.remove(); renderer.dispose(); });
