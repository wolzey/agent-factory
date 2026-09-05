import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createTerrainSampler } from './factory25dTerrainSampler';
import { meadowHeight } from './factory25dLandscape';

export async function loadBlenderTerrain() {
  const gltf = await new GLTFLoader().loadAsync(new URL('../assets/prototype25d/utah-mountains.glb', import.meta.url).href);
  gltf.scene.updateMatrixWorld(true);
  let terrain: THREE.Mesh | undefined;
  gltf.scene.traverse(object => { if (object instanceof THREE.Mesh && object.name === 'Utah_Mountains') terrain = object; });
  if (!terrain) throw new Error('The Blender terrain mesh is missing.');
  // Normalize exporter axis/node transforms so shader depth, snow and grounding
  // all use the same world coordinates as the original landscape.
  const geometry = terrain.geometry.clone().applyMatrix4(terrain.matrixWorld);
  gltf.scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose());
  });
  return { geometry, heightAt: createTerrainSampler(geometry, meadowHeight) };
}
