import Phaser from 'phaser';

// Neon color palette
const NEON_COLORS = {
  magenta: 0xff00ff,
  cyan: 0x00ffff,
  green: 0x00ff66,
  orange: 0xff6600,
  yellow: 0xffff00,
  blue: 0x4466ff,
  purple: 0xaa00ff,
  red: 0xff0044,
};

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

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // We'll generate all sprites programmatically for now
    // and swap in real pixel art assets in Phase 4
  }

  create() {
    this.generateCharacterSprites();
    this.generateMachineSprites();
    this.generateTileset();
    this.generateParticleSprites();
    this.generateIcons();

    this.scene.start('FactoryScene');
    this.scene.start('UIScene');
  }

  private generateCharacterSprites() {
    const size = 16;
    const frameW = size;
    const frameH = size;
    const framesPerRow = 4;
    const animations = ['idle', 'walk_right', 'walk_left', 'walk_down', 'walk_up', 'work', 'sit'];
    const rows = animations.length;
    const sheetW = framesPerRow * frameW;
    const sheetH = rows * frameH;

    for (let ci = 0; ci < AGENT_COLORS.length; ci++) {
      const color = AGENT_COLORS[ci];
      const canvas = this.textures.createCanvas(`agent_${ci}`, sheetW, sheetH)!;
      const ctx = canvas.getContext();

      for (let row = 0; row < rows; row++) {
        for (let frame = 0; frame < framesPerRow; frame++) {
          const x = frame * frameW;
          const y = row * frameH;
          this.drawCharacter(ctx, x, y, size, color, animations[row], frame);
        }
      }

      canvas.refresh();

      // Create spritesheet frames
      const tex = this.textures.get(`agent_${ci}`);
      tex.add(0, 0, 0, 0, sheetW, sheetH); // Full sheet
      // Add individual frames
      let frameIdx = 0;
      for (let row = 0; row < rows; row++) {
        for (let frame = 0; frame < framesPerRow; frame++) {
          tex.add(frameIdx + 1, 0, frame * frameW, row * frameH, frameW, frameH);
          frameIdx++;
        }
      }
    }

    // Register animations for each agent
    for (let ci = 0; ci < AGENT_COLORS.length; ci++) {
      const key = `agent_${ci}`;
      let base = 1;
      for (const anim of animations) {
        this.anims.create({
          key: `${key}_${anim}`,
          frames: Array.from({ length: framesPerRow }, (_, i) => ({ key, frame: base + i })),
          frameRate: anim === 'idle' || anim === 'sit' ? 2 : 6,
          repeat: -1,
        });
        base += framesPerRow;
      }
    }
  }

  private drawCharacter(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    size: number,
    color: number,
    anim: string,
    frame: number,
  ) {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    const bodyColor = `rgb(${r}, ${g}, ${b})`;
    const darkColor = `rgb(${Math.floor(r * 0.6)}, ${Math.floor(g * 0.6)}, ${Math.floor(b * 0.6)})`;
    const skinColor = '#ffcc99';
    const hairColor = '#332211';

    // Clear
    ctx.clearRect(x, y, size, size);

    // Body bounce offset for walk animations
    const bounce = (anim.startsWith('walk') && frame % 2 === 0) ? -1 : 0;

    // Head (skin)
    ctx.fillStyle = skinColor;
    ctx.fillRect(x + 5, y + 1 + bounce, 6, 5);

    // Hair
    ctx.fillStyle = hairColor;
    ctx.fillRect(x + 5, y + 1 + bounce, 6, 2);

    // Eyes
    ctx.fillStyle = '#000';
    if (anim === 'work') {
      // Looking down at machine
      ctx.fillRect(x + 6, y + 4 + bounce, 1, 1);
      ctx.fillRect(x + 9, y + 4 + bounce, 1, 1);
    } else {
      ctx.fillRect(x + 6, y + 3 + bounce, 1, 1);
      ctx.fillRect(x + 9, y + 3 + bounce, 1, 1);
    }

    // Body
    ctx.fillStyle = bodyColor;
    if (anim === 'sit') {
      // Sitting - shorter body
      ctx.fillRect(x + 4, y + 6 + bounce, 8, 5);
    } else if (anim === 'work') {
      // Leaning forward
      ctx.fillRect(x + 3, y + 6 + bounce, 8, 6);
    } else {
      ctx.fillRect(x + 4, y + 6 + bounce, 8, 6);
    }

    // Arms
    ctx.fillStyle = darkColor;
    if (anim === 'work') {
      // Arms extended forward
      ctx.fillRect(x + 2, y + 7 + bounce, 2, 3);
      ctx.fillRect(x + 11, y + 7 + bounce, 2, 3);
      // Typing hands
      if (frame % 2 === 0) {
        ctx.fillRect(x + 1, y + 8 + bounce, 2, 2);
      } else {
        ctx.fillRect(x + 12, y + 8 + bounce, 2, 2);
      }
    } else if (anim === 'sit') {
      ctx.fillRect(x + 3, y + 7 + bounce, 2, 3);
      ctx.fillRect(x + 11, y + 7 + bounce, 2, 3);
    } else {
      // Walking arms swing
      const swing = frame % 2 === 0 ? 1 : -1;
      ctx.fillRect(x + 3, y + 7 + bounce + swing, 2, 3);
      ctx.fillRect(x + 11, y + 7 + bounce - swing, 2, 3);
    }

    // Legs
    ctx.fillStyle = '#334';
    if (anim === 'sit') {
      // Legs forward when sitting
      ctx.fillRect(x + 5, y + 11, 2, 3);
      ctx.fillRect(x + 9, y + 11, 2, 3);
    } else {
      const legOffset = anim.startsWith('walk') ? (frame % 2 === 0 ? 1 : -1) : 0;
      ctx.fillRect(x + 5, y + 12 + bounce, 2, 3);
      ctx.fillRect(x + 9, y + 12 + bounce + legOffset, 2, 3);
    }
  }

  private generateMachineSprites() {
    // Arcade cabinet - 32x32
    const w = 32;
    const h = 32;
    const canvas = this.textures.createCanvas('arcade_cabinet', w * 4, h)!;
    const ctx = canvas.getContext();

    for (let frame = 0; frame < 4; frame++) {
      const x = frame * w;
      this.drawArcadeCabinet(ctx, x, 0, w, h, frame);
    }

    canvas.refresh();

    const tex = this.textures.get('arcade_cabinet');
    for (let i = 0; i < 4; i++) {
      tex.add(i + 1, 0, i * w, 0, w, h);
    }

    this.anims.create({
      key: 'arcade_idle',
      frames: [{ key: 'arcade_cabinet', frame: 1 }],
      frameRate: 1,
      repeat: -1,
    });

    this.anims.create({
      key: 'arcade_active',
      frames: [
        { key: 'arcade_cabinet', frame: 2 },
        { key: 'arcade_cabinet', frame: 3 },
        { key: 'arcade_cabinet', frame: 4 },
      ],
      frameRate: 4,
      repeat: -1,
    });
  }

  private drawArcadeCabinet(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    w: number, h: number,
    frame: number,
  ) {
    // Cabinet body
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(x + 4, y + 2, 24, 28);

    // Cabinet side panels
    ctx.fillStyle = '#16213e';
    ctx.fillRect(x + 2, y + 4, 2, 24);
    ctx.fillRect(x + 28, y + 4, 2, 24);

    // Top marquee
    ctx.fillStyle = frame > 0 ? '#ff00ff' : '#440044';
    ctx.fillRect(x + 6, y + 2, 20, 4);

    // Screen
    const screenColors = ['#111122', '#001133', '#002244', '#001144'];
    ctx.fillStyle = frame === 0 ? '#111122' : screenColors[frame];
    ctx.fillRect(x + 7, y + 7, 18, 12);

    // Screen content when active
    if (frame > 0) {
      // Scanlines
      ctx.fillStyle = `rgba(0, 255, 255, ${0.1 + frame * 0.05})`;
      for (let sy = 0; sy < 12; sy += 2) {
        ctx.fillRect(x + 7, y + 7 + sy, 18, 1);
      }
      // Screen glow
      ctx.fillStyle = `rgba(255, 0, 255, ${0.05 + frame * 0.02})`;
      ctx.fillRect(x + 5, y + 5, 22, 16);
    }

    // Control panel
    ctx.fillStyle = '#2a2a3e';
    ctx.fillRect(x + 7, y + 20, 18, 5);

    // Joystick
    ctx.fillStyle = '#ff0044';
    ctx.fillRect(x + 10, y + 21, 2, 3);

    // Buttons
    ctx.fillStyle = frame > 1 ? '#00ff66' : '#006633';
    ctx.fillRect(x + 16, y + 21, 2, 2);
    ctx.fillStyle = frame > 2 ? '#ffff00' : '#666600';
    ctx.fillRect(x + 20, y + 21, 2, 2);

    // Base
    ctx.fillStyle = '#0f0f1f';
    ctx.fillRect(x + 6, y + 26, 20, 4);

    // Feet
    ctx.fillStyle = '#333';
    ctx.fillRect(x + 6, y + 30, 4, 2);
    ctx.fillRect(x + 22, y + 30, 4, 2);
  }

  private generateTileset() {
    const tileSize = 16;
    // Create basic floor tiles
    const tilesX = 8;
    const tilesY = 4;
    const canvas = this.textures.createCanvas('tiles', tileSize * tilesX, tileSize * tilesY)!;
    const ctx = canvas.getContext();

    // Tile 0: Dark floor (checkered pattern)
    this.drawFloorTile(ctx, 0, 0, tileSize, '#0a0a1a', '#0d0d22');

    // Tile 1: Neon-trimmed floor
    this.drawFloorTile(ctx, tileSize, 0, tileSize, '#0d0d22', '#111133');

    // Tile 2: Wall
    ctx.fillStyle = '#16213e';
    ctx.fillRect(tileSize * 2, 0, tileSize, tileSize);
    ctx.fillStyle = '#1a1a3e';
    ctx.fillRect(tileSize * 2 + 1, 1, tileSize - 2, tileSize - 2);

    // Tile 3: Wall with neon stripe
    ctx.fillStyle = '#16213e';
    ctx.fillRect(tileSize * 3, 0, tileSize, tileSize);
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(tileSize * 3, tileSize - 3, tileSize, 1);
    ctx.fillStyle = 'rgba(255, 0, 255, 0.3)';
    ctx.fillRect(tileSize * 3, tileSize - 5, tileSize, 2);

    // Tile 4: Carpet (lounge area)
    ctx.fillStyle = '#1a0a2e';
    ctx.fillRect(tileSize * 4, 0, tileSize, tileSize);
    ctx.fillStyle = '#220e3a';
    for (let py = 0; py < tileSize; py += 2) {
      ctx.fillRect(tileSize * 4, py, tileSize, 1);
    }

    // Tile 5: Neon sign background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(tileSize * 5, 0, tileSize, tileSize);
    ctx.fillStyle = 'rgba(255, 0, 255, 0.15)';
    ctx.fillRect(tileSize * 5, 0, tileSize, tileSize);

    // Tile 6: Empty/transparent
    ctx.clearRect(tileSize * 6, 0, tileSize, tileSize);

    // Tile 7: Door
    ctx.fillStyle = '#333';
    ctx.fillRect(tileSize * 7, 0, tileSize, tileSize);
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(tileSize * 7, 0, tileSize, 2);
    ctx.fillStyle = '#555';
    ctx.fillRect(tileSize * 7 + 4, 6, 8, 10);

    // Row 2: Furniture tiles
    // Tile 8: Bean bag
    ctx.fillStyle = '#cc00cc';
    ctx.fillRect(0, tileSize, 12, 10);
    ctx.fillRect(2, tileSize + 10, 8, 4);
    ctx.fillStyle = '#aa00aa';
    ctx.fillRect(1, tileSize + 1, 10, 8);

    // Tile 9: Retro couch
    ctx.fillStyle = '#8800ff';
    ctx.fillRect(tileSize, tileSize, 14, 8);
    ctx.fillRect(tileSize, tileSize + 2, 16, 10);
    ctx.fillStyle = '#6600cc';
    ctx.fillRect(tileSize + 1, tileSize + 1, 12, 6);

    // Tile 10: Table
    ctx.fillStyle = '#2a2a4e';
    ctx.fillRect(tileSize * 2, tileSize + 2, 14, 8);
    ctx.fillStyle = '#1a1a3e';
    ctx.fillRect(tileSize * 2 + 2, tileSize + 10, 2, 4);
    ctx.fillRect(tileSize * 2 + 10, tileSize + 10, 2, 4);

    // Tile 11: Neon sign "PLAY"
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(tileSize * 3, tileSize, tileSize, tileSize);
    ctx.fillStyle = '#00ffff';
    ctx.font = '8px monospace';
    // Simple neon text
    ctx.fillRect(tileSize * 3 + 2, tileSize + 4, 2, 6);
    ctx.fillRect(tileSize * 3 + 2, tileSize + 4, 5, 2);
    ctx.fillRect(tileSize * 3 + 5, tileSize + 4, 2, 4);

    canvas.refresh();

    // Register individual tile frames
    const tex = this.textures.get('tiles');
    let idx = 1;
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        tex.add(idx, 0, tx * tileSize, ty * tileSize, tileSize, tileSize);
        idx++;
      }
    }
  }

  private drawFloorTile(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    size: number,
    color1: string,
    color2: string,
  ) {
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        ctx.fillStyle = (px + py) % 2 === 0 ? color1 : color2;
        ctx.fillRect(x + px, y + py, 1, 1);
      }
    }
  }

  private generateParticleSprites() {
    // Small neon particle
    const canvas = this.textures.createCanvas('particle', 4, 4)!;
    const ctx = canvas.getContext();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(1, 0, 2, 4);
    ctx.fillRect(0, 1, 4, 2);
    canvas.refresh();

    // Spark particle
    const spark = this.textures.createCanvas('spark', 6, 6)!;
    const sctx = spark.getContext();
    sctx.fillStyle = '#ffff00';
    sctx.fillRect(2, 0, 2, 6);
    sctx.fillRect(0, 2, 6, 2);
    spark.refresh();
  }

  private generateIcons() {
    // Tool icons for status bubbles (8x8 each)
    const iconSize = 8;
    const icons = ['terminal', 'pencil', 'magnifier', 'globe', 'chat', 'brain'];
    const canvas = this.textures.createCanvas('icons', iconSize * icons.length, iconSize)!;
    const ctx = canvas.getContext();

    // Terminal icon
    ctx.fillStyle = '#00ff66';
    ctx.fillRect(0, 0, 7, 7);
    ctx.fillStyle = '#003311';
    ctx.fillRect(1, 1, 5, 5);
    ctx.fillStyle = '#00ff66';
    ctx.fillRect(2, 2, 1, 1);
    ctx.fillRect(3, 3, 2, 1);

    // Pencil icon
    ctx.fillStyle = '#4466ff';
    ctx.fillRect(iconSize + 1, 0, 2, 6);
    ctx.fillRect(iconSize + 0, 6, 1, 1);
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(iconSize + 1, 0, 2, 2);

    // Magnifier icon
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(iconSize * 2 + 1, 0, 4, 4);
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(iconSize * 2 + 2, 1, 2, 2);
    ctx.fillRect(iconSize * 2 + 4, 4, 1, 3);

    // Globe icon
    ctx.fillStyle = '#00ccff';
    ctx.fillRect(iconSize * 3 + 1, 1, 5, 5);
    ctx.fillStyle = '#0066ff';
    ctx.fillRect(iconSize * 3 + 3, 1, 1, 5);
    ctx.fillRect(iconSize * 3 + 1, 3, 5, 1);

    // Chat bubble icon
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(iconSize * 4 + 0, 0, 6, 5);
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(iconSize * 4 + 1, 1, 4, 3);
    ctx.fillRect(iconSize * 4 + 1, 5, 2, 2);

    // Brain/thinking icon
    ctx.fillStyle = '#ff6600';
    ctx.fillRect(iconSize * 5 + 1, 0, 5, 6);
    ctx.fillStyle = '#cc4400';
    ctx.fillRect(iconSize * 5 + 3, 1, 1, 4);
    ctx.fillRect(iconSize * 5 + 1, 3, 5, 1);

    canvas.refresh();

    const tex = this.textures.get('icons');
    icons.forEach((_, i) => {
      tex.add(i + 1, 0, i * iconSize, 0, iconSize, iconSize);
    });
  }
}
