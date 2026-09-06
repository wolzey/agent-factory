import * as THREE from 'three';

/** The cutaway keeps the soft downward night light, without a visible fixture. */
export function createCeilingLights(parent: THREE.Group, night: boolean) {
  const frame = new THREE.Group(); frame.name = 'workspace-night-lighting';
  frame.position.set(0, 2.4, -0.35); parent.add(frame);
  const width = 8.8, depth = 3.2, bar = 0.055;
  const lights: THREE.RectAreaLight[] = [];
  let warmth = Number(night);

  function segment(w: number, d: number, x: number, z: number) {
    const stripWidth = w > bar ? w : bar + 0.03;
    const stripDepth = d > bar ? d : bar + 0.03;
    const light = new THREE.RectAreaLight('#f1e4cf', 0, stripWidth, stripDepth);
    light.name = 'workspace-ceiling-wash'; light.position.set(x, -0.045, z);
    light.rotation.x = -Math.PI / 2; // RectAreaLight emits along its local -Z axis.
    frame.add(light); lights.push(light);
  }
  for (const sign of [-1, 1]) {
    segment(width, bar, 0, sign * (depth - bar) / 2);
    segment(bar, depth - bar * 2, sign * (width - bar) / 2, 0);
  }
  function paint() {
    for (const light of lights) light.intensity = warmth * 50;
  }
  paint();
  return { update(dt: number, night: boolean) {
    let next = THREE.MathUtils.damp(warmth, Number(night), 2, Math.min(dt, 0.1));
    if (Math.abs(next - Number(night)) < 0.0001) next = Number(night);
    if (next === warmth) return;
    warmth = next; paint();
  } };
}
