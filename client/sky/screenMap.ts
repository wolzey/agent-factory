/**
 * Pure mapping between world pixels and CSS pixels for the scaled game canvas. Phaser's
 * FIT scaling keeps the aspect ratio, so one uniform scale applies on both axes; the view
 * is the visible world rectangle (800 wide, `height` tall, starting at `top`).
 */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ViewSpec {
  width: number;
  height: number;
  /** World y at the top of the canvas (negative when headroom is exposed above the room). */
  top: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function viewScale(canvas: ScreenRect, view: ViewSpec): number {
  return canvas.width / view.width;
}

export function worldToScreen(point: Point, canvas: ScreenRect, view: ViewSpec): Point {
  const scale = viewScale(canvas, view);
  return { x: canvas.left + point.x * scale, y: canvas.top + (point.y - view.top) * scale };
}

export function screenToWorld(point: Point, canvas: ScreenRect, view: ViewSpec): Point {
  const scale = viewScale(canvas, view);
  return { x: (point.x - canvas.left) / scale, y: (point.y - canvas.top) / scale + view.top };
}

export function worldRectToScreen(rect: WorldRect, canvas: ScreenRect, view: ViewSpec): ScreenRect {
  const scale = viewScale(canvas, view);
  const origin = worldToScreen({ x: rect.x, y: rect.y }, canvas, view);
  return { left: origin.x, top: origin.y, width: rect.width * scale, height: rect.height * scale };
}
