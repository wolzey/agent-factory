import * as THREE from 'three';

export function standard(color: string, roughness = 0.95, emissive = '#000000'): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.03, emissive });
}

export function propPart(
  group: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
): THREE.Mesh {
  const part = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  part.position.set(...position);
  part.castShadow = true;
  part.receiveShadow = true;
  group.add(part);
  return part;
}
