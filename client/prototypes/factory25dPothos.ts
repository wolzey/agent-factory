import * as THREE from 'three';

/** Heart-shaped, unsplit pothos leaves and hanging vines, all solid geometry. */
export function createHangingPothos(scene: THREE.Scene, hookHeight: number) {
  const group = new THREE.Group();
  group.position.set(6.95, 0, -4.03);
  const matte = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, emissive: '#091408' });
  const clay = matte('#8c7469'); const rim = matte('#b09a84');
  const rope = matte('#c0bca1'); const stem = matte('#456a37');
  const leafMaterials = ['#448047', '#588d49', '#366c3c'].map(matte);
  const veinMaterial = matte('#9bb95f');
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
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.035);
  shape.lineTo(-0.045, 0.078); shape.lineTo(-0.09, 0.055); shape.lineTo(-0.105, 0.005);
  shape.lineTo(-0.075, -0.067); shape.lineTo(0, -0.165);
  shape.lineTo(0.075, -0.067); shape.lineTo(0.105, 0.005); shape.lineTo(0.09, 0.055);
  shape.lineTo(0.045, 0.078); shape.closePath();
  const leafGeometry = new THREE.ExtrudeGeometry(shape, { depth: 0.015, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.007, bevelSegments: 1, steps: 1 });
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
    add(new THREE.TubeGeometry(curve, 14, 0.011, 4, false), stem, new THREE.Vector3(), trail);
    for (let index = 0; index < 9; index += 1) {
      const t = index / 9;
      const leaf = new THREE.Group(); leaf.position.copy(curve.getPoint(t));
      leaf.rotation.set(-0.2 + Math.sin(index + vine) * 0.45, angle + Math.sin(index * 2.1) * 0.7, (index % 2 ? 1 : -1) * 0.6);
      leaf.scale.setScalar(0.78 + (1 - t) * 0.42);
      add(leafGeometry, leafMaterials[(index + vine) % 3], new THREE.Vector3(), leaf);
      const vein = add(new THREE.BoxGeometry(0.009, 0.125, 0.006), veinMaterial, new THREE.Vector3(0, -0.045, 0.026), leaf);
      vein.rotation.z = 0.05;
      trail.add(leaf);
    }
    group.add(trail); vines.push(trail);
  }
  scene.add(group);
  return { update(time: number, reducedMotion: boolean) {
    for (const [index, vine] of vines.entries()) vine.rotation.z = reducedMotion ? 0 : Math.sin(time * 0.63 + index * 1.8) * 0.013;
  } };
}
