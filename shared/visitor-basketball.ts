export interface BallVector { x: number; y: number; z: number }
export const VISITOR_BALL_RADIUS = .073;
export const VISITOR_BALL_RIM: BallVector = { x: 1.3, y: 1.68, z: -6.18 + .22 * .84 };
export type VisitorBallInput = { type: 'visitor_ball'; phase: 'hold' | 'throw'; position: BallVector; velocity?: BallVector }
  | { type: 'visitor_ball'; phase: 'cancel' };
export type VisitorBallUpdate = { type: 'visitor_ball_update'; visitorId: string; serverTime: number } &
  ({ phase: 'hold' | 'throw'; position: BallVector; velocity?: BallVector } | { phase: 'cancel' });

export function validBallVector(value: unknown, velocity = false): value is BallVector {
  if (!value || typeof value !== 'object') return false;
  const p = value as BallVector;
  if (![p.x, p.y, p.z].every(v => typeof v === 'number' && Number.isFinite(v))) return false;
  return velocity ? Math.abs(p.x) <= 10 && Math.abs(p.y) <= 10 && Math.abs(p.z) <= 10
    : p.x >= -7.8 && p.x <= 7.8 && p.y >= VISITOR_BALL_RADIUS && p.y <= 4 && p.z >= -6.12 && p.z <= 8.3;
}

/** A gentle arc toward the release target, shared by keyboard and pointer shots. */
export function visitorShotVelocity(start: BallVector, aim: BallVector = VISITOR_BALL_RIM): BallVector {
  const flight = Math.max(Math.sqrt(2 * Math.max(0, aim.y - start.y) / 9.8) + .18,
    Math.min(.9, .52 + Math.hypot(aim.x - start.x, aim.z - start.z) * .12));
  const limit = (n: number) => Math.max(-10, Math.min(10, n));
  return { x: limit((aim.x - start.x) / flight), y: limit((aim.y - start.y) / flight + 4.9 * flight), z: limit((aim.z - start.z) / flight) };
}
export interface FlyingBall { position: BallVector; velocity: BallVector; scored: boolean }
/** Fixed substeps keep floor, glass and rim contacts consistent on slow frames. */
export function stepVisitorBall(ball: FlyingBall, seconds: number): { swish: boolean; bounce: number } {
  let remaining = Math.max(0, Math.min(.1, seconds)), swish = false, bounce = 0;
  const p = ball.position, v = ball.velocity, rim = VISITOR_BALL_RIM;
  while (remaining > 0) {
    const dt = Math.min(remaining, 1 / 120); remaining -= dt;
    const before = { ...p };
    p.x += v.x * dt; p.y += v.y * dt - 4.9 * dt * dt; p.z += v.z * dt; v.y -= 9.8 * dt;
    if (!ball.scored && before.y > rim.y && p.y <= rim.y) {
      const t = (before.y - rim.y) / (before.y - p.y);
      const distance = Math.hypot(before.x + (p.x - before.x) * t - rim.x, before.z + (p.z - before.z) * t - rim.z);
      if (distance < .15 * .84 - .035) { ball.scored = true; swish = true; }
      else if (distance < .15 * .84 + VISITOR_BALL_RADIUS && distance > .075) { p.y = rim.y + .01; v.y = Math.abs(v.y) * .48; bounce = Math.max(bounce, .4); }
    }
    if (p.z < -6.12) { p.z = -6.12; v.z = Math.abs(v.z) * .62; bounce = Math.max(bounce, .3); }
    if (p.y < VISITOR_BALL_RADIUS) {
      p.y = VISITOR_BALL_RADIUS; bounce = Math.max(bounce, Math.min(1, Math.abs(v.y) / 5));
      v.y = Math.abs(v.y) > .5 ? Math.abs(v.y) * .46 : 0; v.x *= .78; v.z *= .78;
    }
    if (Math.abs(p.x) > 7.75) { p.x = Math.sign(p.x) * 7.75; v.x *= -.5; }
    if (p.z > 8.25) { p.z = 8.25; v.z = -Math.abs(v.z) * .5; }
  }
  return { swish, bounce };
}
