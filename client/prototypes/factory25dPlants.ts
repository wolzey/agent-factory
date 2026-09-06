import * as THREE from "three";
import { standard, propPart } from "./factory25dProps";
import { contactShadow } from "./factory25dContactShadows";
import { createHouseplantFoliage } from './factory25dHouseplantFoliage';

export function createIndoorPlants(interior: THREE.Group) {
  type PlantKind =
    | "broad"
    | "rubber"
    | "fern"
    | "trailing"
    | "calathea"
    | "bird"
    | "palm"
    | "snake"
    | "cactus"
    | "succulent"
    | "bonsai"
    | "flytrap";
  const houseplants = createHouseplantFoliage();
  const plants: Array<{ foliage: THREE.Group; phase: number; update?: (time: number, reduced: boolean) => void }> = [];
  const potClay = standard("#69515d", 1, "#100c16");
  const potRim = standard("#8b6e74", 1, "#110c16");
  const potSoil = standard("#272431", 1);
  const stemMaterial = standard("#286231", 1, "#041108");
  const leafMaterials = ["#17572a", "#247535", "#398b40"].map((color) =>
    standard(color, 1, "#041309"),
  );

  // A thick, angular blade with a raised center vein. The two faces catch
  // different amounts of light, so the foliage reads like the solid furniture.
  const leafGeometry = new THREE.BufferGeometry();
  const leafVertices: number[] = [];
  const leafRows = [
    { y: 0, width: 0.015, ridge: 0 },
    { y: 0.3, width: 0.18, ridge: 0.035 },
    { y: 0.65, width: 0.16, ridge: 0.045 },
    { y: 1, width: 0.005, ridge: 0.005 },
  ];
  for (let i = 0; i < leafRows.length - 1; i += 1) {
    const a = leafRows[i];
    const b = leafRows[i + 1];
    for (const side of [-1, 1]) {
      const p = [side * a.width, a.y, 0];
      const q = [0, a.y, a.ridge];
      const r = [side * b.width, b.y, 0];
      const t = [0, b.y, b.ridge];
      const backA = [0, a.y, -0.025];
      const backB = [0, b.y, -0.025];
      const triangles =
        side > 0
          ? [p, r, q, q, r, t, p, backA, r, backA, backB, r]
          : [p, q, r, q, t, r, p, r, backA, backA, r, backB];
      leafVertices.push(...triangles.flat());
    }
  }
  leafGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(leafVertices, 3),
  );
  leafGeometry.computeVertexNormals();

  function plant(
    kind: PlantKind,
    x: number,
    z: number,
    scale: number,
    phase: number,
    baseY = 0,
    parent: THREE.Object3D = interior,
  ) {
    const group = new THREE.Group();
    group.name = `${kind} plant`;
    let updateFoliage: ((time: number, reduced: boolean) => void) | undefined;
    propPart(group, [0.24, 0.18, 0.24], [0, 0.11, 0], potClay);
    propPart(group, [0.29, 0.07, 0.29], [0, 0.235, 0], potRim);
    propPart(group, [0.235, 0.015, 0.235], [0, 0.279, 0], potSoil);
    const foliage = new THREE.Group();
    foliage.position.y = 0.28;
    group.add(foliage);

    const addLeaf = (
      angle: number,
      height: number,
      spread: number,
      length: number,
      width: number,
      index: number,
    ) => {
      const end = new THREE.Vector3(
        Math.cos(angle) * spread,
        height,
        Math.sin(angle) * spread,
      );
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.015, end.length(), 4),
        stemMaterial,
      );
      stem.position.copy(end).multiplyScalar(0.5);
      stem.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        end.clone().normalize(),
      );
      stem.castShadow = true;
      stem.receiveShadow = true;
      foliage.add(stem);
      const leaf = new THREE.Mesh(
        leafGeometry,
        leafMaterials[index % leafMaterials.length],
      );
      leaf.position.copy(end);
      // Broad leaves spread out; spear-shaped plants point up from the pot.
      const rise = kind === "snake" || kind === "bird" ? 0.9 : 0.34;
      leaf.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(
          Math.cos(angle) * 0.72,
          rise,
          Math.sin(angle) * 0.72,
        ).normalize(),
      );
      leaf.scale.set(width, length, 1);
      leaf.castShadow = true;
      leaf.receiveShadow = true;
      foliage.add(leaf);
    };

    if (kind === "cactus") {
      const cactusMaterial = standard("#32763e", 1, "#041008");
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085, 0.1, 0.5, 6),
        cactusMaterial,
      );
      stem.position.y = 0.25;
      stem.castShadow = true;
      stem.receiveShadow = true;
      foliage.add(stem);
      for (const [side, height] of [
        [-1, 0.2],
        [1, 0.31],
      ]) {
        propPart(
          foliage,
          [0.18, 0.065, 0.075],
          [side * 0.13, height, 0],
          cactusMaterial,
        );
        propPart(
          foliage,
          [0.075, 0.19, 0.075],
          [side * 0.2, height + 0.075, 0],
          cactusMaterial,
        );
      }
      propPart(
        foliage,
        [0.035, 0.36, 0.012],
        [0.02, 0.25, 0.09],
        leafMaterials[2],
      );
    } else if (kind === "succulent") {
      for (let ring = 0; ring < 2; ring += 1) {
        for (let i = 0; i < 7; i += 1) {
          const angle = (i * Math.PI * 2) / 7 + ring * 0.45;
          const leaf = new THREE.Mesh(
            leafGeometry,
            leafMaterials[(i + ring) % 3],
          );
          leaf.position.set(
            Math.cos(angle) * 0.035,
            ring * 0.045,
            Math.sin(angle) * 0.035,
          );
          leaf.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(
              Math.cos(angle),
              0.3 + ring * 0.7,
              Math.sin(angle),
            ).normalize(),
          );
          leaf.scale.set(0.8, ring === 0 ? 0.3 : 0.2, 1.5);
          leaf.castShadow = true;
          leaf.receiveShadow = true;
          foliage.add(leaf);
        }
      }
    } else if (kind === 'bonsai') {
      const detail = houseplants.bonsai(phase);
      foliage.add(detail.group); updateFoliage = detail.update;
    } else if (kind === "flytrap") {
      const lip = standard("#c35a72", 1, "#231019");
      const tooth = standard("#e2d9a1", 1);
      for (let i = 0; i < 5; i++) {
        const angle = phase + i * 2.4,
          height = 0.1 + (i % 3) * 0.07;
        addLeaf(angle, height, 0.1, 0.13, 0.52, i);
        const mouth = new THREE.Group();
        mouth.position.set(
          Math.cos(angle) * 0.15,
          height + 0.09,
          Math.sin(angle) * 0.15,
        );
        mouth.rotation.y = -angle;
        foliage.add(mouth);
        for (const side of [-1, 1]) {
          const jaw = new THREE.Mesh(
            new THREE.SphereGeometry(0.075, 6, 4),
            leafMaterials[1],
          );
          jaw.scale.set(1, 0.35, 0.85);
          jaw.position.x = side * 0.049;
          jaw.rotation.z = side * 0.65;
          mouth.add(jaw);
          const inside = new THREE.Mesh(
            new THREE.SphereGeometry(0.064, 6, 4),
            lip,
          );
          inside.scale.set(1, 0.16, 0.85);
          inside.position.y = 0.018;
          jaw.add(inside);
          for (let j = 0; j < 4; j++)
            propPart(
              jaw,
              [0.01, 0.047, 0.01],
              [side * 0.046, 0.024, (j - 1.5) * 0.024],
              tooth,
            );
        }
      }
    } else if (kind === 'rubber' || kind === 'broad' || kind === 'calathea') {
      const detail = houseplants.broadleaf(kind,phase);
      foliage.add(detail.group); updateFoliage = detail.update;
    } else if (kind === 'fern' || kind === 'palm' || kind === 'trailing') {
      const detail = kind === 'trailing' ? houseplants.trailing(phase, baseY > 0) : houseplants.fronds(kind,phase);
      foliage.add(detail.group); updateFoliage = detail.update;
    } else {
      const count = kind === "snake" ? 7 : kind === "bird" ? 4 : 6;
      for (let i = 0; i < count; i += 1) {
        const angle = i * 2.4 + phase;
        const spear = kind === "snake" || kind === "bird";
        const height = spear ? 0.04 : 0.16 + (i % 3) * 0.11;
        const length = spear ? 0.45 + (i % 3) * 0.13 : 0.31;
        const width = kind === "snake" ? 0.38 : 0.9;
        addLeaf(angle, height, spear ? 0.06 : 0.09, length, width, i);
      }
    }
    if (kind === "bird") {
      const orange = standard("#f09b37", 1, "#3d1705");
      const purple = standard("#6861b7", 1, "#181533");
      for (let i = 0; i < 2; i++) {
        const bloom = new THREE.Group();
        bloom.position.set(i * 0.16 - 0.07, 0.62 + i * 0.18, 0.06);
        bloom.rotation.y = i * 1.8 + phase;
        foliage.add(bloom);
        const stalk = propPart(
          bloom,
          [0.016, 0.6, 0.016],
          [0, -0.3, 0],
          stemMaterial,
        );
        stalk.rotation.z = -0.12;
        for (let j = 0; j < 3; j++) {
          const petal = new THREE.Mesh(leafGeometry, orange);
          petal.scale.set(0.21, 0.21 + j * 0.028, 0.65);
          petal.rotation.z = -0.4 + j * 0.28;
          bloom.add(petal);
        }
        const beak = new THREE.Mesh(leafGeometry, purple);
        beak.scale.set(0.27, 0.24, 0.8);
        beak.rotation.z = -1.3;
        bloom.add(beak);
      }
    }
    group.position.set(x, baseY, z);
    group.scale.setScalar(scale);
    parent.add(group);
    contactShadow(group, {
      floorY: parent === interior && !baseY ? 0.018 / scale : 0,
      width: 0.24,
      depth: 0.24,
      spread: 0.105,
      opacity: 0.28,
      round: true,
    });
    plants.push({ foliage, phase, update: updateFoliage });
    return group;
  }

  return {
    plant,
    shelf(x: number, z: number) {
      const shelf = new THREE.Group();
      shelf.position.set(x, 0.018, z);
      interior.add(shelf);
      const frame = standard("#547b73", 1),
        wood = standard("#a57e51", 1);
      for (const sx of [-0.57, 0.57])
        for (const sz of [-0.19, 0.19])
          propPart(shelf, [0.045, 1.45, 0.045], [sx, 0.725, sz], frame);
      for (const y of [0.13, 0.68, 1.23])
        propPart(shelf, [1.25, 0.055, 0.5], [0, y, 0], wood);
      plant("bird", -0.26, 0, 0.62, 1.1, 1.26, shelf);
      plant("flytrap", 0.32, 0.025, 0.78, 1.4, 1.26, shelf);
      plant("succulent", -0.34, 0.02, 0.64, 2.1, 0.71, shelf);
      plant("trailing", 0.3, -0.02, 0.61, 0.8, 0.71, shelf);
      plant("rubber", -0.3, 0, 0.46, 1.3, 0.16, shelf);
      propPart(shelf, [0.25, 0.23, 0.27], [0.28, 0.28, 0], standard("#b56b4d"));
      contactShadow(shelf, {
        width: 1.2,
        depth: 0.45,
        spread: 0.13,
        opacity: 0.25,
      });
      return shelf;
    },
    update(elapsed: number, reduced: boolean) {
      plants.forEach(({ foliage, phase, update }) => {
        if (update) { update(elapsed,reduced); return; }
        foliage.rotation.z = reduced
          ? 0
          : Math.sin(elapsed * 0.92 + phase) * 0.018;
        foliage.rotation.y = reduced
          ? 0
          : Math.sin(elapsed * 0.57 + phase) * 0.025;
      });
    },
  };
}
