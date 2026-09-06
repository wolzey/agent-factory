import * as THREE from 'three';

export const pothosMaterial = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, emissive: '#091408' });

/** The indoor hanging plant is the canonical leaf, vein, color and vine recipe. */
export function createPothosFoliage() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.035);
  shape.lineTo(-0.045, 0.078); shape.lineTo(-0.09, 0.055); shape.lineTo(-0.105, 0.005);
  shape.lineTo(-0.075, -0.067); shape.lineTo(0, -0.165);
  shape.lineTo(0.075, -0.067); shape.lineTo(0.105, 0.005); shape.lineTo(0.09, 0.055);
  shape.lineTo(0.045, 0.078); shape.closePath();
  const leafGeometry = new THREE.ExtrudeGeometry(shape, { depth: 0.015, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.007, bevelSegments: 1, steps: 1 });
  const leafMaterials = ['#448047', '#588d49', '#366c3c'].map(pothosMaterial);
  const instanceMaterial = pothosMaterial('#ffffff');
  const veinGeometry = new THREE.BoxGeometry(0.009, 0.125, 0.006);
  const veinMaterial = pothosMaterial('#9bb95f'), stemMaterial = pothosMaterial('#456a37');
  const vein = new THREE.Object3D();
  vein.position.set(0, -0.045, 0.026); vein.rotation.z = 0.05; vein.updateMatrix();
  return {
    leafGeometry, leafMaterials, instanceMaterial, veinGeometry, veinMaterial, stemMaterial, veinMatrix: vein.matrix.clone(),
    dispose() {
      leafGeometry.dispose(); veinGeometry.dispose();
      [...leafMaterials, instanceMaterial, veinMaterial, stemMaterial].forEach(material => material.dispose());
    },
  };
}

export function pothosVineGeometry(curve: THREE.CatmullRomCurve3) {
  return new THREE.TubeGeometry(curve, 14, 0.011, 4, false);
}

export function positionPothosLeaf(leaf: THREE.Object3D, curve: THREE.CatmullRomCurve3, index: number, vine: number, angle: number, count = 9) {
  const t = index / count;
  leaf.position.copy(curve.getPoint(t));
  leaf.rotation.set(-0.2 + Math.sin(index + vine) * 0.45, angle + Math.sin(index * 2.1) * 0.7, (index % 2 ? 1 : -1) * 0.6);
  leaf.scale.setScalar(0.78 + (1 - t) * 0.42);
}

export function pothosSway(time: number, index: number, reducedMotion: boolean) {
  return reducedMotion ? 0 : Math.sin(time * 0.63 + index * 1.8) * 0.013;
}

/** A reusable strand; placement/length change, while the canonical leaf stays fixed. */
export function createPothosStrand(foliage: ReturnType<typeof createPothosFoliage>, curve: THREE.CatmullRomCurve3, phase: number, angle: number, count = 9, leafScale = 1) {
  const group = new THREE.Group(); group.name = 'Pothos strand';
  const stem = new THREE.Mesh(pothosVineGeometry(curve), foliage.stemMaterial);
  const leaves = new THREE.InstancedMesh(foliage.leafGeometry, foliage.instanceMaterial, count);
  const veins = new THREE.InstancedMesh(foliage.veinGeometry, foliage.veinMaterial, count);
  const leaf = new THREE.Object3D(), veinMatrix = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    positionPothosLeaf(leaf, curve, i, phase, angle, count);
    leaf.scale.multiplyScalar(leafScale); leaf.updateMatrix();
    leaves.setMatrixAt(i, leaf.matrix);
    leaves.setColorAt(i, foliage.leafMaterials[(i + Math.floor(phase)) % 3].color);
    veins.setMatrixAt(i, veinMatrix.copy(leaf.matrix).multiply(foliage.veinMatrix));
  }
  for (const mesh of [stem, leaves, veins]) { mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); }
  leaves.computeBoundingSphere(); veins.computeBoundingSphere();
  return group;
}
