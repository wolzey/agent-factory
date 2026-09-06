import * as THREE from 'three';
import { createPothosFoliage, positionPothosLeaf, pothosMaterial, pothosSway, pothosVineGeometry } from './factory25dPothosFoliage';

/** Heart-shaped, unsplit pothos leaves and hanging vines, all solid geometry. */
export function createHangingPothos(scene: THREE.Scene, hookHeight: number) {
  const group = new THREE.Group();
  group.position.set(6.95, 0, -4.03);
  const matte = pothosMaterial;
  const foliage = createPothosFoliage();
  const clay = matte('#8c7469'); const rim = matte('#b09a84');
  const rope = matte('#c0bca1');
  const { leafGeometry, leafMaterials, veinGeometry, veinMaterial, stemMaterial } = foliage;
  const potY = hookHeight - 0.83;
  function add(geometry: THREE.BufferGeometry, material: THREE.Material, position: THREE.Vector3, parent: THREE.Group = group) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
    return mesh;
  }
  add(new THREE.CylinderGeometry(0.24, 0.17, 0.29, 10), clay, new THREE.Vector3(0, potY, 0));
  add(new THREE.CylinderGeometry(0.26, 0.26, 0.055, 10), rim, new THREE.Vector3(0, potY + 0.13, 0));
  add(new THREE.CylinderGeometry(0.22, 0.22, 0.025, 10), matte('#34322a'), new THREE.Vector3(0, potY + 0.16, 0));
  for (let index = 0; index < 3; index += 1) {
    const angle = index / 3 * Math.PI * 2;
    const curve = new THREE.LineCurve3(new THREE.Vector3(0, hookHeight, 0), new THREE.Vector3(Math.cos(angle) * 0.23, potY + 0.09, Math.sin(angle) * 0.23));
    add(new THREE.TubeGeometry(curve, 1, 0.009, 4, false), rope, new THREE.Vector3());
  }
  const vines: THREE.Group[] = [];
  for (let vine = 0; vine < 6; vine += 1) {
    const trail = new THREE.Group();
    trail.position.y = potY + 0.15;
    const angle = vine / 6 * Math.PI * 2;
    const length = 0.78 + (vine % 3) * 0.37;
    const x = Math.cos(angle) * 0.21; const z = Math.sin(angle) * 0.21;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x * 0.5, 0.08, z * 0.5), new THREE.Vector3(x * 1.35, -0.15, z * 1.3),
      new THREE.Vector3(x * 1.6 + Math.sin(vine) * 0.08, -length * 0.55, z * 1.5 + 0.07),
      new THREE.Vector3(x * 1.5 + Math.cos(vine) * 0.15, -length, z * 1.3 + 0.13),
    ]);
    add(pothosVineGeometry(curve), stemMaterial, new THREE.Vector3(), trail);
    for (let index = 0; index < 9; index += 1) {
      const leaf = new THREE.Group(); positionPothosLeaf(leaf, curve, index, vine, angle);
      add(leafGeometry, leafMaterials[(index + vine) % 3], new THREE.Vector3(), leaf);
      const vein = add(veinGeometry, veinMaterial, new THREE.Vector3(), leaf);
      vein.applyMatrix4(foliage.veinMatrix);
      trail.add(leaf);
    }
    group.add(trail); vines.push(trail);
  }
  scene.add(group);
  return { update(time: number, reducedMotion: boolean) {
    for (const [index, vine] of vines.entries()) vine.rotation.z = pothosSway(time, index, reducedMotion);
  } };
}
