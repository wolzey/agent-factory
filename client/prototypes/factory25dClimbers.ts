import * as THREE from 'three';

/** Two tiny roped visitors, grounded on the same mountain mesh as the trees. */
export function createMountainClimbers(scene: THREE.Scene, heightAt: (x: number, z: number) => number) {
  const group = new THREE.Group(); group.name = 'mountain-climbers'; scene.add(group);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const dark = new THREE.MeshStandardMaterial({ color: '#293c41', roughness: 1 });
  const skin = new THREE.MeshStandardMaterial({ color: '#be9a75', roughness: 1 });
  const helmet = new THREE.MeshStandardMaterial({ color: '#d9c898', roughness: 1 });
  function part(parent: THREE.Group, size: number[], position: number[], material: THREE.Material) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(size[0], size[1], size[2]); mesh.position.set(position[0], position[1], position[2]);
    parent.add(mesh); return mesh;
  }
  const people = ['#bd654a', '#648c9d'].map((color, index) => {
    const root = new THREE.Group(); group.add(root);
    const shirt = new THREE.MeshStandardMaterial({ color, roughness: 1 });
    part(root, [.047, .063, .029], [0, .09, 0], shirt);
    part(root, [.034, .032, .034], [0, .14, 0], skin);
    part(root, [.041, .016, .041], [0, .159, 0], helmet);
    part(root, [.04, .05, .023], [0, .091, .023], dark);
    part(root, [.052, .009, .038], [0, .063, 0], helmet);
    const arms = [-1, 1].map(side => {
      const joint = new THREE.Group(); joint.position.set(side * .03, .112, 0); root.add(joint);
      part(joint, [.016, .046, .017], [0, -.02, 0], shirt);
      part(joint, [.015, .024, .018], [0, -.05, -.009], skin); return joint;
    });
    const legs = [-1, 1].map(side => {
      const joint = new THREE.Group(); joint.position.set(side * .018, .063, 0); root.add(joint);
      part(joint, [.019, .054, .022], [0, -.026, 0], dark);
      part(joint, [.022, .015, .036], [0, -.05, -.006], dark); return joint;
    });
    return { root, arms, legs, index };
  });
  const ropeGeometry = new THREE.BufferGeometry();
  const ropePoints = new Float32Array(15);
  ropeGeometry.setAttribute('position', new THREE.BufferAttribute(ropePoints, 3));
  const ropeMaterial = new THREE.LineBasicMaterial({ color: '#c7b992', transparent: true, opacity: .7 });
  const rope = new THREE.Line(ropeGeometry, ropeMaterial); rope.frustumCulled = false; group.add(rope);
  let time = 20;
  return {
    update(dt: number, paused: boolean) {
      if (!paused) time += Math.min(.1, Math.max(0, dt));
      // Slow out-and-back traverse, with a rest at each end instead of a teleport.
      const progress = THREE.MathUtils.smoothstep((Math.sin(time / 42) + 1) / 2, .12, .88);
      const direction = Math.cos(time / 42) < 0 ? -1 : 1;
      people.forEach(({ root, arms, legs, index }) => {
        const x = 3.22 + progress * .36 - index * .11;
        const z = -3.48 - progress * .7 + index * .28;
        root.position.set(x, heightAt(x, z) + .014, z);
        root.rotation.set(-.25, -.25, -.08);
        const stride = paused || progress === 0 || progress === 1 ? 0 : Math.sin(time * 1.45 + index * 2);
        arms[0].rotation.x = -2.35 + stride * .34; arms[1].rotation.x = -2.35 - stride * .34;
        arms[0].rotation.z = -.3; arms[1].rotation.z = .3;
        legs[0].rotation.x = -.25 + stride * .33 * direction;
        legs[1].rotation.x = -.25 - stride * .33 * direction;
      });
      const a = people[0].root.position, b = people[1].root.position;
      ropePoints.set([3.7, heightAt(3.7, -4.5) + .025, -4.5,
        a.x, a.y + .065, a.z + .027,
        (a.x + b.x) / 2, (a.y + b.y) / 2 + .025, (a.z + b.z) / 2 + .06,
        b.x, b.y + .065, b.z + .027,
        b.x - .025, b.y + .035, b.z + .08]);
      ropeGeometry.attributes.position.needsUpdate = true;
    },
  };
}
