import type { FacingDirection, Position } from './types.js';

export function isInShotCorridor(
  shooter: Position,
  target: Position,
  facing: FacingDirection,
  range = 200,
  halfWidth = 28,
): boolean {
  const dx = target.x - shooter.x;
  const dy = target.y - shooter.y;

  switch (facing) {
    case 'left': return dx < 0 && -dx <= range && Math.abs(dy) <= halfWidth;
    case 'right': return dx > 0 && dx <= range && Math.abs(dy) <= halfWidth;
    case 'up': return dy < 0 && -dy <= range && Math.abs(dx) <= halfWidth;
    case 'down': return dy > 0 && dy <= range && Math.abs(dx) <= halfWidth;
  }
}
