import * as THREE from 'three';
import { PATIO, patioFloorHeight } from '@shared/factory25d-patio';

/** Pick the visible tread or deck, instead of projecting every drag onto Y=0. */
export function intersectFactoryFloor(ray: THREE.Ray, result: THREE.Vector3): boolean {
  const candidate = new THREE.Vector3(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
  let nearest = Infinity;
  for (let i = 0; i <= PATIO.stairs.steps; i++) {
    const height = PATIO.lowerY * i / PATIO.stairs.steps;
    plane.constant = -height;
    if (!ray.intersectPlane(plane, candidate)) continue;
    const floor = candidate.x > 8 ? patioFloorHeight(candidate) : 0;
    if (Math.abs(floor - height) > .001) continue;
    const distance = ray.origin.distanceToSquared(candidate);
    if (distance < nearest) { nearest = distance; result.copy(candidate); }
  }
  return Number.isFinite(nearest);
}
