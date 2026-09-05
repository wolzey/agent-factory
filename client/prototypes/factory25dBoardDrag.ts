import * as THREE from "three";
import type { FloorPoint } from "./factory25dKeyboardState";

const storageKey = "factory25d-board-position-v1";
import { INDOOR_COLUMNS, INDOOR_ROWS } from "./factory25dWorkstations";
export function boardPositionIsClear(point: FloorPoint) {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.z) &&
    point.x >= -7.25 &&
    point.x <= 7.25 &&
    point.z >= -4.7 &&
    point.z <= 2.6 &&
    !INDOOR_COLUMNS.some((x) =>
      INDOOR_ROWS.some(
        (z) => Math.abs(point.x - x) < 0.99 && Math.abs(point.z - z) < 0.79,
      ),
    )
  );
}

/** Inertial travel uses the same collision sweep as a direct drag. */
export function coastBoard(from: FloorPoint, velocity: FloorPoint, dt: number) {
  dt = Math.max(0, Math.min(0.033, dt));
  const desired = { x: from.x + velocity.x * dt, z: from.z + velocity.z * dt };
  const position = moveBoard(from, desired),
    decay = Math.exp(-6.5 * dt);
  return {
    position,
    velocity: {
      x: Math.abs(position.x - desired.x) > 0.0001 ? 0 : velocity.x * decay,
      z: Math.abs(position.z - desired.z) > 0.0001 ? 0 : velocity.z * decay,
    },
  };
}

/** Sweep short steps so a fast drag cannot tunnel through a cabinet. */
export function moveBoard(from: FloorPoint, requested: FloorPoint): FloorPoint {
  const to = {
    x: THREE.MathUtils.clamp(requested.x, -7.25, 7.25),
    z: THREE.MathUtils.clamp(requested.z, -4.7, 2.6),
  };
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.1),
  );
  const dx = (to.x - from.x) / steps,
    dz = (to.z - from.z) / steps;
  let result = { ...from };
  for (let i = 0; i < steps; i++) {
    const next = { x: result.x + dx, z: result.z + dz };
    if (boardPositionIsClear(next)) result = next;
    else {
      if (boardPositionIsClear({ x: next.x, z: result.z })) result.x = next.x;
      if (boardPositionIsClear({ x: result.x, z: next.z })) result.z = next.z;
    }
  }
  return result;
}

export function installBoardDragging(
  board: THREE.Group,
  button: HTMLButtonElement,
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  available: () => boolean,
  changed: () => void,
) {
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  let drag: {
    id: number;
    screenX: number;
    screenY: number;
    hit: FloorPoint;
    start: FloorPoint;
    moved: boolean;
  } | null = null;
  let suppressClick = false;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let velocity: FloorPoint = { x: 0, z: 0 },
    coasting = false,
    lastMove = 0,
    lastUpdate = performance.now();
  const restingYaw = board.rotation.y;
  let yawVelocity = 0;
  // Geometry pivots at the top grip; floor contact decals stay on the ground.
  const pivot = new THREE.Group();
  pivot.position.y = 1.34;
  const solids = board.children.filter(
    (child) => child.type === "Group" || child.castShadow,
  );
  for (const child of solids) {
    child.position.y -= 1.34;
    pivot.add(child);
  }
  board.add(pivot);
  const position = () => ({ x: board.position.x, z: board.position.z });
  function place(point: FloorPoint) {
    board.position.x = point.x;
    board.position.z = point.z;
    changed();
  }
  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(position()));
    } catch {
      /* Session dragging still works. */
    }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (saved && boardPositionIsClear(saved)) place(saved);
  } catch {
    /* Ignore an invalid or unavailable saved position. */
  }
  function floorPoint(event: PointerEvent): FloorPoint | null {
    const box = canvas.getBoundingClientRect();
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - box.left) / box.width) * 2 - 1,
        1 - ((event.clientY - box.top) / box.height) * 2,
      ),
      camera,
    );
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    board.parent!.updateWorldMatrix(true, false);
    const local = board.parent!.worldToLocal(hit.clone());
    return { x: local.x, z: local.z };
  }
  function finish(cancel = false) {
    if (!drag) return;
    const previous = drag;
    drag = null;
    if (cancel) {
      place(previous.start);
      velocity = { x: 0, z: 0 };
      coasting = false;
    } else if (previous.moved) {
      coasting =
        !reduced.matches &&
        performance.now() - lastMove < 100 &&
        Math.hypot(velocity.x, velocity.z) > 0.03;
      if (!coasting) {
        velocity = { x: 0, z: 0 };
        save();
      }
    }
    suppressClick = previous.moved;
    if (button.hasPointerCapture(previous.id))
      button.releasePointerCapture(previous.id);
    document.body.classList.remove("board-dragging");
  }
  button.style.touchAction = "none";
  button.title = "click to read · drag to roll · shift + arrow keys to move";
  button.setAttribute("aria-describedby", "board-drag-help");
  button.addEventListener("pointerdown", (event) => {
    if (drag || event.button !== 0 || !available()) return;
    const hit = floorPoint(event);
    if (!hit) return;
    suppressClick = false;
    coasting = false;
    velocity = { x: 0, z: 0 };
    lastMove = performance.now();
    drag = {
      id: event.pointerId,
      screenX: event.clientX,
      screenY: event.clientY,
      hit,
      start: position(),
      moved: false,
    };
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.screenX, event.clientY - drag.screenY) < 6
    )
      return;
    const point = floorPoint(event);
    if (!point) return;
    drag.moved = true;
    document.body.classList.add("board-dragging");
    event.preventDefault();
    const before = position(),
      now = performance.now(),
      dt = Math.max(0.008, (now - lastMove) / 1000);
    const next = moveBoard(before, {
      x: drag.start.x + point.x - drag.hit.x,
      z: drag.start.z + point.z - drag.hit.z,
    });
    velocity = {
      x: THREE.MathUtils.clamp((next.x - before.x) / dt, -2.4, 2.4),
      z: THREE.MathUtils.clamp((next.z - before.z) / dt, -2.4, 2.4),
    };
    lastMove = now;
    place(next);
  });
  button.addEventListener("pointerup", (event) => {
    if (drag?.id === event.pointerId) finish();
  });
  button.addEventListener("pointercancel", (event) => {
    if (drag?.id === event.pointerId) finish(true);
  });
  button.addEventListener("lostpointercapture", () => finish(true));
  button.addEventListener(
    "click",
    (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
  button.addEventListener("keydown", (event) => {
    if (!available() || !event.shiftKey) return;
    const directions: Record<string, FloorPoint> = {
      ArrowLeft: { x: -0.2, z: 0 },
      ArrowRight: { x: 0.2, z: 0 },
      ArrowUp: { x: 0, z: -0.2 },
      ArrowDown: { x: 0, z: 0.2 },
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    place(
      moveBoard(position(), {
        x: board.position.x + direction.x,
        z: board.position.z + direction.z,
      }),
    );
    save();
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || !drag) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finish(true);
    },
    true,
  );
  window.addEventListener("blur", () => {
    finish(true);
    coasting = false;
    velocity = { x: 0, z: 0 };
    save();
  });
  window.addEventListener("resize", () => finish(true));
  return {
    update(now: number) {
      const dt = Math.min(0.033, Math.max(0, (now - lastUpdate) / 1000));
      lastUpdate = now;
      if (!available() && (coasting || drag)) {
        finish(true);
        coasting = false;
        velocity = { x: 0, z: 0 };
        save();
      }
      if (coasting) {
        const next = coastBoard(position(), velocity, dt);
        velocity = next.velocity;
        place(next.position);
        if (reduced.matches || Math.hypot(velocity.x, velocity.z) < 0.015) {
          coasting = false;
          velocity = { x: 0, z: 0 };
          save();
        }
      }
      const target =
        !reduced.matches && (drag?.moved || coasting)
          ? THREE.MathUtils.clamp(-velocity.x * 0.04, -0.095, 0.095)
          : 0;
      const angle = board.rotation.y - restingYaw;
      yawVelocity += ((target - angle) * 72 - yawVelocity * 13) * dt;
      const nextYaw = reduced.matches
        ? restingYaw
        : board.rotation.y + yawVelocity * dt;
      const lean = reduced.matches
        ? 0
        : THREE.MathUtils.damp(pivot.rotation.z, target * 0.22, 12, dt);
      if (
        Math.abs(nextYaw - board.rotation.y) > 0.00001 ||
        Math.abs(lean - pivot.rotation.z) > 0.00001
      ) {
        board.rotation.y = nextYaw;
        pivot.rotation.z = lean;
        changed();
      }
    },
  };
}
