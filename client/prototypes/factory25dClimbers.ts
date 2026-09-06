import * as THREE from 'three';
import type { TeamMember } from '@shared/team';
import { avatarTexture } from './factory25dAvatarTexture';
import { mountainVisitors } from './factory25dVisitors';

/** Familiar visitors on a daytime outing, using the room's actual avatar painter. */
export function createMountainClimbers(scene: THREE.Scene, heightAt: (x: number, z: number) => number) {
  const group = new THREE.Group(); group.name = 'mountain-climbers'; group.visible = false; scene.add(group);
  const size = .19, geometry = new THREE.PlaneGeometry(size, size);
  type Visitor = { id: string; signature: string; mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
    texture: THREE.CanvasTexture; feet: number[] };
  let people: Visitor[] = [];
  function appearance(member: TeamMember) {
    const { sheet, texture } = avatarTexture(member.avatar, ['climb']);
    return { texture, feet: sheet.feet[0], signature: JSON.stringify(member.avatar) };
  }
  function remove(person: Visitor) { person.mesh.removeFromParent(); person.texture.dispose(); person.mesh.material.dispose(); }
  // Real matte cord can dim with the mountain and become subpixel at a distance.
  // WebGL lines stay at least a pixel wide and ignore the lighting entirely.
  const ropeMaterial = new THREE.MeshStandardMaterial({ color: '#626456', roughness: 1 });
  const rope = new THREE.InstancedMesh(new THREE.CylinderGeometry(.0012, .0012, 1, 4), ropeMaterial, 24);
  rope.name = 'climbing-rope'; rope.frustumCulled = false; group.add(rope);
  const matrix = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  const anchors = [new THREE.Vector3(), new THREE.Vector3()];
  const curve = new THREE.CatmullRomCurve3(Array.from({ length: 4 }, () => new THREE.Vector3()));
  const start = new THREE.Vector3(), end = new THREE.Vector3();
  let time = 20;
  function groundRope(point: THREE.Vector3) { point.y = Math.max(point.y, heightAt(point.x, point.z) + .009); }
  return {
    setVisitors(members: readonly TeamMember[]) {
      const selected = mountainVisitors(members, people.map(person => person.id));
      for (const person of people) if (!selected.some(member => member.id === person.id)) remove(person);
      people = selected.map(member => {
        let person = people.find(person => person.id === member.id);
        if (!person) {
          const looks = appearance(member);
          const material = new THREE.MeshStandardMaterial({ map: looks.texture, alphaTest: .08, roughness: 1, side: THREE.DoubleSide });
          const mesh = new THREE.Mesh(geometry, material); mesh.name = 'mountain-visitor'; group.add(mesh);
          person = { id: member.id, mesh, ...looks };
        } else if (person.signature !== JSON.stringify(member.avatar)) {
          person.texture.dispose(); Object.assign(person, appearance(member));
          person.mesh.material.map = person.texture;
        }
        person.mesh.userData = { visitorId: member.id, visitorName: member.name, activity: 'climbing' };
        return person;
      });
      if (!people.length) group.visible = false;
    },
    update(dt: number, night: boolean, paused: boolean) {
      // Hide the whole outing, including its rope, even when motion is paused.
      group.visible = !night && people.length > 0;
      if (!group.visible) return;
      if (!paused) time += Math.min(.1, Math.max(0, dt));
      const progress = THREE.MathUtils.smoothstep((Math.sin(time / 42) + 1) / 2, .12, .88);
      people.forEach((person, index) => {
        const x = 3.22 + progress * .36 - index * .11;
        const z = -3.48 - progress * .7 + index * .28;
        const floor = heightAt(x, z) + .014;
        const frame = progress === 0 || progress === 1 ? 1 : Math.floor(time * 1.5 + index * 2) % 4;
        person.texture.offset.x = frame / 4;
        person.mesh.position.set(x, floor + (person.feet[frame] / 32 - .5) * size, z);
        person.mesh.rotation.set(0, 0, -.08);
        anchors[index].set(x, floor + .056, z + .016);
      });
      const a = anchors[0], b = anchors[people.length - 1];
      curve.points[0].set(3.7, heightAt(3.7, -4.5) + .015, -4.5);
      curve.points[1].copy(a);
      curve.points[2].lerpVectors(a, b, .5); curve.points[2].y -= .025;
      curve.points[3].copy(b);
      curve.getPoint(0, start); groundRope(start);
      for (let index = 0; index < rope.count; index++) {
        curve.getPoint((index + 1) / rope.count, end); groundRope(end);
        direction.subVectors(end, start);
        matrix.position.lerpVectors(start, end, .5);
        matrix.scale.set(1, direction.length(), 1);
        matrix.quaternion.setFromUnitVectors(up, direction.normalize()); matrix.updateMatrix();
        rope.setMatrixAt(index, matrix.matrix); start.copy(end);
      }
      rope.instanceMatrix.needsUpdate = true;
    },
    dispose() { people.forEach(remove); people = []; geometry.dispose(); rope.geometry.dispose(); ropeMaterial.dispose(); group.removeFromParent(); },
  };
}
