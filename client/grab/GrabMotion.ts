import {
  GRAB_WORLD_BOUNDS,
  hangPoint,
  stepFall,
  stepHeldTether,
  trackAirborneFloor,
} from './physics';
import type { Bounds, Point, SpringState } from './physics';

export type GrabPhase = 'idle' | 'held' | 'falling';

/** A full-size agent avatar that the room can pick up. */
export interface Grabbable {
  /** World position of the body centre (Containers already provide these). */
  readonly x: number;
  readonly y: number;
  readonly isGrabbed: boolean;
  readonly isHeld: boolean;
  /** Held or falling: off the floor, so it leaves the floor-sorted depth band. */
  readonly isAirborne: boolean;
  /** Floor point beneath the avatar while its body is airborne. */
  readonly groundProjection: Point;
  beginGrab(pointer: Point): void;
  moveGrab(pointer: Point): void;
  releaseGrab(pointer?: Point): void;
  showGrabHint(text: string): void;
}

/**
 * Pure motion for one lifted avatar: fabric stretches while the body remains grounded,
 * becomes a taut tether that lifts continuously, then gravity drops the body on release.
 * Sprites read `body` each frame and apply it; no Phaser types live here so it is unit-testable.
 */
export class GrabMotion {
  phase: GrabPhase = 'idle';
  readonly pointer: Point = { x: 0, y: 0 };
  readonly body: SpringState = { x: 0, y: 0, vx: 0, vy: 0 };
  readonly floor: Point = { x: 0, y: 0 };
  private airborne = false;
  private invertVertical = false;
  private pickupAnchorY = 0;

  constructor(
    private readonly anchorOffsetY: number,
    private readonly scale: number,
    private readonly bounds: Bounds = GRAB_WORLD_BOUNDS,
  ) {}

  /** Height of the body above its floor shadow. */
  get lift(): number {
    return Math.max(0, this.floor.y - this.body.y);
  }

  /** Once true, floor contact stays disabled until this grab is released. */
  get isAirborne(): boolean {
    return this.airborne;
  }

  get hang(): Point {
    return hangPoint(this.floor, this.scale);
  }

  get grip(): Point {
    return this.invertVertical
      ? { x: this.pointer.x, y: this.pickupAnchorY * 2 - this.pointer.y }
      : this.pointer;
  }

  begin(pointer: Point, body: Point): void {
    this.body.x = body.x;
    this.body.y = body.y;
    this.body.vx = 0;
    this.body.vy = 0;
    this.floor.x = body.x;
    this.floor.y = body.y;
    this.airborne = false;
    this.pickupAnchorY = body.y + this.anchorOffsetY * this.scale;
    this.invertVertical = pointer.y > this.pickupAnchorY;
    this.phase = 'held';
    this.setPointer(pointer);
  }

  setPointer(pointer: Point): void {
    this.pointer.x = pointer.x;
    this.pointer.y = pointer.y;
  }

  release(pointer?: Point): void {
    if (this.phase === 'idle') return;
    if (pointer) this.setPointer(pointer);
    this.floor.x = Math.min(this.bounds.maxX, Math.max(this.bounds.minX, this.body.x));
    this.floor.y = Math.min(this.bounds.maxY, Math.max(this.bounds.minY, this.floor.y));
    this.phase = 'falling';
    this.body.vy = Math.max(0, this.body.vy); // never launch upward on release
  }

  cancel(): void {
    this.phase = 'idle';
    this.airborne = false;
  }

  /** Advance by `dt` seconds. Returns 'landed' exactly once, on the frame the fall completes. */
  step(dt: number): GrabPhase | 'landed' {
    const clamped = Math.min(Math.max(dt, 0), 0.05);
    if (this.phase === 'held') {
      stepHeldTether(
        this.body,
        this.grip,
        this.floor.y,
        this.anchorOffsetY,
        this.scale,
        clamped,
        !this.airborne,
      );
      if (this.body.y < this.floor.y - 0.01) this.airborne = true;
      if (this.airborne) trackAirborneFloor(this.body, this.floor, this.scale, this.bounds);
      return 'held';
    }
    if (this.phase === 'falling') {
      if (stepFall(this.body, this.floor, clamped)) {
        this.phase = 'idle';
        this.airborne = false;
        return 'landed';
      }
      return 'falling';
    }
    return 'idle';
  }
}
