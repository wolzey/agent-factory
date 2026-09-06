/// <reference types="vite/client" />
import { createTeamDesk } from './factory25dTeamDesk';
import { createNatureTv } from './factory25dNatureTv';
import * as THREE from 'three';
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
import { createDisplayStudy } from './factory25dDisplay';
import { createSideRoom, createSideRoomNavigation, createDoorFrame, SIDE_DOOR } from './factory25dSideRoom';
import { INDOOR_COLUMNS, INDOOR_ROWS } from './factory25dWorkstations';
import { createBasketball } from './factory25dBasketball';
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
const liveWeatherOption = document.createElement('option'); liveWeatherOption.value = 'live'; liveWeatherOption.textContent = 'Live · Salt Lake City'; weatherSelect.append(liveWeatherOption);
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

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
renderer.setPixelRatio(1);
renderer.setSize(800, 564, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
const displayStudy = createDisplayStudy(renderer);
RectAreaLightUniformsLib.init();

const camera = new THREE.OrthographicCamera(-8, 8, 5.64, -5.64, 0.1, 50);
camera.position.set(0, 9, 14.6);
camera.lookAt(0, 0.35, 0.45);

// A deeper occupied floor gives the window a clear walking strip. Translating
// the furniture together preserves cabinet/agent scale and the lounge layout.
const interior = new THREE.Group();
interior.position.z = 1.95;
scene.add(interior);

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
  return mesh;
}

function floorTexture(): THREE.CanvasTexture {
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 32;
  floorCanvas.height = 32;
  const context = floorCanvas.getContext('2d');
  if (context) {
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        context.fillStyle = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0 ? '#0a0a1a' : '#0c0c20';
        context.fillRect(x, y, 1, 1);
      }
    }
    context.fillStyle = 'rgba(17, 17, 51, 0.4)';
    context.fillRect(0, 0, 32, 1);
    context.fillRect(0, 0, 1, 32);
  }
  const texture = new THREE.CanvasTexture(floorCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(14, 9);
  return texture;
}

const mainFloorMaterial = new THREE.MeshStandardMaterial({
  map: floorTexture(),
  color: '#a8afca',
  emissive: '#0d1028',
  emissiveIntensity: 1.55,
  roughness: 0.98,
  metalness: 0.02,
});
const mainFloor = new THREE.Mesh(new THREE.PlaneGeometry(16.4, 18.5), mainFloorMaterial);
mainFloor.rotation.x = -Math.PI / 2;
mainFloor.position.z = 4.65;
mainFloor.receiveShadow = true;
scene.add(mainFloor);

function floorZone(width: number, depth: number, x: number, z: number, color: string): THREE.Mesh {
  const zone = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({
      color,
      emissive: new THREE.Color(color).multiplyScalar(0.45),
      emissiveIntensity: 1.25,
      roughness: 1,
      metalness: 0,
    }),
  );
  zone.rotation.x = -Math.PI / 2;
  zone.position.set(x, 0.018, z);
  zone.receiveShadow = true;
  interior.add(zone);
  return zone;
}

floorZone(7.8, 8, -4.08, 7.6, '#1a1408');
floorZone(8.2, 8, 3.92, 7.6, '#1a0a2e');

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
const sideRoom = createSideRoomNavigation(canvas, camera);
const duckHunt = createDuckHunt(sideRoomScene, canvas);

// Outer passages enter beside the rooms, away from the central couch corner.
for (const [left, right] of [[-7.88, -7.6], [-6.2, 5.8], [7.2, 7.88]]) {
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
scene.add(sun);

const mountainView = createMountainView(renderer, glassHeight);
displayStudy.connectLandscape(mountainView.setLandscape);
const mountainWindow = new THREE.Mesh(
  new THREE.PlaneGeometry(15.84, glassHeight),
  new THREE.MeshBasicMaterial({ map: mountainView.texture, transparent: true, alphaTest: 0.02 }),
);
mountainWindow.position.set(0, glassCenterY, -4.55);
scene.add(mountainWindow);
const windowWeather = createWindowWeather(scene, renderer, 15.84, glassHeight, glassCenterY);
for (const source of [backdrop, sun, mountainWindow]) {
  const copy = source.clone(); copy.position.x += 16; sideRoomScene.add(copy);
  if (source === sun) copy.name = 'patio-sun';
}
windowWeather.mirrorOutside(sideRoomScene, 16);

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
  onChange: open => mountainView.setDetail(open),
});
const hangingPothos = createHangingPothos(scene, glassTop + 0.35);
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

const factorySign = textPlane('FLUID', 2.8, 0.3, '#ff52de', '#080b1a');
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
  texture.minFilter = THREE.NearestFilter;
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
function workstation(x: number, z: number, active: boolean): void {
  const cabinet = new THREE.Group();
  propPart(cabinet, [0.88, 0.13, 0.56], [0, 0.12, 0.015], cabinetFoot);
  propPart(cabinet, [0.84, 0.37, 0.48], [0, 0.35, 0.02], cabinetBody);
  propPart(cabinet, [0.86, 0.55, 0.4], [0, 0.84, -0.055], cabinetBody);
  for (const side of [-1, 1]) {
    propPart(cabinet, [0.09, 0.93, 0.5], [side * 0.46, 0.65, -0.015], cabinetSide);
    propPart(cabinet, [0.12, 0.08, 0.14], [side * 0.33, 0.04, 0.18], cabinetFoot);
  }
  propPart(cabinet, [0.84, 0.47, 0.08], [0, 0.85, 0.175], cabinetBezel);
  const screenMaterial = screenMaterials[Number(active)].clone();
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.34), screenMaterial);
  screen.position.set(0, 0.86, 0.221);
  cabinet.add(screen);
  propPart(cabinet, [1.02, 0.095, 0.54], [0, 1.145, -0.015], cabinetSide);
  const marqueeMaterial = (active ? activeMarquee : idleMarquee).clone();
  propPart(cabinet, [0.86, 0.065, 0.035], [0, 1.145, 0.274], marqueeMaterial);
  propPart(cabinet, [0.86, 0.018, 0.15], [0, 1.202, 0.18], marqueeMaterial);
  const deck = propPart(cabinet, [0.98, 0.09, 0.33], [0, 0.565, 0.24], cabinetDeck);
  deck.rotation.x = 0.12;
  propPart(cabinet, [0.045, 0.095, 0.045], [-0.22, 0.65, 0.26], cabinetBezel);
  propPart(cabinet, [0.08, 0.05, 0.07], [-0.22, 0.715, 0.26], standard('#be3f71', 0.8));
  propPart(cabinet, [0.07, 0.03, 0.075], [0.1, 0.628, 0.29], standard('#56a889', 0.8));
  propPart(cabinet, [0.07, 0.03, 0.075], [0.25, 0.628, 0.29], standard('#ac8c52', 0.8));
  propPart(cabinet, [0.08, 0.025, 0.012], [0, 0.37, 0.267], cabinetFoot);
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
      marqueeMaterial.color.set(on || error ? color : '#592563');
      marqueeMaterial.emissive.set(on || error ? color : '#160720');
      marqueeMaterial.emissiveIntensity = on ? 0.35 + pulse * 0.15 : error * 0.4;
      glow.color.set(color); glow.intensity = on ? 1.1 + heat * 0.2 + pulse * 0.2 : error * 0.4;
    } });
  }
}

for (const x of machinePositions) workstation(x, INDOOR_ROWS[0], false);
for (const x of machinePositions) workstation(x, INDOOR_ROWS[1], false);

const liveAgents = createLiveAgents(scene, sideRoomScene, canvas);
const activityFeedback = createActivityFeedback(canvas.parentElement!);

// Small, uneven groups sit on the room floor, with a walking strip behind the desks.
const indoorPlants = createIndoorPlants(interior);
const plant = indoorPlants.plant;
plant('broad', -5.83, -5.72, 1.12, 0);
plant('rubber', -4.85, -5.77, 0.92, 0.8);
plant('fern', -4.1, -5.38, 0.78, 1.6);
plant('cactus', -3.3, -5.74, 0.72, 0);
plant('trailing', 4.38, -5.2, 0.79, 2.4);
const movablePlant = plant('calathea', 5.85, -5.25, 0.85, 3.2);
plant('bird', 7.05, -5.98, 1.02, 4);
plant('succulent', 6.68, -5.05, 0.64, 1);
plant('palm', -5.8, 4.12, 0.92, 1.1);
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

// Preserve the shorter counter and leave the outer doorway clear on its left.
const counterWidth = 7.05 * 0.75;
const counterTopWidth = 6.95 * 0.75;
const counterCenter = -4.05 - (7.05 - counterWidth) / 2 + 1.55;
const counterTopCenter = -4.05 - (6.95 - counterTopWidth) / 2 + 1.55;
// A recessed toe-kick and continuous cabinet body visibly meet the floor.
interior.add(box([counterWidth - 0.14, 0.055, 0.29], [counterCenter, 0.0275, 4.7], standard('#4b3b1c')));
interior.add(box([counterWidth - 0.08, 0.31, 0.31], [counterCenter, 0.205, 4.7], standard('#70551c')));
interior.add(box([counterWidth, 0.16, 0.34], [counterCenter, 0.36, 4.7], standard('#8b6914')));
interior.add(box([counterTopWidth, 0.1, 0.42], [counterTopCenter, 0.48, 4.66], standard('#c4991a')));
contactShadow(interior, { x: counterCenter, z: 4.7, floorY: 0.018,
  width: counterWidth - 0.14, depth: 0.29, spread: 0.18, opacity: 0.32 });
// The counter label belongs on its cabinet face, leaving the tabletop screen clear.
const counterLabel = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.16), new THREE.MeshStandardMaterial({
  map: signTexture('FRONT COUNTER', '#d2c8a1', '#4d401e', 2, 1.65 / 0.16), roughness: 1,
}));
counterLabel.position.set(counterCenter, 0.23, 4.878);
interior.add(counterLabel);
const teamDesk = createTeamDesk(interior, canvas, camera, renderer, () => factoryControls.state.stop());

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
indoorPlants.shelf(-7.12, -5.93);
const natureTv = createNatureTv(interior);
const loungeDetails = createLoungeDetails(interior, canvas, camera, renderer);

let currentViewCamera: THREE.Camera = camera;
const factoryControls = createFactoryControls(canvas, liveAgents, () => currentViewCamera,
  () => whiteboardInteraction.isRoomView() && !windowInteraction.isOpen() && !loungeDetails.chat.isActive() && !teamDesk.isActive() && !document.body.classList.contains('inspect-open'),
  outside => sideRoom.visit(outside));
loungeDetails.chat.configureCommands({
  getTargetSessionId: () => factoryControls.getTargetSessionId(),
  logout: () => factoryControls.logout(),
  requestRoom() {
    if (!whiteboardInteraction.isRoomView() || windowInteraction.isOpen() || teamDesk.isActive() || document.body.classList.contains('inspect-open')) return false;
    factoryControls.state.stop(); sideRoom.visit(false); return true;
  },
});
const floorKeyboard = createFloorKeyboard(interior, canvas, camera, () => factoryControls.guideMovement());
const basketball = createBasketball(interior, canvas, [], {
  tap: () => sceneAudio.ballTap(), swish: () => sceneAudio.ballSwish(), bounce: energy => sceneAudio.ballBounce(energy),
});
let basketballRoster = '';
let basketballPlayers: { id: string; name: string; position: THREE.Vector3; home: FloorPoint }[] = [];

const ambient = new THREE.HemisphereLight('#9bb6df', '#363453', 4.1);
scene.add(ambient);
// The enclosed adjoining room shares the environment's ambient illumination.
// Rendering it separately keeps the main window's direct sunlight in its own room.
const sideRoomAmbient = ambient.clone();
sideRoomScene.add(sideRoomAmbient);

// A real window-sized source supplies the broad room wash. It intentionally
// does not cast shadows; the directional light below only provides object form.
const windowWashLight = new THREE.RectAreaLight('#c2dcff', 8, 15.2, glassHeight - 0.1);
windowWashLight.position.set(0, glassCenterY, -4.05);
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
windowLight.target.position.set(0, 0, 1.6 + interior.position.z);
scene.add(windowLight, windowLight.target);

const magentaBounce = new THREE.PointLight('#ff2bdd', 0.9, 7.5, 2);
magentaBounce.position.set(6.2, 1.1, 3.5 + interior.position.z);
scene.add(magentaBounce);

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
  windowLight.color.set('#e6efff').lerp(new THREE.Color(evening ? '#ffc58d' : '#ffdfb4'), horizon);
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

timeSelect.addEventListener('change', () => {
  liveTime = timeSelect.value === 'live';
  isNight = liveTime ? liveSunAt(skyClock()).night : timeSelect.value === 'night';
  const search = new URLSearchParams(location.search);
  if (liveTime) { search.delete('skyTime'); search.delete('skySpeed'); } else search.set('skyTime', isNight ? 'night' : 'day');
  history.replaceState(null, '', `${location.pathname}?${search}${location.hash}`);
  setLightX(sunArc);
});

lightSlider.addEventListener('input', () => { liveTime = false; timeSelect.value = isNight ? 'night' : 'day'; setLightX(Number(lightSlider.value)); });
moonSelect.addEventListener('change', () => {
  const search = new URLSearchParams(location.search);
  search.set('moonPhase', moonSelect.value);
  moonPhase = moonPhaseFromSearch(search.toString());
  if (moonPhase === 'full') search.delete('moonPhase');
  history.replaceState(null, '', `${location.pathname}?${search}${location.hash}`);
  setLightX(sunArc);
});
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
});
canvas.addEventListener('pointerdown', (event) => {
  if (windowInteraction.isOpen() || !whiteboardInteraction.isRoomView() || event.button !== 0 || !requireElement<HTMLDetailsElement>('.scene-settings').open) return;
  dragging = true;
  canvas.setPointerCapture(event.pointerId);
  const rect = canvas.getBoundingClientRect();
  setLightX(THREE.MathUtils.lerp(-7, 7, (event.clientX - rect.left) / rect.width));
});
canvas.addEventListener('pointermove', (event) => {
  if (!dragging || !whiteboardInteraction.isRoomView()) return;
  const rect = canvas.getBoundingClientRect();
  setLightX(THREE.MathUtils.lerp(-7, 7, (event.clientX - rect.left) / rect.width));
});
canvas.addEventListener('pointerup', (event) => {
  dragging = false;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
});
canvas.addEventListener('pointercancel', () => { dragging = false; });

setLightX(Number(lightSlider.value));
magentaBounce.intensity = 0.58;

const weatherStatus = document.createElement('p'); weatherStatus.className = 'live-weather-status';
weatherSelect.parentElement!.append(weatherStatus);
const stopWeather = watchLiveWeather(next => {
  latestLiveWeather = next;
  if (liveWeather) { weatherTransition.select(next, performance.now()); weatherSettled = false; }
}, message => { weatherStatus.textContent = message; });
let lastSunUpdate = -Infinity;
const startedAt = performance.now();
let previousElapsed = 0;
const studyFocusPoint = new THREE.Vector3();

function animate(): void {
  const elapsed = (performance.now() - startedAt) / 1000;
  const dt = Math.min(elapsed - previousElapsed, 0.1);
  previousElapsed = elapsed;
  const now = performance.now();
  wallClock.update(now);
  if (liveTime && now - lastSunUpdate >= 1000) { const sun = liveSunAt(skyClock()); isNight = sun.night; setLightX(sun.arc); lastSunUpdate = now; }
  whiteboardInteraction.update(now);
  sideRoom.update(now, whiteboardInteraction.isRoomView() && !windowInteraction.isOpen() && !loungeDetails.chat.isActive() && !teamDesk.isActive());
  const mainRoomVisible = whiteboardInteraction.isRoomView() && !windowInteraction.isOpen() && !sideRoom.isActive() && !loungeDetails.chat.isActive() && !teamDesk.isActive();
  windowInteraction.update(now, whiteboardInteraction.isRoomView() && !sideRoom.isActive() && !loungeDetails.chat.isActive() && !teamDesk.isActive());
  teamDesk.update(now, mainRoomVisible);
  natureTv.update(elapsed, reducedSceneMotion.matches, mainRoomVisible);
  hangingPothos.update(elapsed, reducedSceneMotion.matches);
  if (!weatherSettled && now - lastWeatherUpdate >= 50) {
    weather = weatherTransition.at(now);
    weatherSettled = !weatherTransition.isChanging(now);
    lastWeatherUpdate = now;
    setLightX(sunArc);
  }
  sceneAudio.update({ weather, patio01: sideRoom.outdoorProgress(), window01: windowInteraction.proximity(), night: isNight,
    reading: !whiteboardInteraction.isRoomView() || loungeDetails.chat.isActive() || teamDesk.isActive() });
  windowWeather.update(dt, weather, currentPalette, sunArc, isNight, whiteboardInteraction.isRoomView());
  activeScreenTexture.offset.x = (Math.floor(elapsed * 4) % 4) * 0.25;
  const factoryData = whiteboardInteraction.getData();
  liveAgents.sync(factoryData.world); factoryControls.sync(factoryData);
  activityFeedback.sync(factoryData.world, liveAgents.entries.values());
  const eligible = [...liveAgents.entries.values()].filter(entry => entry.session.activity === 'idle' && !entry.session.manualControl
    && !liveAgents.isPerforming(entry.session.sessionId) && entry.mesh.position.x < 8).slice(0, 2);
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
    player.home = {x: player.position.x, z: player.position.z};
  }
  basketball.update(dt, camera, mainRoomVisible, !factoryControls.state.active, reducedSceneMotion.matches);
  const stationFeedback = activityFeedback.stationStates();
  for (const [id, station] of stationVisuals) station.setFeedback(stationFeedback.get(id));
  patio.stations.setFeedback(stationFeedback, reducedSceneMotion.matches);
  const feet = [...liveAgents.entries.values()].filter(entry => entry.mesh.position.x < 8).map(entry => ({ x: entry.mesh.position.x, z: entry.mesh.position.z - 1.95 }));
  floorKeyboard.update(dt, feet, mainRoomVisible);
  indoorPlants.update(elapsed, reducedSceneMotion.matches);
  loungeDetails.update(elapsed, reducedSceneMotion.matches, whiteboardInteraction.getData(), camera, mainRoomVisible);
  mountainView.setDepthOfField(displayStudy.depthOfField);
  mountainView.render(elapsed, whiteboardInteraction.isRoomView());
  const baseCamera = teamDesk.isActive() ? teamDesk.camera : loungeDetails.chat.isActive() ? loungeDetails.chat.camera : windowInteraction.isOpen() ? windowInteraction.camera : sideRoom.isActive() ? sideRoom.camera : camera;
  const viewCamera = pointerZoom.cameraFor(baseCamera, now);
  viewCamera.updateMatrixWorld(); currentViewCamera = viewCamera;
  liveAgents.update(elapsed, viewCamera, mainRoomVisible, sideRoom.isActive(), point => floorKeyboard.floorHeight(point), whiteboard);
  if (basketball.active) {
    const player = basketballPlayers[basketball.player], entry = player && liveAgents.entries.get(player.id);
    if (entry) liveAgents.placeOverride(player.id, { x: player.position.x, z: player.position.z + 1.95 }, basketball.jump);
  }
  factoryControls.update();
  activityFeedback.update();
  duckHunt.update(dt, viewCamera, sideRoom.isActive() && !sideRoom.showsFactory());
  // Keep a square sky image in both the tilted room view and the straight-on window view.
  // Its plane stays behind mountains/clouds instead of rotating through those layers.
  sun.scale.y = 1 / Math.max(0.5, Math.abs(viewCamera.matrixWorldInverse.elements[5]));
  sideRoomAmbient.color.copy(ambient.color);
  sideRoomAmbient.groundColor.copy(ambient.groundColor);
  sideRoomAmbient.intensity = ambient.intensity;
  patio.update(windowLight, weather.snow01, weather.rain01, isNight, elapsed*(reducedSceneMotion.matches?0.2:1), weather.wet01, reducedSceneMotion.matches);
  const patioSun = sideRoomScene.getObjectByName('patio-sun')!;
  patioSun.position.copy(sun.position).x += 16; patioSun.scale.copy(sun.scale);
  const showFactory = sideRoom.showsFactory();
  const boardCloseUp = !whiteboardInteraction.isRoomView() || loungeDetails.chat.isActive() || teamDesk.isActive();
  if (teamDesk.isActive()) studyFocusPoint.copy(teamDesk.focusPoint());
  else if (loungeDetails.chat.isActive()) studyFocusPoint.copy(loungeDetails.chat.focusPoint());
  else if (boardCloseUp) whiteboard.localToWorld(studyFocusPoint.set(0, 1.0, 0));
  else if (sideRoom.isActive()) studyFocusPoint.set(16, 0.7, 0);
  else studyFocusPoint.set(0, 0.5, 0);
  studyFocusPoint.copy(pointerZoom.focusPoint(sideRoom.isActive() ? sideRoomScene : scene, studyFocusPoint));
  displayStudy.begin(viewCamera, studyFocusPoint, boardCloseUp, windowInteraction.isOpen());
  if (showFactory) renderer.render(scene, viewCamera);
  if (sideRoom.isActive()) {
    // Show both rooms only while traveling through the door. The small camera
    // margin must never expose the neighboring room in a settled view.
    renderer.autoClear = !showFactory;
    sideRoomScene.background = showFactory ? null : sideRoomBackground;
    renderer.render(sideRoomScene, viewCamera);
  }
  renderer.autoClear = true;
  displayStudy.finish();
  requestAnimationFrame(animate);
}

animate();

if (import.meta.hot) import.meta.hot.dispose(() => { titleDisposed = true; stopTitle(); patio.dispose(); sceneAudio.dispose(); stopWeather(); factoryControls.dispose(); activityFeedback.dispose(); liveAgents.dispose(); loungeDetails.chat.dispose(); teamDesk.dispose(); });
