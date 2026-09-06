import * as THREE from 'three';
import { propPart, standard } from './factory25dProps';
import { contactShadow } from './factory25dContactShadows';
import { createPothosFoliage, positionPothosLeaf, pothosSway, pothosVineGeometry } from './factory25dPothosFoliage';

// A folded leaf catches light on both sides of its midrib. The silhouette,
// rather than a solid canopy volume, carries the species at inspection distance.
function foldedLeaf(outline: number[][], centerY: number) {
  const positions: number[] = [], colors: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    positions.push(0, centerY, .055, a[0], a[1], 0, b[0], b[1], 0);
    const shade = a[0] < 0 ? .86 : 1;
    colors.push(1, 1, .91, shade, shade, shade, shade, shade, shade);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function pineSpray() {
  const positions: number[] = [];
  // Paired needles radiate from a short branch; several sprays form each bough.
  for (let plane = 0; plane < 3; plane++) for (let i = 0; i < 9; i++) for (const side of [-1, 1]) {
    const y = i * .065, width = .20 * (1 - i * .035);
    const angle = plane * Math.PI / 3;
    for (const [x, py, z] of [[0,y,0], [side*width,y+.23,(i%3-1)*.075], [side*.085,y+.095,.024]]) {
      positions.push(x*Math.cos(angle)+z*Math.sin(angle), py, z*Math.cos(angle)-x*Math.sin(angle));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Instanced leaves, needles and stems leave air between the planted silhouettes. */
export function createPatioGarden(parent: THREE.Group) {
  const pothos = createPothosFoliage();
  const trails: THREE.Group[] = [];
  const concrete = standard('#85897d', 1), lip = standard('#a0a294', 1), soil = standard('#343a2d', 1);
  const bark = standard('#71654e', 1), vineMaterial = standard('#526245', 1);
  const leafMaterial = standard('#ffffff', .83);
  leafMaterial.side = THREE.DoubleSide; leafMaterial.vertexColors = true;
  const needleMaterial = standard('#ffffff', .9); needleMaterial.side = THREE.DoubleSide;
  const snowMaterial = standard('#e2e7df', 1);
  snowMaterial.side = THREE.DoubleSide; snowMaterial.transparent = true; snowMaterial.depthWrite = false;
  const mapleGeometry = foldedLeaf([
    [0, 0], [-.15, .19], [-.53, .22], [-.31, .39], [-.63, .62], [-.30, .57],
    [-.36, .94], [-.12, .72], [0, 1.19], [.12, .72], [.36, .94], [.30, .57],
    [.63, .62], [.31, .39], [.53, .22], [.15, .19],
  ], .43);
  function instances(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number, name: string) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.count = 0; mesh.name = name; mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
  const maples = instances(mapleGeometry, leafMaterial, 2000, 'Japanese maple leaves');
  const groundLeaves = instances(pothos.leafGeometry, pothos.instanceMaterial, 4500, 'Planter pothos leaves');
  const groundVeins = instances(pothos.veinGeometry, pothos.veinMaterial, 4500, 'Planter pothos veins');
  const needles = instances(pineSpray(), needleMaterial, 1800, 'Dwarf mountain pine needles');
  const stemGeometry = new THREE.CylinderGeometry(.58, 1, 1, 5);
  const branches = instances(stemGeometry, bark, 2400, 'Visible tree branches');
  const vines = instances(stemGeometry, vineMaterial, 5000, 'Planter stems');
  const mapleSnow = instances(mapleGeometry, snowMaterial, 900, 'Snow on maple leaves');
  const pineSnow = instances(needles.geometry, snowMaterial, 700, 'Snow on pine boughs');
  const planterSnow = instances(pothos.leafGeometry, snowMaterial, 1200, 'Snow on planter leaves');
  const meshes = [maples, groundLeaves, groundVeins, needles, branches, vines, mapleSnow, pineSnow, planterSnow];
  const snowMeshes = [mapleSnow, pineSnow, planterSnow];
  snowMeshes.forEach(mesh => { mesh.castShadow = false; });
  const mapleColors = ['#4d733d', '#658147', '#7e9251', '#3d6240'].map(c => new THREE.Color(c));
  const pothosColors = pothos.leafMaterials.map(material => material.color);
  const pineColors = ['#314f43', '#476754', '#59765a'].map(c => new THREE.Color(c));
  const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);
  const veinMatrix = new THREE.Matrix4();
  let seed = 73;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  function place(mesh: THREE.InstancedMesh, color?: THREE.Color) {
    dummy.updateMatrix(); mesh.setMatrixAt(mesh.count, dummy.matrix);
    if (color) mesh.setColorAt(mesh.count, color);
    mesh.count++;
  }
  function leaf(mesh: THREE.InstancedMesh, point: THREE.Vector3, size: number, angle: number, tilt: number, palette: THREE.Color[], snowy?: THREE.InstancedMesh) {
    dummy.position.copy(point); dummy.rotation.set(tilt, angle, (random() - .5) * 1.1, 'YXZ'); dummy.scale.setScalar(size);
    place(mesh, palette[Math.floor(random() * palette.length)]);
    if (mesh === groundLeaves) groundVeins.setMatrixAt(groundVeins.count++, veinMatrix.copy(dummy.matrix).multiply(pothos.veinMatrix));
    if (snowy && random() > .55) { dummy.position.y += .009; place(snowy); }
  }
  function branch(a: THREE.Vector3, b: THREE.Vector3, radius: number, mesh = branches) {
    dummy.position.copy(a).add(b).multiplyScalar(.5);
    dummy.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    dummy.scale.set(radius, a.distanceTo(b), radius); place(mesh);
  }
  function planter(x: number, z: number, y: number, width: number, depth: number, height = .58) {
    propPart(parent, [width, height, depth], [x, y + height / 2, z], concrete);
    propPart(parent, [width + .06, .07, depth + .06], [x, y + height, z], lip);
    propPart(parent, [width - .15, .024, depth - .15], [x, y + height + .04, z], soil);
    contactShadow(parent, { x, z, floorY: y, width, depth, spread: .12, opacity: .24 });
    return y + height + .065;
  }
  function groundPothos(x: number, z: number, y: number, width: number, depth: number) {
    for (let i = 0; i < Math.ceil(width * depth * 27); i++) {
      const start = new THREE.Vector3(x + (random() - .5) * (width - .1), y, z + (random() - .5) * (depth - .1));
      const heading = random() * Math.PI * 2;
      const end = start.clone().add(new THREE.Vector3(Math.cos(heading) * .12, .10 + random() * .12, Math.sin(heading) * .12));
      branch(start, end, .009, vines);
      for (let l = 0; l < 4; l++) {
        const p = start.clone().lerp(end, .35 + l * .21);
        leaf(groundLeaves, p, (.16 + random() * .055) / .245, heading + l * 2.4, -1.3 + random() * .6, pothosColors, planterSnow);
      }
    }
  }
  function maple(x: number, z: number, base: number, size: number) {
    const root = new THREE.Vector3(x, base, z), fork = root.clone().add(new THREE.Vector3(.06, .85 * size, .02));
    branch(root, fork, .065 * size);
    for (let b = 0; b < 9; b++) {
      const angle = b * 2.4, spread = (.40 + random() * .23) * size;
      const elbow = fork.clone().add(new THREE.Vector3(Math.cos(angle) * spread * .5, (.36 + b * .045) * size, Math.sin(angle) * spread * .5));
      const tip = new THREE.Vector3(x + Math.cos(angle) * spread, base + (1.40 + b * .075) * size, z + Math.sin(angle) * spread);
      branch(fork, elbow, .032 * size); branch(elbow, tip, .021 * size);
      for (let twig = 0; twig < 3; twig++) {
        const heading = angle + (twig - 1) * 1.15;
        const end = tip.clone().add(new THREE.Vector3(Math.cos(heading) * .30 * size, (.07 + random() * .14) * size, Math.sin(heading) * .30 * size));
        branch(tip, end, .01 * size);
        for (let l = 0; l < 9; l++) {
          const p = tip.clone().lerp(end, .25 + random() * .95);
          p.x += (random() - .5) * .3 * size; p.y += (random() - .5) * .21 * size; p.z += (random() - .5) * .3 * size;
          leaf(maples, p, (.18 + random() * .08) * size, random() * Math.PI * 2, -.65 + random() * 1.6, mapleColors, mapleSnow);
        }
      }
    }
  }
  function pine(x: number, z: number, base: number, size: number) {
    const root = new THREE.Vector3(x, base, z), top = new THREE.Vector3(x + .14 * size, base + 2.02 * size, z);
    branch(root, top, .067 * size);
    for (let tier = 0; tier < 5; tier++) for (let b = 0; b < 4; b++) {
      const angle = b * Math.PI / 2 + tier * 2.4, reach = (.83 - tier * .135) * size;
      const start = root.clone().lerp(top, .34 + tier * .14);
      const bend = start.clone().add(new THREE.Vector3(Math.cos(angle) * reach * .55, -.06 * size, Math.sin(angle) * reach * .55));
      const end = start.clone().add(new THREE.Vector3(Math.cos(angle) * reach, .10 * size, Math.sin(angle) * reach));
      branch(start, bend, .027 * size); branch(bend, end, .015 * size);
      for (let spray = 0; spray < 20; spray++) {
        const heading = angle + (spray % 3 - 1) * .8;
        const point = start.clone().lerp(end, .35 + random() * .70);
        point.x += (random() - .5) * .23 * size; point.z += (random() - .5) * .23 * size;
        leaf(needles, point, (.44 + random() * .12) * size, Math.PI * 1.5 - heading, -1.1 + random() * .35, pineColors, pineSnow);
      }
    }
  }
  function tree(x: number, z: number, y: number, size = 1, species: 'maple' | 'pine' = 'maple') {
    const base = planter(x, z, y, 1.16, 1.16, .68);
    (species === 'pine' ? pine : maple)(x, z, base, size);
    groundPothos(x, z, base, .94, .94);
  }
  function border(x: number, z: number, y: number, width: number, depth: number, trailing = false) {
    const top = planter(x, z, y, width, depth, .47);
    groundPothos(x, z, top, width, depth);
    if (!trailing) return;
    const alongZ = depth > width, span = alongZ ? depth : width;
    const outward = alongZ ? new THREE.Vector3(x < 19 ? -1 : 1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const across = alongZ ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const count = Math.ceil(span * 2.2);
    for (let v = 0; v < count; v++) {
      const start = new THREE.Vector3(x, top + .08, z).addScaledVector(across, ((v + .3 + random() * .4) / count - .5) * (span - .08));
      start.addScaledVector(outward, (alongZ ? width : depth) / 2 + .055);
      const length = .5 + random() * .90, phase = random() * 6;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, .06, 0),
        new THREE.Vector3(0, -.15, 0).addScaledVector(outward, .06),
        new THREE.Vector3(0, -length * .55, 0).addScaledVector(across, Math.sin(phase) * .07).addScaledVector(outward, .11),
        new THREE.Vector3(0, -length, 0).addScaledVector(across, Math.cos(phase) * .10).addScaledVector(outward, .10),
      ]);
      const trail = new THREE.Group(); trail.name = 'Trailing pothos'; trail.position.copy(start);
      const stem = new THREE.Mesh(pothosVineGeometry(curve), pothos.stemMaterial);
      const leaves = new THREE.InstancedMesh(pothos.leafGeometry, pothos.instanceMaterial, 9);
      const veins = new THREE.InstancedMesh(pothos.veinGeometry, pothos.veinMaterial, 9);
      const leafPose = new THREE.Object3D(), angle = Math.atan2(outward.x, outward.z);
      for (let index = 0; index < 9; index++) {
        positionPothosLeaf(leafPose, curve, index, trails.length, angle);
        leafPose.updateMatrix(); leaves.setMatrixAt(index, leafPose.matrix);
        leaves.setColorAt(index, pothosColors[(index + trails.length) % 3]);
        veins.setMatrixAt(index, veinMatrix.copy(leafPose.matrix).multiply(pothos.veinMatrix));
      }
      for (const mesh of [stem, leaves, veins]) { mesh.castShadow = mesh.receiveShadow = true; trail.add(mesh); }
      leaves.computeBoundingSphere(); veins.computeBoundingSphere();
      parent.add(trail); trails.push(trail);
    }
  }
  function finish() {
    for (const mesh of meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }
  return { tree, border, finish, update(snow: number, rain: number, time: number, reducedMotion: boolean) {
    snowMeshes.forEach(mesh => { mesh.visible = snow > .08; });
    snowMaterial.opacity = THREE.MathUtils.smoothstep(snow, .08, .6) * .96;
    concrete.color.set('#85897d').multiplyScalar(1 - rain * .12);
    leafMaterial.roughness = .83 - rain * .15;
    for (const [index, trail] of trails.entries()) trail.rotation.z = pothosSway(time, index, reducedMotion);
  } };
}
