import type { AvatarConfig } from './types.js';

// Indices match the terminal designer and the shared character painter.
export const AVATAR_STYLES = {
  hairStyle: ['short', 'spiky', 'long', 'cap', 'mohawk', 'bald', 'afro', 'bandana'],
  facialHair: ['none', 'stubble', 'mustache', 'beard', 'goatee', 'soul patch'],
  mouthStyle: ['default', 'smile', 'frown', 'open', 'grin', 'tongue out'],
  faceAccessory: ['none', 'glasses', 'sunglasses', 'monocle', 'eye patch', 'visor'],
  headAccessory: ['none', 'crown', 'top hat', 'halo', 'horns', 'antenna', 'flower'],
  shirtDesign: ['solid', 'horizontal stripe', 'vertical stripe', 'heart', 'star', 'number 1', 'skull', 'checkerboard', 'diamond', 'lightning', 'dots', 'cross'],
} as const;
export const AVATAR_COLORS = ['color', 'hairColor', 'skinTone', 'shirtColor', 'pantsColor', 'shoeColor'] as const;

/** Strict write validation; never silently replace a malformed saved appearance. */
export function parseAvatarConfig(value: unknown): AvatarConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const allowed = new Set<string>(['spriteIndex', 'hat', 'trail', 'graphicDeath', ...AVATAR_COLORS, ...Object.keys(AVATAR_STYLES)]);
  if (Object.keys(raw).some(key => !allowed.has(key))) return null;
  if (!Number.isInteger(raw.spriteIndex) || Number(raw.spriteIndex) < 0 || Number(raw.spriteIndex) > 7) return null;
  if (typeof raw.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(raw.color)) return null;
  for (const key of ['hat', 'trail']) if (raw[key] !== null && (typeof raw[key] !== 'string' || (raw[key] as string).length > 40)) return null;
  for (const key of AVATAR_COLORS) if (raw[key] !== undefined && (typeof raw[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(raw[key] as string))) return null;
  for (const [key, options] of Object.entries(AVATAR_STYLES)) {
    if (raw[key] !== undefined && (!Number.isInteger(raw[key]) || Number(raw[key]) < 0 || Number(raw[key]) >= options.length)) return null;
  }
  if (raw.graphicDeath !== undefined && typeof raw.graphicDeath !== 'boolean') return null;
  return { ...raw } as unknown as AvatarConfig;
}
