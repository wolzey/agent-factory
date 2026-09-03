/**
 * Viewport geometry for the game canvas.
 *
 * The room itself is an 800x480 world and every gameplay coordinate (slots, control
 * bounds, grab physics, multiplayer positions) lives in that space untouched. The
 * canvas is taller than the room: `WALL_HEADROOM` extra rows are exposed above world
 * y = 0 by scrolling the main camera, and that headroom plus the original 44px wall
 * band form the back wall that holds the skyline window.
 */
export const WORLD_WIDTH = 800;
export const WORLD_HEIGHT = 480;
/** Rows of back wall exposed above world y = 0. */
export const WALL_HEADROOM = 84;
/** Height of the neon header band that sits on the wall above the window frame. */
export const HEADER_HEIGHT = 16;
/** Height of the rendered canvas in world pixels. */
export const VIEW_HEIGHT = WORLD_HEIGHT + WALL_HEADROOM;
/** World y of the top of the canvas. */
export const VIEW_TOP = -WALL_HEADROOM;

/** The back wall band: from the top of the canvas to the original wall edge at y = 44. */
export const WALL_BAND = { top: VIEW_TOP, bottom: 44 } as const;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Glass area of the skyline window: below the header band, above the original wall edge. */
export function skylineWindowRect(): Rect {
  const y = WALL_BAND.top + HEADER_HEIGHT + 2;
  return { x: 16, y, width: WORLD_WIDTH - 32, height: WALL_BAND.bottom - 4 - y };
}

/** Centre of the small neon title header mounted on the wall above the window frame. */
export function titleHeaderPosition(): { x: number; y: number } {
  return { x: WORLD_WIDTH / 2, y: WALL_BAND.top + HEADER_HEIGHT / 2 + 1 };
}
