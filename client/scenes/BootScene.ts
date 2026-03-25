import Phaser from 'phaser';
import type { AvatarConfig } from '@shared/types';

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
  };
}

/** Generate a deterministic texture key for an avatar config. */
function avatarTextureKey(avatar: AvatarConfig): string {
  const r = resolveAvatar(avatar);
  return `avatar_${r.hairStyle}_${r.hairColor}_${r.skinTone}_${r.shirtColor}_${r.pantsColor}_${r.shoeColor}`.replace(/#/g, '');
}

/** Convert hex color string to integer. */
function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {}

  create() {
    this.generateFloorTiles();
    this.generateCharacterSprites();
    this.generateMachineSprites();
    this.generateEnvironmentSprites();
    this.generateSkullSprite();
    this.generateParticleSprites();
    this.generateIcons();
    this.generateScanlineTexture();

    this.scene.start('FactoryScene');
    this.scene.start('UIScene');
  }

  // ── Floor tile textures (one per zone) ────────────────────────────
  private generateFloorTiles() {
    const s = 32; // tile size for repeating patterns

    // Arcade floor: subtle dark checkerboard with grid accent
    const arcadeCanvas = this.textures.createCanvas('floor_arcade', s, s)!;
    const actx = arcadeCanvas.getContext();
    for (let py = 0; py < s; py++) {
      for (let px = 0; px < s; px++) {
        actx.fillStyle = (Math.floor(px / 2) + Math.floor(py / 2)) % 2 === 0 ? '#0a0a1a' : '#0c0c20';
        actx.fillRect(px, py, 1, 1);
      }
    }
    // Faint grid lines at edges
    actx.fillStyle = 'rgba(17, 17, 51, 0.4)';
    actx.fillRect(0, 0, s, 1);
    actx.fillRect(0, 0, 1, s);
    arcadeCanvas.refresh();

    // Counter floor: warm toned alternating rows
    const counterCanvas = this.textures.createCanvas('floor_counter', s, s)!;
    const cctx = counterCanvas.getContext();
    for (let py = 0; py < s; py++) {
      cctx.fillStyle = py % 4 < 2 ? '#1a1408' : '#1f180c';
      cctx.fillRect(0, py, s, 1);
    }
    // Subtle wood grain dots
    cctx.fillStyle = 'rgba(40, 30, 15, 0.5)';
    cctx.fillRect(5, 3, 1, 1);
    cctx.fillRect(18, 9, 1, 1);
    cctx.fillRect(11, 22, 1, 1);
    cctx.fillRect(27, 15, 1, 1);
    counterCanvas.refresh();

    // Lounge floor: purple carpet with diamond pattern
    const loungeCanvas = this.textures.createCanvas('floor_lounge', 16, 16)!;
    const lctx = loungeCanvas.getContext();
    // Base carpet
    for (let py = 0; py < 16; py++) {
      for (let px = 0; px < 16; px++) {
        lctx.fillStyle = '#1a0a2e';
        lctx.fillRect(px, py, 1, 1);
      }
    }
    // Diamond lattice
    lctx.fillStyle = '#221040';
    for (let py = 0; py < 16; py++) {
      for (let px = 0; px < 16; px++) {
        if ((px + py) % 8 === 0 || (px - py + 16) % 8 === 0) {
          lctx.fillRect(px, py, 1, 1);
        }
      }
    }
    loungeCanvas.refresh();

    // Entrance floor: darker
    const entranceCanvas = this.textures.createCanvas('floor_entrance', 16, 16)!;
    const ectx = entranceCanvas.getContext();
    for (let py = 0; py < 16; py++) {
      for (let px = 0; px < 16; px++) {
        ectx.fillStyle = (px + py) % 2 === 0 ? '#060610' : '#080814';
        ectx.fillRect(px, py, 1, 1);
      }
    }
    entranceCanvas.refresh();
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
    colors: { hairStyle: number; hairColor: string; skinTone: string; shirtColor: string; pantsColor: string; shoeColor: string },
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
    colors: { hairStyle: number; hairColor: string; skinTone: string; shirtColor: string; pantsColor: string; shoeColor: string },
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
      // Closed eyes (horizontal line)
      ctx.fillRect(x + 6, y + eyeY + bounce, 2, 1);
      ctx.fillRect(x + 9, y + eyeY + bounce, 2, 1);
    } else {
      ctx.fillRect(x + 6, y + eyeY + bounce, 1, 1);
      ctx.fillRect(x + 9, y + eyeY + bounce, 1, 1);
    }

    // Shirt / body
    ctx.fillStyle = bodyColor;
    if (anim === 'sit') {
      ctx.fillRect(x + 4, y + 7 + bounce, 8, 4);
    } else if (anim === 'work') {
      ctx.fillRect(x + 3, y + 7 + bounce, 8, 4);
    } else {
      ctx.fillRect(x + 4, y + 7 + bounce + breathe, 8, 4);
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
      // Typing hands alternate
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

  // ── Arcade cabinet sprites ────────────────────────────────────────
  private generateMachineSprites() {
    const w = 32, h = 32;
    const canvas = this.textures.createCanvas('arcade_cabinet', w * 4, h)!;
    const ctx = canvas.getContext();

    for (let frame = 0; frame < 4; frame++) {
      this.drawArcadeCabinet(ctx, frame * w, 0, w, h, frame);
    }
    canvas.refresh();

    const tex = this.textures.get('arcade_cabinet');
    for (let i = 0; i < 4; i++) tex.add(i + 1, 0, i * w, 0, w, h);

    this.anims.create({ key: 'arcade_idle', frames: [{ key: 'arcade_cabinet', frame: 1 }], frameRate: 1, repeat: -1 });
    this.anims.create({
      key: 'arcade_active',
      frames: [{ key: 'arcade_cabinet', frame: 2 }, { key: 'arcade_cabinet', frame: 3 }, { key: 'arcade_cabinet', frame: 4 }],
      frameRate: 4,
      repeat: -1,
    });
  }

  private drawArcadeCabinet(ctx: CanvasRenderingContext2D, x: number, y: number, _w: number, _h: number, frame: number) {
    // Cabinet body
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(x + 4, y + 2, 24, 28);

    // Side panels with accent stripe
    ctx.fillStyle = '#16213e';
    ctx.fillRect(x + 2, y + 4, 2, 24);
    ctx.fillRect(x + 28, y + 4, 2, 24);
    // Side accent
    ctx.fillStyle = frame > 0 ? 'rgba(255, 0, 255, 0.3)' : 'rgba(255, 0, 255, 0.1)';
    ctx.fillRect(x + 3, y + 6, 1, 18);
    ctx.fillRect(x + 28, y + 6, 1, 18);

    // Top marquee
    ctx.fillStyle = frame > 0 ? '#ff00ff' : '#440044';
    ctx.fillRect(x + 6, y + 2, 20, 4);
    // Marquee highlight
    if (frame > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.fillRect(x + 8, y + 3, 16, 1);
    }

    // Screen
    ctx.fillStyle = frame === 0 ? '#111122' : '#001133';
    ctx.fillRect(x + 7, y + 7, 18, 12);

    if (frame > 0) {
      // Code-like content on screen
      ctx.fillStyle = `rgba(0, 255, 102, ${0.3 + frame * 0.1})`;
      ctx.fillRect(x + 8, y + 8, 6 + frame * 2, 1);
      ctx.fillRect(x + 10, y + 10, 4 + frame, 1);
      ctx.fillRect(x + 8, y + 12, 8, 1);
      ctx.fillRect(x + 9, y + 14, 5 + frame, 1);
      ctx.fillRect(x + 8, y + 16, 3, 1);

      // Cursor blink
      if (frame === 2) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 11, y + 16, 2, 1);
      }

      // Scanlines
      ctx.fillStyle = `rgba(0, 255, 255, ${0.06 + frame * 0.02})`;
      for (let sy = 0; sy < 12; sy += 2) {
        ctx.fillRect(x + 7, y + 7 + sy, 18, 1);
      }

      // Screen glow
      ctx.fillStyle = `rgba(0, 255, 102, ${0.03 + frame * 0.01})`;
      ctx.fillRect(x + 5, y + 5, 22, 16);
    }

    // Control panel
    ctx.fillStyle = '#2a2a3e';
    ctx.fillRect(x + 7, y + 20, 18, 5);
    ctx.fillStyle = '#333350';
    ctx.fillRect(x + 7, y + 20, 18, 1);

    // Joystick
    ctx.fillStyle = '#ff0044';
    ctx.fillRect(x + 10, y + 21, 2, 3);
    ctx.fillStyle = '#cc0033';
    ctx.fillRect(x + 10, y + 21, 2, 1);

    // Buttons
    ctx.fillStyle = frame > 1 ? '#00ff66' : '#006633';
    ctx.fillRect(x + 16, y + 21, 2, 2);
    ctx.fillStyle = frame > 2 ? '#ffff00' : '#666600';
    ctx.fillRect(x + 20, y + 21, 2, 2);

    // Coin slot
    ctx.fillStyle = '#111';
    ctx.fillRect(x + 13, y + 26, 3, 1);
    ctx.fillStyle = '#333';
    ctx.fillRect(x + 13, y + 27, 3, 1);

    // Base
    ctx.fillStyle = '#0f0f1f';
    ctx.fillRect(x + 6, y + 26, 20, 4);
    // Feet
    ctx.fillStyle = '#333';
    ctx.fillRect(x + 6, y + 30, 4, 2);
    ctx.fillRect(x + 22, y + 30, 4, 2);
  }

  // ── Environment props ─────────────────────────────────────────────
  private generateEnvironmentSprites() {
    // Neon plant (16x16)
    const plant = this.textures.createCanvas('prop_plant', 16, 16)!;
    const pctx = plant.getContext();
    // Pot
    pctx.fillStyle = '#3a2a1e';
    pctx.fillRect(5, 11, 6, 4);
    pctx.fillStyle = '#4a3a2e';
    pctx.fillRect(4, 10, 8, 2);
    // Stem
    pctx.fillStyle = '#006633';
    pctx.fillRect(7, 4, 2, 7);
    // Neon leaves
    pctx.fillStyle = '#00ff66';
    pctx.fillRect(4, 3, 3, 2);
    pctx.fillRect(9, 2, 3, 2);
    pctx.fillRect(5, 6, 2, 2);
    pctx.fillRect(10, 5, 2, 2);
    // Glow tips
    pctx.fillStyle = '#88ffaa';
    pctx.fillRect(4, 3, 1, 1);
    pctx.fillRect(11, 2, 1, 1);
    plant.refresh();

    // Wall poster (16x20)
    const poster = this.textures.createCanvas('prop_poster', 16, 20)!;
    const postctx = poster.getContext();
    // Frame
    postctx.fillStyle = '#333';
    postctx.fillRect(0, 0, 16, 20);
    postctx.fillStyle = '#111122';
    postctx.fillRect(1, 1, 14, 18);
    // Pixel art content - joystick icon
    postctx.fillStyle = '#ff00ff';
    postctx.fillRect(7, 4, 2, 8);
    postctx.fillRect(5, 4, 6, 2);
    postctx.fillStyle = '#ff0044';
    postctx.fillRect(6, 3, 4, 3);
    // Text line
    postctx.fillStyle = '#00ffff';
    postctx.fillRect(3, 15, 10, 1);
    postctx.fillRect(5, 17, 6, 1);
    poster.refresh();

    // Poster variant 2 - terminal
    const poster2 = this.textures.createCanvas('prop_poster2', 16, 20)!;
    const p2ctx = poster2.getContext();
    p2ctx.fillStyle = '#333';
    p2ctx.fillRect(0, 0, 16, 20);
    p2ctx.fillStyle = '#0a1a0a';
    p2ctx.fillRect(1, 1, 14, 18);
    // Terminal content
    p2ctx.fillStyle = '#00ff66';
    p2ctx.fillRect(3, 3, 6, 1);
    p2ctx.fillRect(3, 5, 8, 1);
    p2ctx.fillRect(3, 7, 4, 1);
    p2ctx.fillRect(3, 9, 7, 1);
    p2ctx.fillRect(3, 11, 5, 1);
    // Cursor
    p2ctx.fillStyle = '#ffffff';
    p2ctx.fillRect(3, 13, 2, 1);
    poster2.refresh();

    // Vending machine (16x24)
    const vend = this.textures.createCanvas('prop_vending', 16, 24)!;
    const vctx = vend.getContext();
    vctx.fillStyle = '#1a1a2e';
    vctx.fillRect(1, 0, 14, 24);
    vctx.fillStyle = '#16213e';
    vctx.fillRect(0, 0, 1, 24);
    vctx.fillRect(15, 0, 1, 24);
    // Screen
    vctx.fillStyle = '#001133';
    vctx.fillRect(2, 1, 12, 4);
    vctx.fillStyle = '#00ccff';
    vctx.fillRect(3, 2, 4, 1);
    // Cans grid (3x4)
    const canColors = ['#ff0044', '#00ff66', '#ffff00', '#ff6600', '#00ccff', '#ff00ff', '#4466ff', '#ff6b6b', '#51cf66', '#ffd43b', '#cc5de8', '#20c997'];
    for (let cy = 0; cy < 4; cy++) {
      for (let cx = 0; cx < 3; cx++) {
        vctx.fillStyle = canColors[(cy * 3 + cx) % canColors.length];
        vctx.fillRect(3 + cx * 4, 6 + cy * 4, 3, 3);
      }
    }
    // Dispenser slot
    vctx.fillStyle = '#111';
    vctx.fillRect(4, 22, 8, 2);
    vend.refresh();

    // Lounge couch (32x14)
    const couch = this.textures.createCanvas('prop_couch', 32, 14)!;
    const coctx = couch.getContext();
    // Back
    coctx.fillStyle = '#442266';
    coctx.fillRect(2, 0, 28, 6);
    // Seat
    coctx.fillStyle = '#553388';
    coctx.fillRect(0, 5, 32, 6);
    // Cushion highlights
    coctx.fillStyle = '#664499';
    coctx.fillRect(3, 6, 12, 3);
    coctx.fillRect(17, 6, 12, 3);
    // Armrests
    coctx.fillStyle = '#3a1a55';
    coctx.fillRect(0, 2, 3, 10);
    coctx.fillRect(29, 2, 3, 10);
    // Legs
    coctx.fillStyle = '#222';
    coctx.fillRect(2, 11, 2, 3);
    coctx.fillRect(28, 11, 2, 3);
    couch.refresh();

    // Coffee machine (12x16)
    const coffee = this.textures.createCanvas('prop_coffee', 12, 16)!;
    const cofctx = coffee.getContext();
    cofctx.fillStyle = '#2a2a3e';
    cofctx.fillRect(1, 0, 10, 14);
    cofctx.fillStyle = '#333350';
    cofctx.fillRect(0, 0, 12, 2);
    // Display
    cofctx.fillStyle = '#001133';
    cofctx.fillRect(2, 3, 8, 3);
    cofctx.fillStyle = '#00ff66';
    cofctx.fillRect(3, 4, 2, 1);
    // Buttons
    cofctx.fillStyle = '#ff6600';
    cofctx.fillRect(3, 8, 2, 2);
    cofctx.fillStyle = '#00ccff';
    cofctx.fillRect(7, 8, 2, 2);
    // Cup
    cofctx.fillStyle = '#ffffff';
    cofctx.fillRect(4, 12, 4, 3);
    cofctx.fillStyle = '#8B6914';
    cofctx.fillRect(5, 12, 2, 2);
    // Steam
    cofctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    cofctx.fillRect(5, 10, 1, 2);
    cofctx.fillRect(6, 9, 1, 2);
    coffee.refresh();
  }

  // ── Skull icon for death animation ─────────────────────────────────
  private generateSkullSprite() {
    const canvas = this.textures.createCanvas('skull', 12, 12)!;
    const ctx = canvas.getContext();

    // Skull
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(2, 1, 8, 6);  // cranium
    ctx.fillRect(1, 3, 10, 3); // wider mid
    ctx.fillRect(3, 7, 6, 2);  // jaw

    // Eye sockets
    ctx.fillStyle = '#000000';
    ctx.fillRect(3, 3, 2, 2);
    ctx.fillRect(7, 3, 2, 2);

    // Nose
    ctx.fillRect(5, 5, 2, 1);

    // Teeth
    ctx.fillStyle = '#000000';
    ctx.fillRect(4, 7, 1, 2);
    ctx.fillRect(6, 7, 1, 2);

    // Crossbones
    ctx.fillStyle = '#ffffff';
    // Bone 1: top-left to bottom-right
    ctx.fillRect(0, 9, 2, 1);
    ctx.fillRect(1, 10, 2, 1);
    ctx.fillRect(3, 10, 1, 1);
    ctx.fillRect(7, 10, 1, 1);
    ctx.fillRect(9, 10, 2, 1);
    ctx.fillRect(10, 9, 2, 1);
    // Bone 2: crossing
    ctx.fillRect(0, 10, 2, 1);
    ctx.fillRect(10, 10, 2, 1);
    // Bone knobs
    ctx.fillRect(0, 8, 1, 1);
    ctx.fillRect(11, 8, 1, 1);
    ctx.fillRect(0, 11, 1, 1);
    ctx.fillRect(11, 11, 1, 1);

    canvas.refresh();
  }

  // ── Particle sprites ──────────────────────────────────────────────
  private generateParticleSprites() {
    // Cross-shaped particle
    const canvas = this.textures.createCanvas('particle', 5, 5)!;
    const ctx = canvas.getContext();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(2, 0, 1, 5);
    ctx.fillRect(0, 2, 5, 1);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillRect(1, 1, 3, 3);
    canvas.refresh();

    // Spark
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
    // Alternating transparent / very faint dark rows
    ctx.clearRect(0, 0, 1, 4);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillRect(0, 2, 1, 1);
    canvas.refresh();
  }
}
