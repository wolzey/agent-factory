import * as THREE from 'three';
import { PATIO, patioFloorHeight } from '@shared/factory25d-patio';
import { propPart, standard } from './factory25dProps';
import { contactShadow } from './factory25dContactShadows';
import { createPatioGarden } from './factory25dPatioGarden';

/** The patio's furnishings live here so the garage can be integrated independently. */
export function createPatioTerraces(room: THREE.Group, timber: THREE.MeshStandardMaterial) {
  const iron = standard('#344742', 1), wood = standard('#806d50', 1), wall = standard('#818579', 1);
  const cushion = standard('#d5d3ba', 1), teal = standard('#486965', 1);
  const glow = new THREE.MeshBasicMaterial({ color: '#ffcf89' });
  const warmLights: THREE.PointLight[] = [];
  const garden = createPatioGarden(room);
  function deck(left: number, right: number, back: number, front: number, y: number) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(right - left, front - back), timber);
    const uv = floor.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (left + uv.getX(i) * (right - left)) / 3.28, (front - uv.getY(i) * (front - back)) / .49);
    uv.needsUpdate = true;
    floor.rotation.x = -Math.PI / 2; floor.position.set((left + right) / 2, y, (back + front) / 2);
    floor.receiveShadow = true; room.add(floor);
  }
  deck(PATIO.left, PATIO.right, PATIO.back, PATIO.front, PATIO.lowerY);
  deck(PATIO.left, PATIO.right, PATIO.back, PATIO.edgeZ, PATIO.upperY);
  for (const [left, right] of [[PATIO.left, PATIO.stairs.left], [PATIO.stairs.right, PATIO.right]]) {
    propPart(room, [right - left, 1.12, .18], [(left + right) / 2, -.56, PATIO.edgeZ], wall);
    propPart(room, [right - left, .075, .25], [(left + right) / 2, -.025, PATIO.edgeZ + .035], wood);
  }
  const stairs = PATIO.stairs, rise = -PATIO.lowerY / stairs.steps, tread = (stairs.bottom - stairs.top) / stairs.steps;
  for (let i = 0; i < stairs.steps; i++) {
    const y = -(i + 1) * rise, z = stairs.top + (i + .5) * tread;
    propPart(room, [stairs.right - stairs.left, y - PATIO.lowerY + rise, tread], [(stairs.left + stairs.right) / 2, (y + PATIO.lowerY - rise) / 2, z], timber);
    propPart(room, [stairs.right - stairs.left, .032, .046], [(stairs.left + stairs.right) / 2, y + .014, z + tread / 2 - .025], timber);
    propPart(room, [stairs.right - stairs.left, rise, .025], [(stairs.left + stairs.right) / 2, y + rise / 2, z - tread / 2], timber);
    for (const x of [stairs.left + .16, stairs.right - .16]) {
      propPart(room, [.10, .045, .008], [x, y + rise / 2, z - tread / 2 + .018], glow);
    }
  }
  for (const x of [17.21, 19.99]) propPart(room, [.27, 1.42, 2.4], [x, -.41, 1.45], wall);

  function lantern(x: number, z: number, y: number, pooled = false) {
    propPart(room, [.18, .28, .18], [x, y + .14, z], iron);
    propPart(room, [.116, .18, .116], [x, y + .145, z], glow);
    propPart(room, [.23, .044, .23], [x, y + .295, z], iron);
    if (pooled) {
      const light = new THREE.PointLight('#ffd197', 1, 4, 2); light.position.set(x, y + .38, z); room.add(light); warmLights.push(light);
    }
  }
  function railing(left: number, right: number, z: number, y: number, height = .72) {
    for (let x = left; x <= right + .01; x += (right - left) / Math.ceil((right - left) / 2.6)) propPart(room, [.065, height, .065], [x, y + height / 2, z], iron);
    for (const h of [.25, .48, height]) propPart(room, [right - left, h === height ? .055 : .022, .055], [(left + right) / 2, y + h, z], iron);
  }
  railing(8.4, 23.6, -4.15, 0);
  railing(8.4, 23.6, 12.25, PATIO.lowerY, .55);

  // An airy slatted canopy shades the two existing upper workstations.
  for (const x of [9.7, 17.0]) for (const z of [-3.88, -.54]) {
    propPart(room, [.20, 2.8, .20], [x, 1.4, z], wood);
    propPart(room, [.24, .16, .24], [x, .08, z], iron);
  }
  for (const z of [-4.02, -.42]) propPart(room, [7.8, .18, .17], [13.35, 2.78, z], iron);
  for (const x of [9.56, 17.14]) propPart(room, [.18, .18, 3.94], [x, 2.8, -2.22], iron);
  for (let z = -3.92; z <= -.40; z += .72) propPart(room, [7.8, .09, .10], [13.35, 2.89, z], wood);
  for (const x of [11, 16]) {
    propPart(room, [.016, 1.04, .016], [x, 2.17, -.85], iron);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(.19, .16, 8, 1, true), iron);
    shade.position.set(x, 1.65, -.85); room.add(shade);
    propPart(room, [.20, .025, .20], [x, 1.58, -.85], glow);
    const light = new THREE.PointLight('#ffd5a1', 1, 4, 2); light.position.set(x, 1.50, -.85); room.add(light); warmLights.push(light);
  }
  // A mountain-facing bench sits behind the third desk, clear of the entry route.
  propPart(room, [4.55, .38, .8], [19.775, .19, -3.55], wood);
  propPart(room, [4.48, .12, .75], [19.775, .44, -3.55], cushion);
  propPart(room, [4.55, .48, .12], [19.775, .62, -3.92], wood);
  for (const x of [18.0, 19.12, 20.24, 21.36]) {
    const pillow = propPart(room, [.62, .40, .18], [x, .7, -3.73], x === 19.12 ? cushion : teal); pillow.rotation.x = -.14;
  }
  contactShadow(room, { x: 19.775, z: -3.55, width: 4.55, depth: .8, spread: .13, opacity: .3 });

  // Lower lounge: the open walking lane stays between the worktable and sofa.
  const low = PATIO.lowerY;
  const lounge = new THREE.Group(); lounge.position.z = -1.4; room.add(lounge);
  const rug = standard('#536565', 1);
  propPart(lounge, [5.9, .017, 3.5], [11.38, low + .012, 9.16], rug);
  for (const [w, d] of [[5.65, 3.25], [5.34, 2.94]]) {
    for (const z of [9.16 - d / 2, 9.16 + d / 2]) propPart(lounge, [w, .005, .035], [11.38, low + .024, z], cushion);
    for (const x of [11.38 - w / 2, 11.38 + w / 2]) propPart(lounge, [.035, .005, d], [x, low + .024, 9.16], cushion);
  }
  propPart(lounge, [5.45, .30, .9], [11.175, low + .22, 8.25], iron);
  propPart(lounge, [5.45, .62, .15], [11.175, low + .55, 7.875], wood);
  propPart(lounge, [.9, .30, 2.7], [8.9, low + .22, 9.15], iron);
  propPart(lounge, [.15, .62, 2.7], [8.525, low + .55, 9.15], wood);
  for (let x = 8.96; x < 13.8; x += .89) {
    propPart(lounge, [.85, .15, .70], [x, low + .44, 8.30], cushion);
    const back = propPart(lounge, [.85, .40, .15], [x, low + .68, 8.04], cushion); back.rotation.x = .13;
  }
  for (const z of [8.2, 9.08]) propPart(lounge, [.70, .15, .82], [8.95, low + .44, z], cushion);
  for (const x of [9.8, 13.2]) propPart(lounge, [.47, .34, .2], [x, low + .67, 8.25], teal);
  propPart(lounge, [1.4, .45, 1.05], [11.5, low + .235, 9.725], wood);
  propPart(lounge, [1.47, .08, 1.12], [11.5, low + .49, 9.725], iron);
  // A recessed ember bed gives the lounge a quiet focal point, with no audio loop.
  propPart(lounge, [.88, .028, .54], [11.5, low + .54, 9.725], standard('#342d28', 1));
  const flames: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.05, .20 + (i % 3) * .045, 4), new THREE.MeshBasicMaterial({ color: i % 2 ? '#ffd488' : '#d98b48' }));
    flame.position.set(11.18 + i * .09, low + .64, 9.725 + Math.sin(i * 2) * .14); lounge.add(flame); flames.push(flame);
  }
  const fire = new THREE.PointLight('#efae65', .8, 3.8, 2); fire.position.set(11.5, low + 1, 9.7); lounge.add(fire); warmLights.push(fire);

  garden.tree(8.85, -3.35, 0, .9); garden.tree(23.15, -3.35, 0, 1.12, 'pine');
  garden.tree(8.82, 2.475, low, .95); garden.tree(23.15, 2.475, low, 1.05, 'pine');
  garden.tree(21.475, 8.925, low, 1.16);
  // Leave clear views of the three upper avatars between planted sections.
  railing(8.4, 17.3, .23, 0, .50);
  railing(19.9, 23.8, .23, 0, .50);
  garden.border(9.45, .15, 0, 1.6, .48, true);
  garden.border(13.65, .15, 0, 2.9, .48, true);
  garden.border(22.65, .15, 0, 2.75, .48, true);
  garden.border(23.57, 7.5, low, .78, 6.1);
  garden.border(11.6, 11.9, low, 4.7, .7, true);
  garden.border(18.1, 11.9, low, 3.8, .7, true);
  garden.border(17.21, 1.46, .3, .27, 2.35, true);
  garden.border(19.99, 1.46, .3, .27, 2.35, true);
  // Vines drape from the canopy without filling the mountain view with a wall.
  garden.border(17.03, -2.17, 2.89, .25, 3.15, true);
  garden.finish();
  for (const [x, z, y] of [[17.21, 2.36, .3], [19.99, 2.36, .3], [9.65, .18, .54], [22.9, .18, .54], [8.4, 11.6, low], [15.4, 11.6, low], [22.7, 11.6, low]]) lantern(x, z, y, x === 17.21 || x === 22.7);
  return { update(snow: number, rain: number, night: boolean, time: number, reducedMotion = false) {
    garden.update(snow, rain, time, reducedMotion);
    for (const light of warmLights) light.intensity = night ? 2.8 : 1.25;
    flames.forEach((flame, i) => { flame.scale.y = 1 + Math.sin(time * 3.5 + i * 2) * .12; flame.visible = rain < .65 && snow < .5; });
    fire.intensity = (rain < .65 && snow < .5) ? (night ? 1.2 : .4) : 0;
  }, floorHeight: patioFloorHeight };
}
