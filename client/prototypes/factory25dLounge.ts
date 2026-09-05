import * as THREE from "three";
import { propPart, standard } from "./factory25dProps";
import { signTexture } from "./factory25dLabels";
import type { BoardData } from "./factory25dBoardData";
import { createLoungeChat } from "./factory25dLoungeChat";
import { contactShadow } from "./factory25dContactShadows";

/** Small matte props and two local light sources keep the lounge warm after dark. */
export function createLoungeDetails(
  parent: THREE.Group,
  canvas: HTMLCanvasElement,
  camera: THREE.OrthographicCamera,
  renderer: THREE.WebGLRenderer,
) {
  const wood = standard("#775441", 1);
  const leg = standard("#42362f", 1);
  const table = new THREE.Group();
  table.position.set(2.15, 0.018, 5.95);
  parent.add(table);
  propPart(table, [0.84, 0.07, 0.65], [0, 0.38, 0], wood);
  for (const x of [-0.31, 0.31])
    for (const z of [-0.22, 0.22]) {
      propPart(table, [0.055, 0.35, 0.055], [x, 0.175, z], leg);
      contactShadow(table, {
        x,
        z,
        width: 0.07,
        depth: 0.07,
        spread: 0.05,
        opacity: 0.24,
      });
    }
  contactShadow(table, {
    width: 0.72,
    depth: 0.55,
    spread: 0.15,
    opacity: 0.13,
  });

  const candle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.062, 0.14, 8),
    standard("#dfc18e", 1),
  );
  candle.position.set(0.1, 0.49, -0.05);
  candle.castShadow = true;
  candle.receiveShadow = true;
  table.add(candle);
  propPart(
    table,
    [0.013, 0.03, 0.013],
    [0.1, 0.569, -0.05],
    standard("#392b24"),
  );
  const flame = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.03),
    new THREE.MeshBasicMaterial({ color: "#ffd58c" }),
  );
  flame.scale.set(0.6, 1.5, 0.6);
  flame.position.set(0.1, 0.604, -0.05);
  table.add(flame);
  const candleLight = new THREE.PointLight("#ffb863", 0.8, 3.4, 2);
  candleLight.position.copy(flame.position);
  candleLight.castShadow = true;
  candleLight.shadow.mapSize.set(256, 256);
  candleLight.shadow.camera.near = 0.04;
  candleLight.shadow.bias = -0.002;
  candleLight.shadow.normalBias = 0.015;
  table.add(candleLight);

  const bag = new THREE.Group();
  bag.position.set(0.8, 0.018, 8.15);
  bag.rotation.y = Math.atan2(2.15 - 0.8, 5.95 - 8.15);
  parent.add(bag);
  const fabric = standard("#dc7538", 1, "#281008");
  fabric.flatShading = true;
  const cushion = new THREE.SphereGeometry(1, 18, 12);
  const vertices = cushion.getAttribute("position");
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i),
      y = vertices.getY(i),
      z = vertices.getZ(i);
    const top = Math.max(0, y);
    const lean = 1 - top * 0.13;
    const seat = Math.exp(-(x * x + (z - 0.24) * (z - 0.24)) * 6) * top * 0.25;
    vertices.setXYZ(
      i,
      x * 0.57 * lean * (1 + 0.025 * Math.sin(z * 16)),
      Math.max(
        0.015,
        (y + 1) * 0.43 +
          top * Math.max(0, -z) * 0.38 -
          seat -
          top * Math.max(0, z + 0.15) * 0.23,
      ),
      z * 0.59 * lean - top * 0.08,
    );
  }
  cushion.computeVertexNormals();
  const beanbag = new THREE.Mesh(cushion, fabric);
  beanbag.castShadow = beanbag.receiveShadow = true;
  bag.add(beanbag);
  const seamMaterial = new THREE.LineBasicMaterial({ color: "#b86130" });
  for (const side of [-1, 1]) {
    const seamPoints = [
      new THREE.Vector3(side * 0.38, 0.12, 0.33),
      new THREE.Vector3(side * 0.48, 0.22, 0.02),
      new THREE.Vector3(side * 0.31, 0.48, -0.32),
      new THREE.Vector3(side * 0.08, 0.65, -0.27),
    ];
    bag.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(seamPoints),
        seamMaterial,
      ),
    );
  }
  propPart(
    bag,
    [0.11, 0.025, 0.04],
    [0.05, 0.58, -0.39],
    standard("#efb67a", 1),
  );
  contactShadow(bag, {
    width: 0.92,
    depth: 0.97,
    spread: 0.13,
    opacity: 0.3,
    round: true,
  });

  const ballGeometry = new THREE.IcosahedronGeometry(0.14, 2);
  const ballPositions = ballGeometry.getAttribute("position");
  const directions = new THREE.IcosahedronGeometry(1).getAttribute("position");
  const colors: number[] = [];
  const center = new THREE.Vector3(),
    axis = new THREE.Vector3();
  const pale = new THREE.Color("#e0dac5"),
    dark = new THREE.Color("#323b3e");
  for (let i = 0; i < ballPositions.count; i += 3) {
    center.set(0, 0, 0);
    for (let j = 0; j < 3; j++)
      center.add(new THREE.Vector3().fromBufferAttribute(ballPositions, i + j));
    center.normalize();
    let patch = false;
    for (let j = 0; j < directions.count; j++) {
      axis.fromBufferAttribute(directions, j).normalize();
      if (center.dot(axis) > 0.94) {
        patch = true;
        break;
      }
    }
    const color = patch ? dark : pale;
    for (let j = 0; j < 3; j++) colors.push(color.r, color.g, color.b);
  }
  ballGeometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colors, 3),
  );
  const ball = new THREE.Mesh(
    ballGeometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      flatShading: true,
    }),
  );
  ball.position.set(2.8, 0.158, 7.12);
  ball.rotation.set(0.15, 0.25, 0.2);
  ball.castShadow = ball.receiveShadow = true;
  parent.add(ball);
  contactShadow(parent, {
    x: 2.8,
    z: 7.12,
    floorY: 0.018,
    width: 0.22,
    depth: 0.22,
    spread: 0.08,
    opacity: 0.27,
    round: true,
  });

  const lamp = new THREE.Group();
  lamp.position.set(-4.85, 0.53, 4.62);
  parent.add(lamp);
  const brass = standard("#947a48", 0.85);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.15, 0.035, 8),
    brass,
  );
  base.position.y = 0.018;
  base.castShadow = base.receiveShadow = true;
  lamp.add(base);
  propPart(lamp, [0.03, 0.34, 0.03], [0, 0.2, 0], brass);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.24, 0.19, 8),
    standard("#cfae73", 1, "#51341b"),
  );
  shade.position.y = 0.46;
  shade.castShadow = shade.receiveShadow = true;
  lamp.add(shade);
  const bulb = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.055),
    new THREE.MeshBasicMaterial({ color: "#ffe0a3" }),
  );
  bulb.position.y = 0.345;
  lamp.add(bulb);
  const lampLight = new THREE.SpotLight("#ffd39a", 4.5, 5.5, 1.12, 0.45, 2);
  lampLight.position.set(0, 0.35, 0.03);
  lampLight.target.position.set(0.1, -0.53, 0.65);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(512, 512);
  lampLight.shadow.camera.near = 0.05;
  lampLight.shadow.bias = -0.0004;
  lampLight.shadow.normalBias = 0.01;
  lamp.add(lampLight, lampLight.target);
  contactShadow(lamp, {
    width: 0.24,
    depth: 0.24,
    spread: 0.05,
    opacity: 0.2,
    round: true,
  });

  // Pixel lettering emits light, while a separate source spills onto nearby furniture.
  const neon = new THREE.Group();
  neon.position.set(2.5, 1.12, 3.76);
  parent.add(neon);
  propPart(neon, [1.66, 0.42, 0.06], [0, 0, 0], standard("#271c38", 1));
  const neonFace = new THREE.Mesh(
    new THREE.PlaneGeometry(1.55, 0.3),
    new THREE.MeshBasicMaterial({
      map: signTexture("LOUNGE", "#ffc0ea", "#271c38", 2, 1.55 / 0.3),
    }),
  );
  neonFace.position.z = 0.034;
  neon.add(neonFace);
  const neonWash = new THREE.PointLight("#f284d9", 5.2, 4.5, 2);
  neonWash.position.set(0, 0.02, 0.23);
  neon.add(neonWash);
  for (const x of [-0.56, 0.56])
    propPart(
      neon,
      [0.025, 0.82, 0.03],
      [x, -0.52, -0.03],
      standard("#403346", 1),
    );
  // A shaded floor lamp gives the couch its own warm pool, with one shadow map.
  const floorLamp = new THREE.Group();
  floorLamp.position.set(3.25, 0.018, 5.18);
  parent.add(floorLamp);
  propPart(floorLamp, [0.27, 0.035, 0.27], [0, 0.018, 0], brass);
  propPart(floorLamp, [0.028, 1.22, 0.028], [0, 0.62, 0], brass);
  const floorShade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.28, 0.32, 10),
    standard("#d9b481", 1, "#432912"),
  );
  floorShade.position.y = 1.21;
  floorLamp.add(floorShade);
  const pool = new THREE.SpotLight("#ffc58c", 5.8, 5, 1.05, 0.6, 2);
  pool.position.set(0, 1.04, 0);
  pool.target.position.set(-0.5, 0, 0.5);
  pool.castShadow = true;
  pool.shadow.mapSize.set(256, 256);
  pool.shadow.camera.near = 0.05;
  pool.shadow.bias = -0.001;
  floorLamp.add(pool, pool.target);
  contactShadow(floorLamp, {
    width: 0.27,
    depth: 0.27,
    spread: 0.09,
    opacity: 0.25,
  });
  const activity = createLoungeChat(parent, canvas, camera, renderer);
  return {
    chat: activity,
    update(
      time: number,
      reduced: boolean,
      data: BoardData,
      camera: THREE.Camera,
      visible: boolean,
    ) {
      activity.update(performance.now(), data, visible);
      const flicker = reduced
        ? 0
        : Math.sin(time * 4.1) * 0.025 + Math.sin(time * 6.7) * 0.016;
      candleLight.intensity = 0.8 + flicker;
      flame.scale.y = 1.5 + flicker * 2;
    },
  };
}
