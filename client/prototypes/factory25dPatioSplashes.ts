import * as THREE from 'three';
import { PATIO, patioFloorHeight } from '@shared/factory25d-patio';
import { FACTORY_OBSTACLES } from '@shared/factory25d-layout';

// The water shader uses this same integer-cell pattern, so each little crown
// appears at the center of its ripple. No per-frame particle allocation.
export const PATIO_IMPACT_GRID = 1.65;
export function patioImpactSeed(x: number, z: number) {
  const mod = (n: number) => ((n % 251) + 251) % 251;
  const a = mod(x), b = mod(z);
  return mod(a * 37 + b * 61 + a * b * 17) / 251;
}

function crownGeometry() {
  const positions: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2, b = a + .24, c = a - .24;
    positions.push(Math.cos(b) * .58, 0, Math.sin(b) * .58,
      Math.cos(a), .7 + (i % 2) * .3, Math.sin(a), Math.cos(c) * .58, 0, Math.sin(c) * .58);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals(); return geometry;
}

export function createPatioSplashes(parent: THREE.Group) {
  const impacts: Array<{ x: number; y: number; z: number; seed: number }> = [];
  for (let cx = Math.floor(PATIO.left * PATIO_IMPACT_GRID); cx < PATIO.right * PATIO_IMPACT_GRID; cx++) {
    for (let cz = Math.floor(PATIO.back * PATIO_IMPACT_GRID); cz < PATIO.front * PATIO_IMPACT_GRID; cz++) {
      const seed = patioImpactSeed(cx, cz);
      const x = (cx + .15 + seed * .7) / PATIO_IMPACT_GRID;
      const z = (cz + .15 + patioImpactSeed(cx + 19, cz + 19) * .7) / PATIO_IMPACT_GRID;
      if (x < PATIO.left + .08 || x > PATIO.right - .08 || z < PATIO.back + .08 || z > PATIO.front - .08) continue;
      if (FACTORY_OBSTACLES.some(o => x > o.left && x < o.right && z > o.near && z < o.far)) continue;
      if (x > 8.43 && x < 14.33 && z > 6.01 && z < 9.51) continue; // lounge rug
      impacts.push({ x, y: patioFloorHeight({ x, z }) + .009, z, seed });
    }
  }
  const material = new THREE.MeshBasicMaterial({ color: '#bfd6dc', transparent: true, opacity: .65, depthWrite: false, side: THREE.DoubleSide });
  const crowns = new THREE.InstancedMesh(crownGeometry(), material, impacts.length);
  const drops = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1), material, impacts.length * 2);
  crowns.name = 'Tiny rain impact crowns'; drops.name = 'Airborne rain splash droplets';
  crowns.count = drops.count = 0;
  for (const mesh of [crowns, drops]) { mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); parent.add(mesh); }
  const dummy = new THREE.Object3D();
  return {
    update(rain: number, time: number, night: boolean, reduced: boolean) {
      crowns.visible = drops.visible = rain > .01 && !reduced;
      if (!crowns.visible) return;
      crowns.count = drops.count = 0;
      material.opacity = night ? .38 : .64;
      for (const point of impacts) {
        if (point.seed > rain * .9) continue;
        const age = (time * .65 + point.seed * 7) % 1;
        if (age > .20) continue;
        const t = age / .20, lift = Math.sin(t * Math.PI);
        dummy.rotation.set(0, point.seed * 6.28, 0);
        dummy.position.set(point.x, point.y, point.z);
        dummy.scale.set(.018 + t * .035, .043 * lift, .018 + t * .035);
        dummy.updateMatrix(); crowns.setMatrixAt(crowns.count++, dummy.matrix);
        if (t > .18 && t < .92) for (let d = 0; d < 2; d++) {
          const angle = point.seed * 19 + d * 2.6;
          dummy.position.set(point.x + Math.cos(angle) * t * .08, point.y + lift * (.055 + d * .016), point.z + Math.sin(angle) * t * .08);
          dummy.scale.set(.009, .012 * (1 - t * .5), .009);
          dummy.updateMatrix(); drops.setMatrixAt(drops.count++, dummy.matrix);
        }
      }
      crowns.instanceMatrix.needsUpdate = drops.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const mesh of [crowns, drops]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.dispose(); }
      material.dispose();
    },
  };
}
