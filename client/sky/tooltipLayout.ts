/** Placement for the skyline tooltip: above its target, clamped inside the allowed bounds. */
export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TooltipPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  /** World x of the little notch pointing at the target. */
  notchX: number;
  /** True when the tooltip had to sit below the target instead of above it. */
  below: boolean;
}

/**
 * Centre the tooltip above `target` with `gap` pixels of clearance, then clamp it into
 * `bounds`. If there is no room above (the header band, for example), place it below.
 */
export function placeTooltip(target: TargetRect, width: number, height: number, bounds: Bounds, gap = 4): TooltipPlacement {
  const centerX = target.x + target.width / 2;
  let x = Math.round(centerX - width / 2);
  x = Math.max(bounds.left, Math.min(bounds.right - width, x));
  let y = Math.round(target.y - gap - height);
  let below = false;
  if (y < bounds.top) {
    y = Math.round(target.y + target.height + gap);
    below = true;
  }
  y = Math.max(bounds.top, Math.min(bounds.bottom - height, y));
  const notchX = Math.max(x + 3, Math.min(x + width - 3, Math.round(centerX)));
  return { x, y, width, height, notchX, below };
}
