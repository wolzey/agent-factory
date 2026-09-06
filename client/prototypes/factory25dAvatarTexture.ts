import * as THREE from 'three';
import type { AvatarConfig } from '@shared/types';
import { avatarSheet, AVATAR_ANIMATIONS } from './factory25dAvatar';

/** Share painted pixels, but keep each sprite's frame offsets and lifetime independent. */
export function avatarTexture(avatar: AvatarConfig, animations: readonly string[] = AVATAR_ANIMATIONS) {
  const sheet = avatarSheet(avatar, animations), texture = new THREE.CanvasTexture(sheet.canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false; texture.repeat.set(.25, 1 / animations.length);
  return { sheet, texture };
}
