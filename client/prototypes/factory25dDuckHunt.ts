import * as THREE from "three";
import { requireElement } from "./dom";

/** A short local arcade round. Hit awards are idempotent within each flight. */
export class DuckRound {
  remaining = 0;
  score = 0;
  shots = 3;
  hit = new Set<number>();
  get active() {
    return this.remaining > 0;
  }
  start() {
    this.remaining = 30;
    this.score = 0;
    this.newFlight();
  }
  newFlight() {
    this.shots = 3;
    this.hit.clear();
  }
  shoot(target: number | null) {
    if (!this.active || this.shots === 0) return false;
    this.shots--;
    if (target === null || this.hit.has(target)) return false;
    this.hit.add(target);
    this.score++;
    return true;
  }
  tick(dt: number) {
    this.remaining = Math.max(
      0,
      this.remaining - Math.max(0, Math.min(dt, 0.1)),
    );
  }
}

function duckTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 24;
  const ctx = canvas.getContext("2d")!;
  for (let frame = 0; frame < 3; frame++) {
    const offset = frame * 32;
    const rect = (
      color: string,
      x: number,
      y: number,
      w: number,
      h: number,
    ) => {
      ctx.fillStyle = color;
      ctx.fillRect(offset + x, y, w, h);
    };
    rect("#263839", 5, 10, 19, 9);
    rect("#263839", 3, 8, 7, 7);
    rect("#886950", 7, 11, 16, 6);
    rect("#b39268", 8, 11, 12, 2);
    rect("#e0d5b6", 19, 9, 4, 7);
    rect("#1b5848", 21, 4, 7, 8);
    rect("#347762", 22, 4, 5, 3);
    rect("#d59a42", 27, 8, 5, 3);
    rect("#182c30", 25, 6, 1, 1);
    rect("#e2d9b1", 26, 6, 1, 1);
    rect(
      "#4b615d",
      10,
      frame === 0 ? 3 : frame === 1 ? 10 : 14,
      8,
      frame === 1 ? 5 : 7,
    );
    rect("#8fada0", 11, frame === 0 ? 3 : frame === 1 ? 10 : 18, 6, 2);
    rect("#427b9c", 11, frame === 0 ? 7 : frame === 1 ? 12 : 17, 6, 2);
    rect("#d19949", 10, 19, 5, 1);
    rect("#d19949", 16, 18, 4, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(1 / 3, 1);
  return texture;
}

export function createDuckHunt(scene: THREE.Scene, canvas: HTMLCanvasElement) {
  const round = new DuckRound();
  const play = requireElement<HTMLButtonElement>("#duck-play");
  const reload = requireElement<HTMLButtonElement>("#duck-reload");
  const status = requireElement<HTMLElement>("#duck-status");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const texture = duckTexture();
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    alphaTest: 0.1,
    roughness: 1,
    emissive: "#283f40",
    emissiveIntensity: 0.55,
    side: THREE.DoubleSide,
  });
  const ducks = [0, 1].map((i) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), material);
    mesh.visible = false;
    scene.add(mesh);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "duck-target";
    button.hidden = true;
    button.setAttribute("aria-label", `Shoot duck ${i + 1}`);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      shoot(i);
    });
    canvas.parentElement!.append(button);
    return { mesh, button, fall: 0 };
  });
  let flight = 0,
    wave = 0,
    enabled = false,
    wasActive = false,
    text = "";
  let best = 0;
  try {
    best = Math.max(
      0,
      Math.min(
        999,
        Number(localStorage.getItem("factory-patio-ducks-best")) || 0,
      ),
    );
  } catch {
    /* Play without storage. */
  }
  function announce() {
    const next = round.active
      ? `${round.score} hit · ${round.shots}/3 shots · ${Math.ceil(round.remaining)}s`
      : `best ${best} · local arcade`;
    if (text !== next) {
      status.textContent = next;
      text = next;
    }
  }
  function shoot(index: number | null) {
    if (!enabled) return;
    if (round.shoot(index) && index !== null) ducks[index].fall = 0.001;
    announce();
  }
  play.addEventListener("click", () => {
    if (round.active) {
      round.remaining = 0;
    } else {
      round.start();
      flight = 0;
      wave = 0;
      ducks.forEach((duck) => {
        duck.fall = 0;
      });
    }
    announce();
  });
  reload.addEventListener("click", () => {
    if (round.active) {
      round.shots = 3;
      announce();
    }
  });
  canvas.addEventListener("click", () => {
    if (round.active) shoot(null);
  });
  document.addEventListener("keydown", (event) => {
    if (
      !round.active ||
      !enabled ||
      event.key.toLowerCase() !== "r" ||
      event.target instanceof HTMLInputElement
    )
      return;
    event.preventDefault();
    round.shots = 3;
    announce();
  });
  const point = new THREE.Vector3();
  return {
    update(dt: number, camera: THREE.Camera, visible: boolean) {
      enabled =
        visible &&
        !document.hidden &&
        !document.body.classList.contains("inspect-open");
      if (!visible && round.active) round.remaining = 0;
      if (enabled) round.tick(dt);
      if (wasActive && !round.active) {
        best = Math.max(best, round.score);
        try {
          localStorage.setItem("factory-patio-ducks-best", String(best));
        } catch {
          /* A local session can still score. */
        }
      }
      wasActive = round.active;
      play.textContent = round.active ? "end round" : "duck hunt";
      reload.hidden = !round.active;
      if (enabled) announce();
      if (round.active && enabled) {
        flight += dt;
        if (
          flight > 7 ||
          (round.hit.size === 2 && ducks.every((duck) => duck.fall > 0.7))
        ) {
          flight = 0;
          wave++;
          round.newFlight();
          ducks.forEach((duck) => {
            duck.fall = 0;
          });
        }
      }
      texture.offset.x = (Math.floor(flight * 7) % 3) / 3;
      ducks.forEach(({ mesh, button }, i) => {
        const duck = ducks[i];
        if (duck.fall && enabled) duck.fall += dt;
        const direction = (wave + i) % 2 ? -1 : 1;
        const t = Math.min(1, flight / 6.6);
        const x = reduced.matches
          ? 13 + i * 5
          : 16 + direction * (t * 13 - 6.5);
        const y =
          1.7 +
          i * 0.75 +
          (reduced.matches ? 0 : Math.sin(flight * 1.5 + i) * 0.26);
        mesh.position.set(x, y - Math.min(duck.fall, 1) * 1.6, -4.36);
        mesh.scale.x = direction;
        mesh.rotation.z = duck.fall
          ? direction * Math.min(duck.fall * 2, 1.2)
          : 0;
        mesh.visible = round.active && duck.fall < 0.75;
        button.hidden = !mesh.visible || Boolean(duck.fall) || !enabled;
        if (button.hidden) return;
        point.copy(mesh.position).project(camera);
        button.style.left = `${((point.x + 1) * canvas.clientWidth) / 2 - 22}px`;
        button.style.top = `${((1 - point.y) * canvas.clientHeight) / 2 - 22}px`;
      });
    },
  };
}
