import type { AvatarConfig } from '@shared/types';
import { resolveAvatar, drawCharacter, hexToInt } from '../rendering/avatarPainter';

/** Keep the existing terminal avatar contract; accept only display fields. */
export function readAvatar(value: unknown): AvatarConfig | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const color = (key: string, fallback: string) => typeof raw[key] === 'string' && /^#[0-9a-f]{6}$/i.test(raw[key] as string) ? raw[key] as string : fallback;
  const index = (key: string, max: number, fallback = 0) => Number.isInteger(raw[key]) && Number(raw[key]) >= 0 && Number(raw[key]) <= max ? Number(raw[key]) : fallback;
  const result: AvatarConfig = { spriteIndex: index('spriteIndex', 7), color: color('color', '#4a90d9'), hat: typeof raw.hat === 'string' ? raw.hat.slice(0, 40) : null, trail: typeof raw.trail === 'string' ? raw.trail.slice(0, 40) : null };
  // Legacy fields stay optional, so their sprite-index defaults remain intact.
  for (const [key, max] of [['hairStyle',7],['facialHair',5],['mouthStyle',5],['faceAccessory',5],['headAccessory',6],['shirtDesign',11]] as const)
    if (raw[key] !== undefined) result[key] = index(key, max);
  for (const key of ['hairColor','skinTone','shirtColor','pantsColor','shoeColor'] as const)
    if (typeof raw[key] === 'string' && /^#[0-9a-f]{6}$/i.test(raw[key] as string)) result[key] = color(key, '#4a90d9');
  return result;
}
export const AVATAR_ANIMATIONS = ['idle', 'walk_right', 'walk_left', 'walk_down', 'walk_up', 'work', 'sit'];
export function avatarSheet(avatar: AvatarConfig) {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 224;
  const ctx = canvas.getContext('2d')!;
  const colors = resolveAvatar(avatar);
  for (const [row, animation] of AVATAR_ANIMATIONS.entries()) for (let frame = 0; frame < 4; frame++)
    drawCharacter(ctx, frame * 32, row * 32, 32, hexToInt(colors.shirtColor), animation, frame, colors);
  // Ground by visible pixels for each frame, including different shoes and strides.
  const pixels = ctx.getImageData(0, 0, 128, 224).data;
  const feet = AVATAR_ANIMATIONS.map((_, row) => Array.from({length:4}, (_, frame) => {
    for (let y = 31; y >= 0; y--) for (let x = 0; x < 32; x++)
      if (pixels[((row * 32 + y) * 128 + frame * 32 + x) * 4 + 3] >= 20) return y + 1;
    return 32;
  }));
  return { canvas, feet };
}
