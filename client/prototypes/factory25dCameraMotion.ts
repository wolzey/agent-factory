import * as THREE from 'three';

/** Shared with the whiteboard: gentle departure/arrival and even perceived scale. */
export function cameraEase(progress: number): number {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  return t * t * t * (10 + t * (-15 + 6 * t));
}

export interface CameraPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  height: number;
}

export function cameraPose(camera: THREE.OrthographicCamera): CameraPose {
  return {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    height: (camera.top - camera.bottom) / camera.zoom,
  };
}

export function blendCamera(
  camera: THREE.OrthographicCamera,
  from: CameraPose,
  to: CameraPose,
  progress: number,
  aspect: number,
) {
  const t = cameraEase(progress);
  const height = Math.exp(THREE.MathUtils.lerp(Math.log(from.height), Math.log(to.height), t));
  camera.position.lerpVectors(from.position, to.position, t);
  camera.quaternion.slerpQuaternions(from.quaternion, to.quaternion, t);
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.left = -height * aspect / 2;
  camera.right = height * aspect / 2;
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
