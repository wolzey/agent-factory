/**
 * Things that hang in front of the skyline glass (wall neon signs, posters) and the window
 * mullions. Partner towers are placed so their sign panels never sit behind any of them.
 * All ranges are in glass-local x pixels.
 */
export type Range = readonly [number, number];

export interface GlassRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HangingSign {
  x: number;
  y: number;
  text: string;
}

export interface HangingProp {
  x: number;
  y: number;
  scale: number;
}

/** Monospace 11px wall signs: roughly 6.6px per character plus the 8px panel padding. */
const SIGN_CHAR_WIDTH = 6.6;
const SIGN_PADDING = 8;
/** Prop textures used on the wall are 16px wide before scaling. */
const PROP_TEXTURE_WIDTH = 16;
const MARGIN = 2;

export function mullionRanges(width: number, panes: number): Range[] {
  const count = Math.max(1, Math.floor(panes));
  const paneWidth = width / count;
  const bar = Math.max(2, Math.round(width / 256));
  const ranges: Range[] = [];
  for (let i = 1; i < count; i++) {
    const mx = Math.round(i * paneWidth);
    ranges.push([mx - MARGIN, mx + bar + MARGIN]);
  }
  return ranges;
}

/** Glass-local x ranges covered by signs and props whose centre lies inside the glass band. */
export function hangingObstacleRanges(signs: readonly HangingSign[], props: readonly HangingProp[], glass: GlassRect): Range[] {
  const inBand = (y: number) => y >= glass.y && y <= glass.y + glass.height;
  const ranges: Range[] = [];
  for (const sign of signs) {
    if (!inBand(sign.y)) continue;
    const half = (sign.text.length * SIGN_CHAR_WIDTH + SIGN_PADDING) / 2;
    ranges.push([Math.floor(sign.x - half - MARGIN - glass.x), Math.ceil(sign.x + half + MARGIN - glass.x)]);
  }
  for (const prop of props) {
    if (!inBand(prop.y)) continue;
    const half = (PROP_TEXTURE_WIDTH * prop.scale) / 2;
    ranges.push([Math.floor(prop.x - half - MARGIN - glass.x), Math.ceil(prop.x + half + MARGIN - glass.x)]);
  }
  return ranges;
}

export function rangesOverlap(a: Range, b: Range): boolean {
  return a[0] < b[1] && b[0] < a[1];
}
