import Phaser from 'phaser';
import type { AvatarConfig, EnvironmentType } from '@shared/types';
import { getTheme } from '../environments';
import type { EnvironmentTheme } from '../environments';

const AGENT_COLORS = [
  0x4a90d9, // blue
  0xff6b6b, // red
  0x51cf66, // green
  0xffd43b, // yellow
  0xcc5de8, // purple
  0xff922b, // orange
  0x20c997, // teal
  0xf06595, // pink
];

const HAIR_COLOR_HEXES = [
  '#332211', // dark brown
  '#664422', // medium brown
  '#222222', // black
  '#aa6633', // light brown
  '#880000', // dark red
  '#553311', // chestnut
  '#444444', // gray
  '#cc8844', // sandy blonde
];

// Hair style drawing functions per spriteIndex
type HairDrawFn = (ctx: CanvasRenderingContext2D, x: number, y: number, hairColor: string, bodyColor: string) => void;

const HAIR_STYLES: HairDrawFn[] = [
  // 0: Short flat
  (ctx, x, y, hc) => { ctx.fillStyle = hc; ctx.fillRect(x + 5, y, 6, 2); },
  // 1: Spiky
  (ctx, x, y, hc) => { ctx.fillStyle = hc; ctx.fillRect(x + 5, y + 1, 6, 2); ctx.fillRect(x + 6, y, 1, 1); ctx.fillRect(x + 8, y - 1, 1, 2); ctx.fillRect(x + 10, y, 1, 1); },
  // 2: Long sides
  (ctx, x, y, hc) => { ctx.fillStyle = hc; ctx.fillRect(x + 5, y, 6, 3); ctx.fillRect(x + 4, y + 2, 1, 4); ctx.fillRect(x + 11, y + 2, 1, 4); },
  // 3: Cap/hat (uses body color)
  (ctx, x, y, _hc, bc) => { ctx.fillStyle = bc; ctx.fillRect(x + 4, y, 8, 3); ctx.fillRect(x + 3, y + 2, 10, 1); },
  // 4: Mohawk
  (ctx, x, y, hc) => { ctx.fillStyle = hc; ctx.fillRect(x + 7, y - 2, 2, 4); ctx.fillRect(x + 5, y + 1, 6, 1); },
  // 5: Bald (no hair, just skin highlight)
  (ctx, x, y) => { ctx.fillStyle = '#ffddb3'; ctx.fillRect(x + 6, y, 4, 1); },
  // 6: Afro
  (ctx, x, y, hc) => { ctx.fillStyle = hc; ctx.fillRect(x + 4, y - 1, 8, 4); ctx.fillRect(x + 3, y, 1, 2); ctx.fillRect(x + 12, y, 1, 2); },
  // 7: Bandana (body colored)
  (ctx, x, y, _hc, bc) => { ctx.fillStyle = bc; ctx.fillRect(x + 4, y, 8, 2); ctx.fillRect(x + 3, y + 1, 1, 1); ctx.fillRect(x + 12, y + 1, 1, 1); },
];

// Mouth style drawing functions (fixed colors per style)
type FaceDrawFn = (ctx: CanvasRenderingContext2D, x: number, y: number, bounce: number) => void;

const MOUTH_STYLES: FaceDrawFn[] = [
  // 0: Default (none)
  () => {},
  // 1: Smile
  (ctx, x, y, b) => { ctx.fillStyle = '#cc6666'; ctx.fillRect(x + 7, y + 6 + b, 2, 1); },
  // 2: Frown
  (ctx, x, y, b) => { ctx.fillStyle = '#886666'; ctx.fillRect(x + 7, y + 6 + b, 2, 1); },
  // 3: Open
  (ctx, x, y, b) => { ctx.fillStyle = '#331111'; ctx.fillRect(x + 7, y + 5 + b, 2, 1); ctx.fillStyle = '#cc6666'; ctx.fillRect(x + 7, y + 6 + b, 2, 1); },
  // 4: Teeth Grin
  (ctx, x, y, b) => { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 7, y + 6 + b, 2, 1); },
  // 5: Tongue Out
  (ctx, x, y, b) => { ctx.fillStyle = '#ff6699'; ctx.fillRect(x + 7, y + 6 + b, 2, 1); },
];

// Facial hair drawing functions (uses hairColor)
type FacialHairDrawFn = (ctx: CanvasRenderingContext2D, x: number, y: number, bounce: number, hairColor: string) => void;

const FACIAL_HAIR_STYLES: FacialHairDrawFn[] = [
  // 0: None
  () => {},
  // 1: Stubble
  (ctx, x, y, b, hc) => { ctx.fillStyle = hc; ctx.globalAlpha = 0.5; ctx.fillRect(x + 6, y + 6 + b, 1, 1); ctx.fillRect(x + 8, y + 6 + b, 1, 1); ctx.fillRect(x + 9, y + 5 + b, 1, 1); ctx.globalAlpha = 1.0; },
  // 2: Mustache
  (ctx, x, y, b, hc) => { ctx.fillStyle = hc; ctx.fillRect(x + 6, y + 5 + b, 4, 1); },
  // 3: Full Beard
  (ctx, x, y, b, hc) => { ctx.fillStyle = hc; ctx.fillRect(x + 5, y + 5 + b, 6, 2); ctx.fillRect(x + 6, y + 7 + b, 4, 1); },
  // 4: Goatee
  (ctx, x, y, b, hc) => { ctx.fillStyle = hc; ctx.fillRect(x + 7, y + 5 + b, 2, 2); },
  // 5: Soul Patch
  (ctx, x, y, b, hc) => { ctx.fillStyle = hc; ctx.fillRect(x + 7, y + 6 + b, 2, 1); },
];

// Face accessory drawing functions (fixed colors, follows bounce + eyeY)
type FaceAccDrawFn = (ctx: CanvasRenderingContext2D, x: number, y: number, bounce: number, eyeY: number) => void;

const FACE_ACCESSORIES: FaceAccDrawFn[] = [
  // 0: None
  () => {},
  // 1: Round Glasses
  (ctx, x, y, b, ey) => {
    ctx.fillStyle = '#666666';
    // Left lens frame
    ctx.fillRect(x + 5, y + ey - 1 + b, 3, 1);
    ctx.fillRect(x + 5, y + ey + 1 + b, 3, 1);
    ctx.fillRect(x + 5, y + ey + b, 1, 1);
    ctx.fillRect(x + 7, y + ey + b, 1, 1);
    // Right lens frame
    ctx.fillRect(x + 8, y + ey - 1 + b, 3, 1);
    ctx.fillRect(x + 8, y + ey + 1 + b, 3, 1);
    ctx.fillRect(x + 8, y + ey + b, 1, 1);
    ctx.fillRect(x + 10, y + ey + b, 1, 1);
    // Bridge
    ctx.fillRect(x + 7, y + ey + b, 1, 1);
  },
  // 2: Sunglasses
  (ctx, x, y, b, ey) => {
    ctx.fillStyle = '#111111';
    ctx.fillRect(x + 5, y + ey + b, 3, 2);
    ctx.fillRect(x + 8, y + ey + b, 3, 2);
    ctx.fillStyle = '#333333';
    ctx.fillRect(x + 7, y + ey + b, 2, 1);
  },
  // 3: Monocle
  (ctx, x, y, b, ey) => {
    ctx.fillStyle = '#ccaa44';
    ctx.fillRect(x + 8, y + ey - 1 + b, 3, 1);
    ctx.fillRect(x + 8, y + ey + 1 + b, 3, 1);
    ctx.fillRect(x + 8, y + ey + b, 1, 1);
    ctx.fillRect(x + 10, y + ey + b, 1, 1);
    // Chain
    ctx.fillRect(x + 10, y + ey + 2 + b, 1, 2);
  },
  // 4: Eye Patch
  (ctx, x, y, b, ey) => {
    ctx.fillStyle = '#222222';
    ctx.fillRect(x + 5, y + ey - 1 + b, 3, 3);
    // Strap
    ctx.fillRect(x + 4, y + ey - 2 + b, 1, 1);
    ctx.fillRect(x + 8, y + ey - 2 + b, 4, 1);
  },
  // 5: Visor
  (ctx, x, y, b, ey) => {
    ctx.fillStyle = '#00ffff';
    ctx.globalAlpha = 0.7;
    ctx.fillRect(x + 4, y + ey + b, 8, 2);
    ctx.globalAlpha = 1.0;
  },
];

// Head accessory drawing functions (fixed colors, drawn on top of hair)
type HeadAccDrawFn = (ctx: CanvasRenderingContext2D, x: number, y: number, bounce: number) => void;

const HEAD_ACCESSORIES: HeadAccDrawFn[] = [
  // 0: None
  () => {},
  // 1: Crown
  (ctx, x, y, b) => {
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(x + 5, y + 1 + b, 6, 2);
    // Peaks
    ctx.fillRect(x + 5, y + b, 1, 1);
    ctx.fillRect(x + 7, y + b, 1, 1);
    ctx.fillRect(x + 10, y + b, 1, 1);
    // Gems
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(x + 6, y + 1 + b, 1, 1);
    ctx.fillStyle = '#0044ff';
    ctx.fillRect(x + 9, y + 1 + b, 1, 1);
  },
  // 2: Top Hat
  (ctx, x, y, b) => {
    ctx.fillStyle = '#111111';
    ctx.fillRect(x + 6, y + b - 2, 4, 3);
    // Brim
    ctx.fillRect(x + 4, y + b + 1, 8, 1);
    // Band
    ctx.fillStyle = '#cc0000';
    ctx.fillRect(x + 6, y + b, 4, 1);
  },
  // 3: Halo
  (ctx, x, y, b) => {
    ctx.fillStyle = '#ffdd44';
    ctx.fillRect(x + 6, y + b, 4, 1);
    ctx.fillRect(x + 5, y + b + 1, 1, 1);
    ctx.fillRect(x + 10, y + b + 1, 1, 1);
  },
  // 4: Devil Horns
  (ctx, x, y, b) => {
    ctx.fillStyle = '#cc0000';
    ctx.fillRect(x + 4, y + 1 + b, 2, 2);
    ctx.fillRect(x + 10, y + 1 + b, 2, 2);
    ctx.fillRect(x + 4, y + b, 1, 1);
    ctx.fillRect(x + 11, y + b, 1, 1);
  },
  // 5: Antenna
  (ctx, x, y, b) => {
    ctx.fillStyle = '#888888';
    ctx.fillRect(x + 8, y + b - 1, 1, 3);
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(x + 8, y + b - 2, 1, 1);
  },
  // 6: Flower
  (ctx, x, y, b) => {
    ctx.fillStyle = '#ff69b4';
    ctx.fillRect(x + 10, y + 2 + b, 3, 1);
    ctx.fillRect(x + 10, y + 4 + b, 3, 1);
    ctx.fillRect(x + 10, y + 3 + b, 1, 1);
    ctx.fillRect(x + 12, y + 3 + b, 1, 1);
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(x + 11, y + 3 + b, 1, 1);
  },
];

// Shirt design drawing functions (derived from shirt color)
type ShirtDesignDrawFn = (ctx: CanvasRenderingContext2D, x: number, y: number, bounce: number, breathe: number, darkColor: string, lightColor: string) => void;

const SHIRT_DESIGNS: ShirtDesignDrawFn[] = [
  // 0: Solid (none)
  () => {},
  // 1: H-Stripe
  (ctx, x, y, b, br, dc) => { ctx.fillStyle = dc; ctx.fillRect(x + 4, y + 9 + b + br, 8, 1); },
  // 2: V-Stripe
  (ctx, x, y, b, br, _dc, lc) => { ctx.fillStyle = lc; ctx.fillRect(x + 7, y + 8 + b + br, 2, 3); },
  // 3: Heart
  (ctx, x, y, b, br) => {
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(x + 6, y + 8 + b + br, 1, 1);
    ctx.fillRect(x + 9, y + 8 + b + br, 1, 1);
    ctx.fillRect(x + 6, y + 9 + b + br, 4, 1);
    ctx.fillRect(x + 7, y + 10 + b + br, 2, 1);
  },
  // 4: Star
  (ctx, x, y, b, br) => {
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(x + 7, y + 8 + b + br, 2, 1);
    ctx.fillRect(x + 6, y + 9 + b + br, 4, 1);
    ctx.fillRect(x + 7, y + 10 + b + br, 2, 1);
  },
  // 5: Number 1
  (ctx, x, y, b, br) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 7, y + 8 + b + br, 2, 3);
    ctx.fillRect(x + 6, y + 8 + b + br, 1, 1);
  },
  // 6: Skull
  (ctx, x, y, b, br) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 7, y + 8 + b + br, 2, 2);
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + 7, y + 8 + b + br, 1, 1);
    ctx.fillRect(x + 8, y + 8 + b + br, 1, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 7, y + 10 + b + br, 2, 1);
  },
];

/** Resolve granular avatar fields with backwards-compat fallbacks. */
function resolveAvatar(avatar: AvatarConfig) {
  const spriteIdx = avatar.spriteIndex ?? 0;
  const shirtHex = avatar.shirtColor ?? avatar.color ?? '#4a90d9';
  return {
    hairStyle: avatar.hairStyle ?? (spriteIdx % 8),
    hairColor: avatar.hairColor ?? HAIR_COLOR_HEXES[spriteIdx % HAIR_COLOR_HEXES.length],
    skinTone: avatar.skinTone ?? '#ffcc99',
    shirtColor: shirtHex,
    pantsColor: avatar.pantsColor ?? '#2a2a3e',
    shoeColor: avatar.shoeColor ?? '#222222',
    facialHair: avatar.facialHair ?? 0,
    mouthStyle: avatar.mouthStyle ?? 0,
    faceAccessory: avatar.faceAccessory ?? 0,
    headAccessory: avatar.headAccessory ?? 0,
    shirtDesign: avatar.shirtDesign ?? 0,
  };
}

/** Generate a deterministic texture key for an avatar config. */
function avatarTextureKey(avatar: AvatarConfig): string {
  const r = resolveAvatar(avatar);
  return `avatar_${r.hairStyle}_${r.hairColor}_${r.skinTone}_${r.shirtColor}_${r.pantsColor}_${r.shoeColor}_${r.facialHair}_${r.mouthStyle}_${r.faceAccessory}_${r.headAccessory}_${r.shirtDesign}`.replace(/#/g, '');
}

/** Convert hex color string to integer. */
function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

export class BootScene extends Phaser.Scene {
  private theme!: EnvironmentTheme;

  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {}

  async create() {
    // Fetch server config to determine environment
    let envType: EnvironmentType = 'arcade';
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const config = await res.json();
        if (config.environment) {
          envType = config.environment;
        }
        this.registry.set('serverConfig', config);
      }
    } catch {
      // Use default arcade environment
    }

    this.theme = getTheme(envType);

    // Generate environment-specific textures
    this.theme.floors.main.generate(this.textures);
    this.theme.workstation.generate(this.textures, this.anims);

    // Generate unique prop textures (skip duplicates)
    const generatedTextures = new Set<string>();
    for (const prop of this.theme.props) {
      if (!generatedTextures.has(prop.textureKey)) {
        prop.generate(this.textures);
        generatedTextures.add(prop.textureKey);
      }
    }

    // Theme-independent assets
    this.generateCharacterSprites();
    this.generateSkullSprite();
    this.generateBloodSprites();
    this.generateTombstoneSprite();
    this.generateFlowerSprite();
    this.generateParticleSprites();
    this.generateIcons();
    this.generateScanlineTexture();

    this.scene.start('FactoryScene', { environment: envType });
    this.scene.start('UIScene');
  }

  // ── Character sprites ─────────────────────────────────────────────
  private generateCharacterSprites() {
    const size = 16;
    const framesPerRow = 4;
    const animations = ['idle', 'walk_right', 'walk_left', 'walk_down', 'walk_up', 'work', 'sit'];
    const rows = animations.length;
    const sheetW = framesPerRow * size;
    const sheetH = rows * size;

    // Pre-generate legacy sprites for backwards compat (agent_0..agent_7)
    for (let ci = 0; ci < AGENT_COLORS.length; ci++) {
      const color = AGENT_COLORS[ci];
      const r = (color >> 16) & 0xff;
      const g = (color >> 8) & 0xff;
      const b = color & 0xff;
      const shirtHex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

      this.generateSpriteSheet(`agent_${ci}`, {
        hairStyle: ci % 8,
        hairColor: HAIR_COLOR_HEXES[ci % HAIR_COLOR_HEXES.length],
        skinTone: '#ffcc99',
        shirtColor: shirtHex,
        pantsColor: '#2a2a3e',
        shoeColor: '#222222',
        facialHair: 0,
        mouthStyle: 0,
        faceAccessory: 0,
        headAccessory: 0,
        shirtDesign: 0,
      }, sheetW, sheetH, size, framesPerRow, animations, rows);
    }
  }

  /**
   * Generate a sprite sheet for a given avatar config.
   * Returns the texture key. Caches by key so the same config is only generated once.
   */
  public generateAgentSprite(avatar: AvatarConfig): string {
    const key = avatarTextureKey(avatar);
    if (this.textures.exists(key)) return key;

    const resolved = resolveAvatar(avatar);
    const size = 16;
    const framesPerRow = 4;
    const animations = ['idle', 'walk_right', 'walk_left', 'walk_down', 'walk_up', 'work', 'sit'];
    const rows = animations.length;
    const sheetW = framesPerRow * size;
    const sheetH = rows * size;

    this.generateSpriteSheet(key, resolved, sheetW, sheetH, size, framesPerRow, animations, rows);
    return key;
  }

  private generateSpriteSheet(
    key: string,
    colors: { hairStyle: number; hairColor: string; skinTone: string; shirtColor: string; pantsColor: string; shoeColor: string; facialHair: number; mouthStyle: number; faceAccessory: number; headAccessory: number; shirtDesign: number },
    sheetW: number, sheetH: number, size: number, framesPerRow: number,
    animations: string[], rows: number,
  ) {
    const shirtInt = hexToInt(colors.shirtColor);
    const canvas = this.textures.createCanvas(key, sheetW, sheetH)!;
    const ctx = canvas.getContext();

    for (let row = 0; row < rows; row++) {
      for (let frame = 0; frame < framesPerRow; frame++) {
        this.drawCharacter(ctx, frame * size, row * size, size, shirtInt, animations[row], frame, colors);
      }
    }

    canvas.refresh();

    const tex = this.textures.get(key);
    tex.add(0, 0, 0, 0, sheetW, sheetH);
    let frameIdx = 0;
    for (let row = 0; row < rows; row++) {
      for (let frame = 0; frame < framesPerRow; frame++) {
        tex.add(frameIdx + 1, 0, frame * size, row * size, size, size);
        frameIdx++;
      }
    }

    let base = 1;
    for (const anim of animations) {
      const animKey = `${key}_${anim}`;
      if (!this.anims.exists(animKey)) {
        this.anims.create({
          key: animKey,
          frames: Array.from({ length: framesPerRow }, (_, i) => ({ key, frame: base + i })),
          frameRate: anim === 'idle' || anim === 'sit' ? 2 : 6,
          repeat: -1,
        });
      }
      base += framesPerRow;
    }
  }

  private drawCharacter(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    size: number,
    color: number,
    anim: string,
    frame: number,
    colors: { hairStyle: number; hairColor: string; skinTone: string; shirtColor: string; pantsColor: string; shoeColor: string; facialHair: number; mouthStyle: number; faceAccessory: number; headAccessory: number; shirtDesign: number },
  ) {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    const bodyColor = `rgb(${r}, ${g}, ${b})`;
    const darkColor = `rgb(${Math.floor(r * 0.6)}, ${Math.floor(g * 0.6)}, ${Math.floor(b * 0.6)})`;
    const lightColor = `rgb(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)})`;
    const skinColor = colors.skinTone;
    const hairColor = colors.hairColor;

    ctx.clearRect(x, y, size, size);

    const bounce = (anim.startsWith('walk') && frame % 2 === 0) ? -1 : 0;
    const breathe = (anim === 'idle' && frame === 2) ? 1 : 0;

    // Head (skin)
    ctx.fillStyle = skinColor;
    ctx.fillRect(x + 5, y + 2 + bounce, 6, 5);

    // Hair/hat (varies by hairStyle)
    const drawHair = HAIR_STYLES[colors.hairStyle % HAIR_STYLES.length];
    drawHair(ctx, x, y + 2 + bounce, hairColor, bodyColor);

    // Eyes - blink on idle frame 2
    ctx.fillStyle = '#000';
    const isBlink = anim === 'idle' && frame === 2;
    const eyeY = anim === 'work' ? 5 : 4;
    if (isBlink) {
      ctx.fillRect(x + 6, y + eyeY + bounce, 2, 1);
      ctx.fillRect(x + 9, y + eyeY + bounce, 2, 1);
    } else {
      ctx.fillRect(x + 6, y + eyeY + bounce, 1, 1);
      ctx.fillRect(x + 9, y + eyeY + bounce, 1, 1);
    }

    // Mouth
    const drawMouth = MOUTH_STYLES[colors.mouthStyle % MOUTH_STYLES.length];
    drawMouth(ctx, x, y, bounce);

    // Facial hair
    const drawBeard = FACIAL_HAIR_STYLES[colors.facialHair % FACIAL_HAIR_STYLES.length];
    drawBeard(ctx, x, y, bounce, hairColor);

    // Face accessory
    const drawFaceAcc = FACE_ACCESSORIES[colors.faceAccessory % FACE_ACCESSORIES.length];
    drawFaceAcc(ctx, x, y, bounce, eyeY);

    // Head accessory (on top of hair)
    const drawHeadAcc = HEAD_ACCESSORIES[colors.headAccessory % HEAD_ACCESSORIES.length];
    drawHeadAcc(ctx, x, y, bounce);

    // Shirt / body
    ctx.fillStyle = bodyColor;
    if (anim === 'sit') {
      ctx.fillRect(x + 4, y + 7 + bounce, 8, 4);
    } else if (anim === 'work') {
      ctx.fillRect(x + 3, y + 7 + bounce, 8, 4);
    } else {
      ctx.fillRect(x + 4, y + 7 + bounce + breathe, 8, 4);
    }

    // Shirt design
    const drawDesign = SHIRT_DESIGNS[colors.shirtDesign % SHIRT_DESIGNS.length];
    if (anim === 'sit') {
      drawDesign(ctx, x, y, bounce, 0, darkColor, lightColor);
    } else if (anim === 'work') {
      drawDesign(ctx, x - 1, y, bounce, 0, darkColor, lightColor);
    } else {
      drawDesign(ctx, x, y, bounce, breathe, darkColor, lightColor);
    }

    // Collar highlight
    ctx.fillStyle = lightColor;
    if (anim !== 'sit') {
      ctx.fillRect(x + 6, y + 7 + bounce, 4, 1);
    }

    // Pants
    ctx.fillStyle = colors.pantsColor;
    if (anim === 'sit') {
      ctx.fillRect(x + 4, y + 11, 8, 2);
    } else if (anim === 'work') {
      ctx.fillRect(x + 3, y + 11 + bounce, 8, 2);
    } else {
      ctx.fillRect(x + 4, y + 11 + bounce + breathe, 8, 2);
    }

    // Arms
    ctx.fillStyle = darkColor;
    if (anim === 'work') {
      ctx.fillRect(x + 2, y + 8 + bounce, 2, 3);
      ctx.fillRect(x + 11, y + 8 + bounce, 2, 3);
      ctx.fillStyle = skinColor;
      if (frame % 2 === 0) {
        ctx.fillRect(x + 1, y + 9 + bounce, 2, 1);
      } else {
        ctx.fillRect(x + 12, y + 9 + bounce, 2, 1);
      }
    } else if (anim === 'sit') {
      ctx.fillRect(x + 3, y + 8 + bounce, 2, 3);
      ctx.fillRect(x + 11, y + 8 + bounce, 2, 3);
    } else {
      const swing = anim.startsWith('walk') ? (frame % 2 === 0 ? 2 : -2) : 0;
      ctx.fillRect(x + 3, y + 8 + bounce + swing, 2, 3);
      ctx.fillRect(x + 11, y + 8 + bounce - swing, 2, 3);
    }

    // Legs
    ctx.fillStyle = '#334';
    if (anim === 'sit') {
      ctx.fillRect(x + 5, y + 12, 2, 3);
      ctx.fillRect(x + 9, y + 12, 2, 3);
    } else {
      const legOffset = anim.startsWith('walk') ? (frame % 2 === 0 ? 1 : -1) : 0;
      ctx.fillRect(x + 5, y + 13 + bounce, 2, 2);
      ctx.fillRect(x + 9, y + 13 + bounce + legOffset, 2, 2);
    }

    // Shoes
    ctx.fillStyle = colors.shoeColor;
    if (anim !== 'sit') {
      const legOffset = anim.startsWith('walk') ? (frame % 2 === 0 ? 1 : -1) : 0;
      ctx.fillRect(x + 5, y + 15 + bounce, 2, 1);
      ctx.fillRect(x + 9, y + 15 + bounce + legOffset, 2, 1);
    }
  }

  // ── Skull icon for death animation ─────────────────────────────────
  private generateSkullSprite() {
    const canvas = this.textures.createCanvas('skull', 12, 12)!;
    const ctx = canvas.getContext();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(2, 1, 8, 6);
    ctx.fillRect(1, 3, 10, 3);
    ctx.fillRect(3, 7, 6, 2);

    ctx.fillStyle = '#000000';
    ctx.fillRect(3, 3, 2, 2);
    ctx.fillRect(7, 3, 2, 2);
    ctx.fillRect(5, 5, 2, 1);
    ctx.fillRect(4, 7, 1, 2);
    ctx.fillRect(6, 7, 1, 2);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 9, 2, 1);
    ctx.fillRect(1, 10, 2, 1);
    ctx.fillRect(3, 10, 1, 1);
    ctx.fillRect(7, 10, 1, 1);
    ctx.fillRect(9, 10, 2, 1);
    ctx.fillRect(10, 9, 2, 1);
    ctx.fillRect(0, 10, 2, 1);
    ctx.fillRect(10, 10, 2, 1);
    ctx.fillRect(0, 8, 1, 1);
    ctx.fillRect(11, 8, 1, 1);
    ctx.fillRect(0, 11, 1, 1);
    ctx.fillRect(11, 11, 1, 1);

    canvas.refresh();
  }

  // ── Blood sprites for graphic death animation ────────────────────
  private generateBloodSprites() {
    const dropCanvas = this.textures.createCanvas('blood_drop', 4, 6)!;
    const dctx = dropCanvas.getContext();
    dctx.fillStyle = '#cc0000';
    dctx.fillRect(1, 0, 2, 1);
    dctx.fillRect(0, 1, 4, 2);
    dctx.fillRect(0, 3, 4, 1);
    dctx.fillStyle = '#990000';
    dctx.fillRect(1, 4, 2, 1);
    dctx.fillRect(1, 5, 1, 1);
    dropCanvas.refresh();

    const splatCanvas = this.textures.createCanvas('blood_splat', 24, 10)!;
    const sctx = splatCanvas.getContext();
    sctx.fillStyle = '#880000';
    sctx.fillRect(4, 2, 16, 6);
    sctx.fillRect(2, 3, 20, 4);
    sctx.fillRect(6, 1, 12, 8);
    sctx.fillStyle = '#660000';
    sctx.fillRect(8, 3, 8, 4);
    sctx.fillStyle = '#cc0000';
    sctx.fillRect(10, 2, 4, 2);
    sctx.fillStyle = '#990000';
    sctx.fillRect(0, 4, 3, 2);
    sctx.fillRect(21, 3, 3, 2);
    sctx.fillRect(1, 6, 2, 1);
    sctx.fillRect(22, 5, 2, 1);
    splatCanvas.refresh();

    const slashCanvas = this.textures.createCanvas('blood_slash', 8, 3)!;
    const slctx = slashCanvas.getContext();
    slctx.fillStyle = '#cc0000';
    slctx.fillRect(0, 1, 8, 1);
    slctx.fillStyle = '#ff0000';
    slctx.fillRect(1, 0, 6, 1);
    slctx.fillStyle = '#990000';
    slctx.fillRect(1, 2, 6, 1);
    slashCanvas.refresh();
  }

  // ── Tombstone sprite for death marker ────────────────────────────
  private generateTombstoneSprite() {
    const canvas = this.textures.createCanvas('tombstone', 16, 20)!;
    const ctx = canvas.getContext();

    // Stone body
    ctx.fillStyle = '#555566';
    ctx.fillRect(3, 4, 10, 14);
    ctx.fillRect(2, 6, 12, 12);

    // Rounded top
    ctx.fillStyle = '#555566';
    ctx.fillRect(4, 2, 8, 2);
    ctx.fillRect(5, 1, 6, 1);
    ctx.fillRect(6, 0, 4, 1);

    // Stone highlight (left edge)
    ctx.fillStyle = '#6a6a7a';
    ctx.fillRect(3, 5, 1, 13);
    ctx.fillRect(4, 3, 1, 2);
    ctx.fillRect(5, 2, 1, 1);

    // Stone shadow (right edge)
    ctx.fillStyle = '#3d3d4d';
    ctx.fillRect(13, 6, 1, 12);
    ctx.fillRect(12, 4, 1, 2);
    ctx.fillRect(11, 2, 1, 2);

    // RIP text
    ctx.fillStyle = '#aaaabb';
    // R
    ctx.fillRect(4, 6, 1, 5);
    ctx.fillRect(5, 6, 2, 1);
    ctx.fillRect(7, 7, 1, 1);
    ctx.fillRect(5, 8, 2, 1);
    ctx.fillRect(6, 9, 1, 1);
    ctx.fillRect(7, 10, 1, 1);
    // I
    ctx.fillRect(9, 6, 1, 5);
    // P
    ctx.fillRect(11, 6, 1, 5);
    ctx.fillRect(12, 6, 1, 1);
    ctx.fillRect(13, 7, 1, 1);
    ctx.fillRect(12, 8, 1, 1);

    // Ground mound
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(0, 17, 16, 3);
    ctx.fillRect(1, 16, 14, 1);

    // Grass tufts
    ctx.fillStyle = '#2a5a2a';
    ctx.fillRect(0, 16, 2, 1);
    ctx.fillRect(14, 16, 2, 1);
    ctx.fillRect(1, 15, 1, 1);
    ctx.fillRect(14, 15, 1, 1);

    canvas.refresh();
  }

  // ── Flower sprite ───────────────────────────────────────────────
  private generateFlowerSprite() {
    const canvas = this.textures.createCanvas('flower', 10, 12)!;
    const ctx = canvas.getContext();

    // Stem
    ctx.fillStyle = '#2a7a2a';
    ctx.fillRect(4, 5, 2, 7);

    // Leaf
    ctx.fillStyle = '#3a9a3a';
    ctx.fillRect(6, 7, 2, 1);
    ctx.fillRect(7, 6, 1, 1);

    // Petals (red/pink)
    ctx.fillStyle = '#ff4466';
    ctx.fillRect(3, 1, 4, 3);
    ctx.fillRect(2, 2, 6, 2);
    ctx.fillRect(4, 0, 2, 1);
    ctx.fillRect(4, 4, 2, 1);

    // Center (yellow)
    ctx.fillStyle = '#ffdd44';
    ctx.fillRect(4, 2, 2, 1);

    canvas.refresh();
  }

  // ── Particle sprites ──────────────────────────────────────────────
  private generateParticleSprites() {
    const canvas = this.textures.createCanvas('particle', 5, 5)!;
    const ctx = canvas.getContext();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(2, 0, 1, 5);
    ctx.fillRect(0, 2, 5, 1);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillRect(1, 1, 3, 3);
    canvas.refresh();

    const spark = this.textures.createCanvas('spark', 6, 6)!;
    const sctx = spark.getContext();
    sctx.fillStyle = '#ffff00';
    sctx.fillRect(2, 0, 2, 6);
    sctx.fillRect(0, 2, 6, 2);
    sctx.fillStyle = '#ffffff';
    sctx.fillRect(2, 2, 2, 2);
    spark.refresh();
  }

  // ── Tool icons ────────────────────────────────────────────────────
  private generateIcons() {
    const s = 8;
    const icons = ['terminal', 'pencil', 'magnifier', 'globe', 'chat', 'brain'];
    const canvas = this.textures.createCanvas('icons', s * icons.length, s)!;
    const ctx = canvas.getContext();

    // Terminal
    ctx.fillStyle = '#00ff66';
    ctx.fillRect(0, 0, 7, 7);
    ctx.fillStyle = '#003311';
    ctx.fillRect(1, 1, 5, 5);
    ctx.fillStyle = '#00ff66';
    ctx.fillRect(2, 2, 1, 1);
    ctx.fillRect(3, 3, 2, 1);

    // Pencil
    ctx.fillStyle = '#4466ff';
    ctx.fillRect(s + 1, 0, 2, 6);
    ctx.fillRect(s, 6, 1, 1);
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(s + 1, 0, 2, 2);

    // Magnifier
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(s * 2 + 1, 0, 4, 4);
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(s * 2 + 2, 1, 2, 2);
    ctx.fillRect(s * 2 + 4, 4, 1, 3);

    // Globe
    ctx.fillStyle = '#00ccff';
    ctx.fillRect(s * 3 + 1, 1, 5, 5);
    ctx.fillStyle = '#0066ff';
    ctx.fillRect(s * 3 + 3, 1, 1, 5);
    ctx.fillRect(s * 3 + 1, 3, 5, 1);

    // Chat
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(s * 4, 0, 6, 5);
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(s * 4 + 1, 1, 4, 3);
    ctx.fillRect(s * 4 + 1, 5, 2, 2);

    // Brain
    ctx.fillStyle = '#ff6600';
    ctx.fillRect(s * 5 + 1, 0, 5, 6);
    ctx.fillStyle = '#cc4400';
    ctx.fillRect(s * 5 + 3, 1, 1, 4);
    ctx.fillRect(s * 5 + 1, 3, 5, 1);

    canvas.refresh();

    const tex = this.textures.get('icons');
    icons.forEach((_, i) => tex.add(i + 1, 0, i * s, 0, s, s));
  }

  // ── CRT scanline overlay texture ──────────────────────────────────
  private generateScanlineTexture() {
    const canvas = this.textures.createCanvas('scanlines', 1, 4)!;
    const ctx = canvas.getContext();
    ctx.clearRect(0, 0, 1, 4);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillRect(0, 2, 1, 1);
    canvas.refresh();
  }
}
