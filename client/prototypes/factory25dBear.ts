import * as THREE from 'three';
import { meadowHeight } from './factory25dLandscape';
import { BearFootsteps } from './factory25dBearGait';

const TRAILS = [
  { edge: -9.2, clearing: -5.65, z: -6.3 },
  { edge: -9.2, clearing: -6.1, z: -5.2 },
] as const;
const WALK_SPEED = 0.22;

/** One visitor at a time; pauses offscreen instead of jumping ahead on return. */
export class BearVisit {
  phase: 'waiting' | 'walking' | 'sniffing' | 'leaving' = 'waiting';
  x = TRAILS[0].edge as number;
  z = TRAILS[0].z as number;
  direction = 1;
  stride = 0;
  sniff = 0;
  private remaining: number;
  private trail = 0;

  constructor(private random = Math.random) {
    this.remaining = 16 + random() * 12;
  }

  get visible() { return this.phase !== 'waiting'; }
  get walking() { return this.phase === 'walking' || this.phase === 'leaving'; }

  update(dt: number, paused = false) {
    if (paused) return;
    dt = Math.max(0, Math.min(0.1, dt));
    const trail = TRAILS[this.trail];
    if (this.phase === 'waiting') {
      this.remaining -= dt;
      if (this.remaining > 0) return;
      this.x = trail.edge; this.z = trail.z;
      this.direction = Math.sign(trail.clearing - trail.edge);
      this.phase = 'walking';
    } else if (this.phase === 'sniffing') {
      this.sniff += dt;
      if (this.sniff >= 4) {
        this.phase = 'leaving';
        this.direction *= -1;
      }
    } else {
      const goal = this.phase === 'walking' ? trail.clearing : trail.edge;
      const distance = Math.min(Math.abs(goal - this.x), dt * WALK_SPEED);
      this.x += this.direction * distance;
      this.stride += distance * 19;
      if (Math.abs(goal - this.x) < 0.001) {
        if (this.phase === 'walking') { this.phase = 'sniffing'; this.sniff = 0; }
        else {
          this.phase = 'waiting';
          this.remaining = 80 + this.random() * 75;
          this.trail = 1 - this.trail;
        }
      }
    }
  }
}

/** Small sculpted blocks read as a pixel sprite after the landscape render pass. */
export function createRidgeBear(scene: THREE.Scene, haze: { value: THREE.Color }, heightAt = meadowHeight) {
  const visit = new BearVisit();
  const root = new THREE.Group();
  root.scale.setScalar(0.3);
  const body = new THREE.Group();
  root.add(body);
  scene.add(root);
  const fur = new THREE.MeshStandardMaterial({ color: '#72523c', roughness: 1, flatShading: true });
  const shade = new THREE.MeshStandardMaterial({ color: '#533c30', roughness: 1, flatShading: true });
  const muzzle = new THREE.MeshStandardMaterial({ color: '#ac8961', roughness: 1, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: '#211f1b', roughness: 1 });
  for (const material of [fur, shade, muzzle, dark]) {
    material.onBeforeCompile = shader => {
      shader.uniforms.ridgeHaze = haze;
      shader.fragmentShader = `uniform vec3 ridgeHaze;\n${shader.fragmentShader}`.replace(
        '#include <opaque_fragment>',
        'outgoingLight = mix(outgoingLight, ridgeHaze, 0.23);\n#include <opaque_fragment>',
      );
    };
    material.customProgramCacheKey = () => 'ridge-bear-haze';
  }
  const cube = new THREE.BoxGeometry(1, 1, 1);
  function part(parent: THREE.Group, size: number[], position: number[], material = fur) {
    const mesh = new THREE.Mesh(cube, material);
    mesh.scale.set(size[0], size[1], size[2]);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  part(body, [0.36, 0.18, 0.21], [-0.025, 0.225, 0]);
  part(body, [0.11, 0.15, 0.19], [-0.2, 0.21, 0]);
  part(body, [0.15, 0.22, 0.225], [0.105, 0.245, 0]);
  part(body, [0.05, 0.055, 0.065], [-0.27, 0.22, 0], shade);
  const head = new THREE.Group();
  head.position.set(0.24, 0.275, 0);
  body.add(head);
  part(head, [0.16, 0.15, 0.17], [0, 0, 0]);
  part(head, [0.12, 0.075, 0.12], [0.1, -0.035, 0], muzzle);
  part(head, [0.025, 0.035, 0.095], [0.164, -0.025, 0], dark);
  for (const side of [-1, 1]) {
    part(head, [0.052, 0.055, 0.049], [-0.035, 0.091, side * 0.056]);
    part(head, [0.012, 0.026, 0.025], [-0.006, 0.09, side * 0.056], shade);
    part(head, [0.018, 0.018, 0.009], [0.05, 0.015, side * 0.088], dark);
  }
  const legs: { hip: THREE.Vector3; shin: THREE.Mesh; paw: THREE.Mesh }[] = [];
  for (const x of [-0.155, 0.11]) for (const z of [-0.076, 0.076]) {
    const shin = part(body, [0.073, 0.14, 0.074], [x, 0.09, z], shade);
    const paw = part(body, [0.09, 0.035, 0.082], [x, 0.0175, z], shade);
    legs.push({ hip: new THREE.Vector3(x, 0.155, z), shin, paw });
  }
  const gait = new BearFootsteps(heightAt);
  const up = new THREE.Vector3(0, 1, 0);
  const localFoot = new THREE.Vector3();
  const bone = new THREE.Vector3();
  let wasVisible = false;
  const contact = new THREE.Mesh(
    new THREE.CircleGeometry(1, 10),
    new THREE.MeshBasicMaterial({ color: '#101a17', transparent: true, opacity: 0.18, depthWrite: false }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.scale.set(0.32, 0.13, 1);
  contact.position.y = 0.004;
  root.add(contact);
  root.visible = false;
  let facing = 0;

  return {
    resetGround() { wasVisible = false; },
    update(dt: number, paused: boolean) {
      visit.update(dt, paused);
      root.visible = visit.visible;
      if (!visit.visible) wasVisible = false;
      if (!visit.visible || paused) return;
      // A short turn at the clearing; feet and contact stay attached to the ridge.
      const targetFacing = visit.direction > 0 ? 0.12 : Math.PI - 0.12;
      facing = THREE.MathUtils.damp(facing, targetFacing, 5, dt);
      root.rotation.y = facing;
      root.position.set(visit.x, heightAt(visit.x, visit.z) + 0.002, visit.z);
      const walking = visit.walking ? 1 : 0;
      body.position.y = Math.sin(visit.stride * 2) * 0.003 * walking;
      root.updateWorldMatrix(true, true);
      const nominal = legs.map(leg => body.localToWorld(new THREE.Vector3(leg.hip.x, 0, leg.hip.z)));
      if (!wasVisible) { gait.reset(nominal); wasVisible = true; }
      const feet = gait.update(dt, nominal, { x: visit.direction, z: 0 }, visit.walking);
      legs.forEach((leg, index) => {
        localFoot.set(feet[index].x, feet[index].y + 0.001, feet[index].z);
        body.worldToLocal(localFoot);
        leg.paw.position.copy(localFoot).y += 0.0175;
        const ankle = localFoot.clone().add(new THREE.Vector3(0, 0.035, 0));
        bone.subVectors(leg.hip, ankle);
        leg.shin.position.copy(ankle).addScaledVector(bone, 0.5);
        leg.shin.scale.y = bone.length();
        leg.shin.quaternion.setFromUnitVectors(up, bone.normalize());
      });
      head.rotation.z = visit.phase === 'sniffing' ? -0.2 - Math.sin(visit.sniff * 2.5) * 0.1 : 0;
    },
  };
}
