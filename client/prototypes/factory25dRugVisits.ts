import { FLOOR_KEYS, KEYBOARD_ORIGIN, stepToward, type FloorPoint } from './factory25dKeyboardState';

const home = { x: 4.55, z: 4.18 };
const entrance = { x: 4.55, z: 6.5 };

/** The idle lounge agent takes an occasional walk across several glowing keys. */
export class RugVisits {
  private wait = 12;
  private dwell = 0;
  private route: FloorPoint[] = [];
  get active() { return this.route.length > 0; }
  cancel() { this.route = []; this.dwell = 0; this.wait = 90; }
  update(dt: number, position: FloorPoint, enabled: boolean): FloorPoint {
    if (!enabled) return { x: position.x, z: position.z };
    dt = Math.max(0, Math.min(0.1, dt));
    if (!this.active) {
      this.wait -= dt;
      if (this.wait > 0) return { x: position.x, z: position.z };
      this.route = [entrance, ...[1, 13, 25, 30].map(i => ({ x: KEYBOARD_ORIGIN.x + FLOOR_KEYS[i].x, z: KEYBOARD_ORIGIN.z + FLOOR_KEYS[i].z })), entrance, home];
    }
    if (this.dwell > 0) { this.dwell -= dt; return { x: position.x, z: position.z }; }
    const next = stepToward(position, this.route[0], dt * 0.95);
    if (Math.hypot(next.x - this.route[0].x, next.z - this.route[0].z) < 0.001) {
      this.route.shift();
      this.dwell = next.z > 6.8 ? 0.65 : 0;
      if (!this.active) this.wait = 85;
    }
    return next;
  }
}
