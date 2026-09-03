import type { AvatarConfig } from '@shared/types';
import { DEFAULT_AVATAR, HAIR_COLORS, SHIRT_COLORS } from '@shared/constants';

export type GrabAnchorKind = 'collar' | 'hair';

/** Where the elastic attaches on the avatar, in unscaled 32px-frame pixels from the sprite centre. */
export interface GrabAnchor {
  kind: GrabAnchorKind;
  offsetX: number;
  offsetY: number;
  /** Elastic band colour (0xrrggbb): the shirt for a collar grab, the hair for a hair grab. */
  color: number;
}

/** Hair styles long enough to be lifted by (indices into HAIR_STYLE_NAMES). */
export const LONG_HAIR_STYLES: ReadonlySet<number> = new Set([2]); // 'Long Sides'

// drawCharacter() paints the collar on frame row 15 and the hair from row 4 (frame origin is the centre).
const COLLAR_ANCHOR = { offsetX: 0, offsetY: -1 } as const;
const HAIR_ANCHOR = { offsetX: 0, offsetY: -12 } as const;

/** Parse '#rrggbb' into 0xrrggbb, falling back when the string is not a colour. */
export function hexToColor(hex: string | undefined, fallback: number): number {
  if (!hex) return fallback;
  const value = parseInt(hex.replace('#', ''), 16);
  return Number.isNaN(value) || hex.replace('#', '').length !== 6 ? fallback : value;
}

/** Channel-wise multiply, matching how a Phaser tint darkens a texture. */
export function multiplyColors(a: number, b: number): number {
  const channel = (shift: number) => Math.round((((a >> shift) & 0xff) * ((b >> shift) & 0xff)) / 255);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Scale every channel by `factor` (>1 lightens, <1 darkens), clamped to 0..255. */
export function shadeColor(color: number, factor: number): number {
  const channel = (shift: number) => Math.min(255, Math.max(0, Math.round(((color >> shift) & 0xff) * factor)));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

function pickAnchor(hairStyle: number, hairColor: number, shirtColor: number, tint: number | null): GrabAnchor {
  const longHair = LONG_HAIR_STYLES.has(hairStyle);
  const base = longHair ? hairColor : shirtColor;
  const color = tint === null ? base : multiplyColors(base, tint);
  return longHair
    ? { kind: 'hair', ...HAIR_ANCHOR, color }
    : { kind: 'collar', ...COLLAR_ANCHOR, color };
}

/**
 * Anchor for a custom avatar whose colours are baked into its own sprite sheet.
 * Mirrors resolveAvatar() fallbacks in BootScene. `tint` is an extra multiply (e.g. zombie green).
 */
export function resolveGrabAnchor(avatar: AvatarConfig | undefined, tint: number | null = null): GrabAnchor {
  const spriteIdx = avatar?.spriteIndex ?? 0;
  const hairStyle = avatar?.hairStyle ?? (spriteIdx % 8);
  const hairColor = hexToColor(avatar?.hairColor ?? HAIR_COLORS[spriteIdx % HAIR_COLORS.length].hex, 0x332211);
  const shirtColor = hexToColor(avatar?.shirtColor ?? avatar?.color ?? DEFAULT_AVATAR.color, 0x4a90d9);
  return pickAnchor(hairStyle, hairColor, shirtColor, tint);
}

/**
 * Anchor for a legacy `agent_N` sheet (used by pre-customisation avatars and every subagent).
 * Those sheets use SHIRT_COLORS[N % 8] / HAIR_COLORS[N] and hair style N % 8, then get tinted
 * as a whole, so the visible colour is the sheet colour multiplied by the tint.
 */
export function resolveSheetGrabAnchor(spriteIndex: number, tint: number | null): GrabAnchor {
  const idx = ((spriteIndex % 8) + 8) % 8;
  const hairColor = hexToColor(HAIR_COLORS[idx % HAIR_COLORS.length].hex, 0x332211);
  const shirtColor = hexToColor(SHIRT_COLORS[idx].hex, 0x4a90d9);
  return pickAnchor(idx, hairColor, shirtColor, tint);
}
