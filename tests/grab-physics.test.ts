import { describe, expect, it } from 'vitest';
import {
  GRAB_LIFT_HEIGHT,
  GRAB_MAX_STRETCH,
  GRAB_REST_LENGTH,
  fabricWedge,
  hangPoint,
  landingPoint,
  limitFabricStretch,
  resolveReturnTarget,
  stepHeldTether,
  trackAirborneFloor,
} from '../client/grab/physics';
import { GrabMotion } from '../client/grab/GrabMotion';

const BOUNDS = { minX: 18, maxX: 782, minY: 58, maxY: 462 };

function settle(motion: GrabMotion, seconds: number, dt = 1 / 60): string {
  let last = '';
  for (let t = 0; t < seconds; t += dt) last = motion.step(dt);
  return last;
}

describe('grab geometry', () => {
  it('places the floor below the pointer, band, body and lift height', () => {
    const floor = landingPoint({ x: 100, y: 100 }, -1, 1, BOUNDS);
    expect(floor).toEqual({ x: 100, y: 100 + GRAB_REST_LENGTH + 1 + GRAB_LIFT_HEIGHT });
    // A hair anchor sits higher on the body, so the body hangs lower under the same pointer.
    expect(landingPoint({ x: 100, y: 100 }, -12, 1, BOUNDS).y).toBe(floor.y + 11);
    // Half-scale avatars use half the offsets.
    expect(landingPoint({ x: 100, y: 100 }, -1, 0.5, BOUNDS).y).toBe(100 + (GRAB_REST_LENGTH + 1 + GRAB_LIFT_HEIGHT) / 2);
    expect(hangPoint(floor, 1)).toEqual({ x: 100, y: floor.y - GRAB_LIFT_HEIGHT });
  });

  it('keeps the landing spot inside the walkable room', () => {
    expect(landingPoint({ x: -50, y: 1_000 }, -1, 1, BOUNDS)).toEqual({ x: BOUNDS.minX, y: BOUNDS.maxY });
    expect(landingPoint({ x: 900, y: -100 }, -1, 1, BOUNDS)).toEqual({ x: BOUNDS.maxX, y: BOUNDS.minY });
  });

  it('walks back to the in-flight destination, else to where the avatar stood', () => {
    expect(resolveReturnTarget({ isMoving: true, targetX: 5, targetY: 6, x: 1, y: 2 })).toEqual({ x: 5, y: 6 });
    expect(resolveReturnTarget({ isMoving: false, targetX: 5, targetY: 6, x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
  });
});

describe('GrabMotion lifecycle', () => {
  it('stays grounded while fabric stretches, then lifts when the tether goes taut', () => {
    const motion = new GrabMotion(-1, 1, BOUNDS);
    motion.begin({ x: 100, y: 299 }, { x: 100, y: 300 });

    motion.setPointer({ x: 100, y: 280 });
    settle(motion, 0.25);
    expect(motion.body.y).toBe(300);
    expect(motion.lift).toBe(0);

    motion.setPointer({ x: 100, y: 240 });
    motion.step(1 / 60);
    expect(motion.body.y).toBeLessThan(300);

    const anchorY = motion.body.y - 1;
    expect(Math.hypot(motion.body.x - 100, anchorY - 240))
      .toBeCloseTo(GRAB_REST_LENGTH * GRAB_MAX_STRETCH, 5);
  });

  it('latches airborne after liftoff and ignores the floor until released', () => {
    const motion = new GrabMotion(-1, 1, BOUNDS);
    motion.begin({ x: 100, y: 299 }, { x: 100, y: 300 });
    motion.setPointer({ x: 100, y: 220 });
    settle(motion, 0.2);
    const liftedY = motion.body.y;
    expect(liftedY).toBeLessThan(300);
    expect(motion.isAirborne).toBe(true);

    motion.setPointer({ x: 100, y: 320 });
    settle(motion, 0.5);
    expect(motion.body.y).toBeGreaterThan(liftedY);
    expect(motion.body.y).toBeGreaterThan(300);
    expect(motion.phase).toBe('held');
    expect(motion.isAirborne).toBe(true);
    expect(motion.floor.y - motion.body.y).toBe(GRAB_LIFT_HEIGHT);

    motion.release();
    expect(motion.phase).toBe('falling');
    settle(motion, 0.5);
    expect(motion.phase).toBe('idle');
    expect(motion.body.y).toBe(motion.floor.y);
    expect(motion.isAirborne).toBe(false);
  });

  it('turns an initial downward pull into an upward pickup gesture', () => {
    const motion = new GrabMotion(-1, 1, BOUNDS);
    motion.begin({ x: 100, y: 305 }, { x: 100, y: 300 });
    expect(motion.grip.y).toBe(293);
    motion.setPointer({ x: 100, y: 350 });
    settle(motion, 0.2);
    expect(motion.body.y).toBeLessThan(300);
    expect(motion.isAirborne).toBe(true);
  });

  it('follows pointer moves and drops onto the floor derived from the release pointer', () => {
    const motion = new GrabMotion(-1, 1, BOUNDS);
    motion.begin({ x: 300, y: 232 }, { x: 300, y: 233 });
    motion.setPointer({ x: 400, y: 150 });
    settle(motion, 0.25);
    expect(motion.body.x).toBeGreaterThan(300);
    expect(Math.hypot(motion.body.x - 400, motion.body.y - 1 - 150))
      .toBeLessThanOrEqual(GRAB_REST_LENGTH * GRAB_MAX_STRETCH + 0.001);

    const expectedFloor = { ...motion.floor };
    motion.release({ x: 420, y: 160 });
    expect(motion.phase).toBe('falling');
    expect(motion.floor).toEqual(expectedFloor);

    const events: string[] = [];
    for (let i = 0; i < 120; i++) {
      const result = motion.step(1 / 60);
      events.push(result);
      if (result === 'landed') break;
    }
    expect(events.filter(e => e === 'landed')).toHaveLength(1);
    expect(events.some(e => e === 'falling')).toBe(true);
    expect(motion.body).toMatchObject({ x: expectedFloor.x, y: expectedFloor.y });
    expect(motion.lift).toBe(0);
    expect(motion.phase).toBe('idle');
    expect(motion.step(1 / 60)).toBe('idle');
  });

  it('never launches upward on release and keeps its moving drop floor in bounds', () => {
    const motion = new GrabMotion(-1, 1, BOUNDS);
    motion.begin({ x: 100, y: 99 }, { x: 100, y: 5_000 });
    motion.setPointer({ x: 100, y: 20 });
    motion.step(1 / 60);
    motion.release();
    expect(motion.body.vy).toBe(0);
    expect(motion.floor.x).toBeGreaterThanOrEqual(BOUNDS.minX);
    expect(motion.floor.x).toBeLessThanOrEqual(BOUNDS.maxX);
    expect(motion.floor.y).toBeGreaterThanOrEqual(BOUNDS.minY);
    expect(motion.floor.y).toBeLessThanOrEqual(BOUNDS.maxY);
  });

  it('ignores releases when idle and can be cancelled instantly', () => {
    const motion = new GrabMotion(-1, 1, BOUNDS);
    motion.release({ x: 0, y: 0 });
    expect(motion.phase).toBe('idle');
    motion.begin({ x: 100, y: 100 }, { x: 100, y: 100 });
    motion.cancel();
    expect(motion.phase).toBe('idle');
  });
});

describe('lifted fabric wedge', () => {
  it('moves the airborne shadow under the avatar and uses it as a bounded drop point', () => {
    const body = { x: 760, y: 430, vx: 0, vy: 0 };
    const floor = { x: 100, y: 200 };
    trackAirborneFloor(body, floor, 1, BOUNDS);
    expect(floor).toEqual({ x: 760, y: 450 });
    expect(body).toMatchObject({ x: 760, y: 430 });

    body.x = 900;
    body.y = 500;
    trackAirborneFloor(body, floor, 1, BOUNDS);
    expect(floor).toEqual({ x: BOUNDS.maxX, y: BOUNDS.maxY });
    expect(body).toMatchObject({ x: BOUNDS.maxX, y: 500 });

    body.x = 100;
    body.y = -40;
    trackAirborneFloor(body, floor, 1, BOUNDS);
    expect(floor).toEqual({ x: 100, y: BOUNDS.minY });
    expect(body).toMatchObject({ x: 100, y: -40 });
  });

  it('uses gravity and the fabric limit as an analogue ground-to-air tether', () => {
    const body = { x: 100, y: 200, vx: 0, vy: 0 };
    stepHeldTether(body, { x: 100, y: 190 }, 200, 0, 1, 1 / 60);
    expect(body.y).toBe(200);
    stepHeldTether(body, { x: 100, y: 100 }, 200, 0, 1, 1 / 60);
    expect(body.y).toBeCloseTo(100 + GRAB_REST_LENGTH * GRAB_MAX_STRETCH);
  });

  it('removes outward velocity when fabric reaches its stretch limit', () => {
    const body = { x: 100, y: 200, vx: 10, vy: 40 };
    limitFabricStretch(body, { x: 100, y: 100 }, 0, 1);
    expect(body.y).toBeCloseTo(100 + GRAB_REST_LENGTH * GRAB_MAX_STRETCH);
    expect(body.vy).toBeCloseTo(0);
    expect(body.vx).toBe(10);
  });

  it('pinches at the pointer and widens horizontally across the shoulders', () => {
    const fabric = fabricWedge({ x: 100.4, y: 80.6 }, { x: 106.2, y: 120.4 }, 7, GRAB_REST_LENGTH);
    expect(fabric.tip).toEqual({ x: 100, y: 81 });
    expect(fabric.leftShoulder).toEqual({ x: 99, y: 120 });
    expect(fabric.centerShoulder).toEqual({ x: 106, y: 120 });
    expect(fabric.rightShoulder).toEqual({ x: 113, y: 120 });
  });

  it('reports how taut the lifted fabric is', () => {
    const taut = fabricWedge({ x: 100, y: 100 }, { x: 100, y: 100 + GRAB_REST_LENGTH * 2 }, 7, GRAB_REST_LENGTH);
    expect(taut.stretch).toBeCloseTo(2);
    const relaxed = fabricWedge({ x: 100, y: 100 }, { x: 100, y: 100 + GRAB_REST_LENGTH }, 7, GRAB_REST_LENGTH);
    expect(relaxed.stretch).toBeCloseTo(1);
  });

  it('keeps tiny avatars readable with a minimum-width base', () => {
    const fabric = fabricWedge({ x: 10, y: 10 }, { x: 10, y: 20 }, 0.5, GRAB_REST_LENGTH);
    expect(fabric.leftShoulder.x).toBe(8);
    expect(fabric.rightShoulder.x).toBe(12);
  });
});
