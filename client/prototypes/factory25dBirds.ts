import * as THREE from 'three';
import type { WeatherVisualState } from '../sky/weather';

/** Tiny silhouettes cross the distant valley occasionally, behind the nearby trees. */
export function createValleyBirds(scene: THREE.Scene, haze: { value: THREE.Color }) {
  const flock = new THREE.Group();
  scene.add(flock);
  const material = new THREE.MeshBasicMaterial({ color: '#394852', side: THREE.DoubleSide, transparent: true });
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.06, 0.012, 0, 0.025, -0.014, 0], 3));
  const birds = Array.from({ length: 3 }, (_, index) => {
    const bird = new THREE.Group();
    bird.position.set(-index * 0.23, index % 2 * 0.07, -index * 0.15);
    flock.add(bird);
    const wings = [-1, 1].map(side => {
      const mesh = new THREE.Mesh(wing, material);
      mesh.scale.x = side;
      bird.add(mesh);
      return mesh;
    });
    return wings;
  });
  let time = -10;
  flock.visible = false;
  return {
    update(dt: number, weather: WeatherVisualState, night: boolean, paused: boolean) {
      if (!paused) time += Math.max(0, Math.min(0.1, dt));
      if (time > 150) time = -10;
      const flight = time >= 0 && time <= 44;
      material.opacity = night ? 0 : THREE.MathUtils.clamp(1 - weather.rain01 * 1.8 - weather.snow01 * 1.5, 0, 1);
      material.color.set('#394852').lerp(haze.value, 0.42);
      flock.visible = flight && material.opacity > 0.01;
      if (!flock.visible || paused) return;
      flock.position.set(-9.3 + time * 0.44, 2.25 + Math.sin(time * 0.13) * 0.13, -8);
      birds.forEach((wings, index) => wings.forEach((mesh, side) => {
        mesh.rotation.z = (side ? 1 : -1) * Math.sin(time * 9 + index * 1.5) * 0.72;
      }));
    },
  };
}
