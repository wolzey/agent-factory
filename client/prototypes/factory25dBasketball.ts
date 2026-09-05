import * as THREE from "three";
import { propPart, standard } from "./factory25dProps";
import { contactShadow } from "./factory25dContactShadows";
import { stepToward, type FloorPoint } from "./factory25dKeyboardState";

const BALL_RADIUS = 0.073;

/** The scoring plane belongs below the rim: a sideways or upward crossing is no basket. */
export function crossedBasket(
  before: THREE.Vector3,
  after: THREE.Vector3,
  rim: THREE.Vector3,
  radius = 0.15,
) {
  if (before.y <= rim.y || after.y > rim.y) return false;
  const t = (before.y - rim.y) / (before.y - after.y);
  return (
    Math.hypot(
      THREE.MathUtils.lerp(before.x, after.x, t) - rim.x,
      THREE.MathUtils.lerp(before.z, after.z, t) - rim.z,
    ) <
    radius - 0.035
  );
}

function miniBall(parent: THREE.Object3D) {
  const group = new THREE.Group();
  parent.add(group);
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 12, 8),
    standard("#ff6908", 1, "#371000"),
  );
  sphere.castShadow = sphere.receiveShadow = true;
  group.add(sphere);
  const seam = standard("#553828", 1);
  for (const rotation of [
    [Math.PI / 2, 0, 0],
    [0, Math.PI / 2, 0],
    [0, 0, Math.PI / 4],
  ]) {
    const line = new THREE.Mesh(
      new THREE.TorusGeometry(BALL_RADIUS + 0.001, 0.0035, 3, 20),
      seam,
    );
    line.rotation.set(...(rotation as [number, number, number]));
    group.add(line);
  }
  return group;
}

type Player = { name: string; position: THREE.Vector3; home: FloorPoint };
interface BasketballSounds {
  tap?: () => void;
  swish?: () => void;
  bounce?: (energy: number) => void;
}
export function createBasketball(
  parent: THREE.Group,
  canvas: HTMLCanvasElement,
  players: Player[],
  sounds: BasketballSounds = {},
) {
  const hoopScale = 0.84;
  const rim = new THREE.Vector3(1.3, 1.68, -6.18 + 0.22 * hoopScale);
  const hoop = new THREE.Group();
  // Leave space in front of the wet glass so the board and its hardware read clearly.
  hoop.position.set(rim.x, 0, -6.18);
  hoop.scale.setScalar(hoopScale);
  hoop.position.y = rim.y * (1 - hoopScale);
  parent.add(hoop);
  const frame = standard('#36484c', 0.8);
  const orange = standard('#ef6925', 0.75, '#271005');
  const boardY = rim.y + 0.23;
  const mountingSteel = standard('#a9bbbf', 0.55);
  for (const x of [-0.35, 0.35]) for (const y of [-0.35, 0.35]) {
    propPart(hoop, [0.045, 0.045, 0.09], [x, boardY + y, -0.033], frame);
    propPart(hoop, [0.023, 0.023, 0.009], [x, boardY + y, 0.029], mountingSteel);
  }
  const boardMaterial = new THREE.MeshStandardMaterial({
    color: '#c2e0e5', roughness: 0.12, metalness: 0.08,
    transparent: true, opacity: 0.12, depthWrite: false,
  });
  const board = propPart(hoop, [0.8, 0.8, 0.046], [0, boardY, 0], boardMaterial);
  board.castShadow = false;
  board.receiveShadow = false;
  for (const x of [-0.402, 0.402])
    propPart(hoop, [0.021, 0.82, 0.057], [x, boardY, 0], frame);
  for (const y of [boardY - 0.4, boardY + 0.4])
    propPart(hoop, [0.8, 0.021, 0.057], [0, y, 0], frame);
  // A complete shooting square, with the rim attached at its lower edge.
  for (const x of [-0.16, 0.16])
    propPart(hoop, [0.018, 0.25, 0.008], [x, rim.y + 0.14, 0.029], orange);
  for (const y of [rim.y + 0.015, rim.y + 0.265])
    propPart(hoop, [0.338, 0.018, 0.008], [0, y, 0.029], orange);
  propPart(hoop, [0.1, 0.08, 0.026], [0, rim.y, 0.04], orange);
  propPart(hoop, [0.064, 0.026, 0.15], [0, rim.y, 0.12], orange);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 32), orange);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, rim.y, 0.22);
  hoop.add(ring);
  const netPoints: THREE.Vector3[] = [];
  const netPoint = (row: number, column: number) => {
    const angle = (column + (row % 2) * 0.5) / 12 * Math.PI * 2;
    const radius = [0.145, 0.128, 0.095, 0.075][row];
    return new THREE.Vector3(Math.cos(angle) * radius, rim.y - row * 0.085 - 0.013, 0.22 + Math.sin(angle) * radius);
  };
  for (let row = 0; row < 3; row++) for (let i = 0; i < 12; i++) {
    netPoints.push(netPoint(row, i), netPoint(row + 1, i));
    netPoints.push(netPoint(row, i), netPoint(row + 1, i + (row % 2 ? 1 : -1)));
  }
  hoop.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(netPoints),
    new THREE.LineBasicMaterial({ color: '#e5e1cf' })));
  const ball = miniBall(parent),
    spare = miniBall(parent);
  spare.position.set(2.55, BALL_RADIUS, -5.72);
  ball.position.set(0.7, BALL_RADIUS, -5.65);
  contactShadow(parent, {
    x: 2.55,
    z: -5.72,
    width: 0.12,
    depth: 0.12,
    opacity: 0.25,
    spread: 0.055,
    round: true,
  });
  const ballShadow = contactShadow(parent, {
    x: 0.7,
    z: -5.65,
    width: 0.12,
    depth: 0.12,
    opacity: 0.27,
    spread: 0.055,
    round: true,
  });
  const tallyCanvas = document.createElement("canvas");
  tallyCanvas.width = 768;
  tallyCanvas.height = 384;
  const ctx = tallyCanvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(tallyCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  const tally = new THREE.Mesh(
    new THREE.PlaneGeometry(1.45, 0.725),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: 0.87,
    }),
  );
  tally.position.set(1.35, 0.86, -6.245);
  tally.rotation.z = -0.018;
  parent.add(tally);
  let scores = players.map(() => 0);
  try {
    const saved = JSON.parse(
      localStorage.getItem("factory-window-hoops-v1") ?? "null",
    );
    if (Array.isArray(saved) && saved.length === scores.length)
      scores = saved.map((v) =>
        Number.isSafeInteger(v) && v >= 0 && v < 100000 ? v : 0,
      );
  } catch {
    /* Local game still works. */
  }
  const call = document.createElement("button");
  call.type = "button";
  call.className = "basket-call";
  call.title = "call an agent for a shot";
  canvas.parentElement!.append(call);
  function paintScore() {
    ctx.clearRect(0, 0, 768, 384);
    ctx.fillStyle = '#24374a';
    ctx.strokeStyle = '#24374a';
    ctx.font = '700 55px "Board Marker", cursive';
    ctx.save(); ctx.rotate(-0.022);
    ctx.fillText('window hoops', 38, 66);
    ctx.restore();
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(34, 82); ctx.quadraticCurveTo(193, 91, 354, 82); ctx.stroke();
    players.forEach((player, i) => {
      ctx.save(); ctx.translate(40, 147 + i * 81); ctx.rotate(i ? 0.014 : -0.016);
      ctx.font = '700 51px "Board Marker", cursive';
      ctx.fillText(player.name.toLowerCase(), 0, 0);
      ctx.font = '700 58px "Board Marker", cursive';
      ctx.fillText(String(scores[i]), 410, 3);
      ctx.restore();
    });
    ctx.globalAlpha = 0.7;
    ctx.font = '700 31px "Board Marker", cursive';
    ctx.fillText('scores on this window', 40, 333);
    ctx.globalAlpha = 1;
    texture.needsUpdate = true;
    call.setAttribute(
      "aria-label",
      `Call an agent for a basketball shot. ${players.map((p, i) => `${p.name}: ${scores[i]}`).join(", ")}. Scores on this device.`,
    );
  }
  paintScore();
  void document.fonts.load('700 32px "Board Marker"').then(paintScore);
  let active = -1,
    stage: "walk" | "aim" | "throw" | "bank" | "drop" | "bounce" | "return" =
      "walk";
  let wait = 38,
    time = 0,
    attempt = 0,
    queued = false,
    jump = 0,
    scored = false;
  let route: FloorPoint[] = [],
    returnRoute: FloorPoint[] = [];
  const start = new THREE.Vector3(),
    impact = new THREE.Vector3(),
    previous = new THREE.Vector3();
  const project = new THREE.Vector3();
  const aisle = [
    { x: 6.5, z: 4.45 },
    { x: 6.5, z: 2.85 },
    { x: 7.45, z: 2.85 },
    { x: 7.45, z: -4.93 },
  ];
  call.addEventListener("click", () => {
    queued = true;
    wait = 0;
  });
  function startTurn() {
    active = attempt % players.length;
    attempt++;
    const player = players[active];
    const approach =
      active === 0
        ? [
            { x: -2.5, z: -2.65 },
            { x: -2.5, z: -5.03 },
          ]
        : aisle;
    route = [...approach, { x: 1.3, z: -5.02 }];
    returnRoute = [...approach].reverse().concat(player.home);
    stage = "walk";
    time = 0;
    jump = 0;
    scored = false;
    queued = false;
  }
  function nextStage(next: typeof stage) {
    stage = next;
    time = 0;
  }
  return {
    get active() {
      return active >= 0;
    },
    get player() {
      return active;
    },
    get jump() {
      return jump;
    },
    get posing() {
      return active >= 0 && !["walk", "return"].includes(stage);
    },
    update(
      dt: number,
      camera: THREE.Camera,
      visible: boolean,
      free: boolean,
      reduced: boolean,
    ) {
      call.hidden =
        !visible || document.body.classList.contains("inspect-open");
      if (!call.hidden) {
        parent.localToWorld(project.copy(rim)).project(camera);
        const x = ((project.x + 1) * canvas.clientWidth) / 2,
          y = ((1 - project.y) * canvas.clientHeight) / 2;
        call.style.left = `${x - 22}px`;
        call.style.top = `${y - 42}px`;
      }
      if (
        !visible ||
        document.hidden ||
        document.body.classList.contains("inspect-open")
      )
        return;
      dt = Math.min(0.1, Math.max(0, dt));
      if (active < 0) {
        if (free && (!reduced || queued)) wait -= dt;
        if (wait <= 0 && free) startTurn();
        else return;
      }
      time += dt;
      const player = players[active];
      if (stage === "walk" || stage === "return") {
        const next = stepToward(player.position, route[0], dt * 1.65);
        player.position.x = next.x;
        player.position.z = next.z;
        if (Math.hypot(next.x - route[0].x, next.z - route[0].z) < 0.001) {
          route.shift();
          if (!route.length) {
            if (stage === "walk") nextStage("aim");
            else {
              active = -1;
              wait = queued ? 0 : 100;
              ball.position.set(0.7, BALL_RADIUS, -5.65);
            }
          }
        }
      } else if (stage === "aim") {
        ball.position.set(player.position.x, 0.61, player.position.z - 0.12);
        jump = reduced ? 0 : Math.sin(Math.min(1, time / 0.8) * Math.PI) * 0.12;
        ball.position.y += jump;
        if (time >= 0.6) {
          start.copy(ball.position);
          impact.set(rim.x + (attempt % 3 === 0 ? 0.3 : 0), rim.y + 0.22 * hoopScale, hoop.position.z + 0.032 * hoopScale);
          nextStage("throw");
        }
      } else if (stage === "throw") {
        const t = Math.min(1, time / 0.7);
        ball.position.lerpVectors(start, impact, t);
        ball.position.y += Math.sin(t * Math.PI) * 0.62;
        jump = reduced ? 0 : Math.max(0, 0.06 - time * 0.3);
        if (t === 1) {
          sounds.tap?.();
          start.copy(ball.position);
          nextStage("bank");
        }
      } else if (stage === "bank") {
        const t = Math.min(1, time / 0.3);
        ball.position.lerpVectors(
          start,
          new THREE.Vector3(impact.x, rim.y + 0.08, rim.z),
          t,
        );
        if (t === 1) {
          start.copy(ball.position);
          nextStage("drop");
        }
      } else if (stage === "drop") {
        previous.copy(ball.position);
        ball.position.y = start.y - 2.2 * time * time;
        if (!scored && crossedBasket(previous, ball.position, rim, 0.15 * hoopScale)) {
          scored = true;
          sounds.swish?.();
          scores[active]++;
          paintScore();
          try {
            localStorage.setItem(
              "factory-window-hoops-v1",
              JSON.stringify(scores),
            );
          } catch {
            /* Session score stays available. */
          }
        }
        if (ball.position.y <= BALL_RADIUS) {
          ball.position.y = BALL_RADIUS;
          sounds.bounce?.(1);
          start.copy(ball.position);
          nextStage("bounce");
        }
      } else if (stage === "bounce") {
        // Only the first two diminishing floor contacts; no frame-rate-dependent chatter.
        const contact = Math.floor(time * 9 / Math.PI);
        if (contact > Math.floor((time - dt) * 9 / Math.PI) && contact <= 2)
          sounds.bounce?.(Math.exp(-time * 4));
        ball.position.z = start.z + Math.min(1, time) * 0.42;
        ball.position.y =
          BALL_RADIUS + Math.abs(Math.sin(time * 9)) * Math.exp(-time * 4) * 0.32;
        if (time > 1.2) {
          route = returnRoute;
          nextStage("return");
        }
      }
      ball.rotation.x += dt * 3;
      ball.rotation.z += dt * 1.3;
      ballShadow.position.x = ball.position.x;
      ballShadow.position.z = ball.position.z;
      ballShadow.scale.set(
        0.23 * (1 + ball.position.y * 0.13),
        0.23 * (1 + ball.position.y * 0.13),
        1,
      );
      canvas.dataset.basketball = active < 0 ? "resting" : stage;
      canvas.dataset.baskets = String(scores.reduce((a, b) => a + b, 0));
    },
  };
}
