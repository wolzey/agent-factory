import type { EnvironmentTheme } from './EnvironmentTheme';

function generateFloors(textures: Phaser.Textures.TextureManager) {
  const s = 32;

  const mineCanvas = textures.createCanvas('floor_mining_main', s, s)!;
  const mctx = mineCanvas.getContext();
  for (let py = 0; py < s; py++) {
    for (let px = 0; px < s; px++) {
      const noise = ((px * 13 + py * 7) % 9) - 4;
      const base = 46 + noise;
      mctx.fillStyle = `rgb(${base}, ${base - 4}, ${base - 10})`;
      mctx.fillRect(px, py, 1, 1);
    }
  }
  mctx.fillStyle = 'rgba(100, 100, 120, 0.18)';
  for (let i = 0; i < 18; i++) {
    const x = (i * 7) % s;
    const y = (i * 11) % s;
    mctx.fillRect(x, y, 2, 1);
  }
  mineCanvas.refresh();

  const forgeCanvas = textures.createCanvas('floor_mining_forge', s, s)!;
  const fctx = forgeCanvas.getContext();
  for (let py = 0; py < s; py++) {
    const shade = py % 4 < 2 ? '#3c2f24' : '#433527';
    fctx.fillStyle = shade;
    fctx.fillRect(0, py, s, 1);
  }
  fctx.fillStyle = 'rgba(255, 140, 40, 0.22)';
  fctx.fillRect(2, 6, 6, 1);
  fctx.fillRect(12, 16, 4, 1);
  fctx.fillRect(23, 9, 5, 1);
  forgeCanvas.refresh();

  const bunkCanvas = textures.createCanvas('floor_mining_bunk', 16, 16)!;
  const bctx = bunkCanvas.getContext();
  for (let py = 0; py < 16; py++) {
    for (let px = 0; px < 16; px++) {
      bctx.fillStyle = (px + py) % 2 === 0 ? '#2b3340' : '#2f3846';
      bctx.fillRect(px, py, 1, 1);
    }
  }
  bunkCanvas.refresh();

  const entryCanvas = textures.createCanvas('floor_mining_entry', 16, 16)!;
  const ectx = entryCanvas.getContext();
  for (let py = 0; py < 16; py++) {
    for (let px = 0; px < 16; px++) {
      ectx.fillStyle = (px + py) % 2 === 0 ? '#222831' : '#262d36';
      ectx.fillRect(px, py, 1, 1);
    }
  }
  entryCanvas.refresh();
}

function generateWorkstation(textures: Phaser.Textures.TextureManager, anims: Phaser.Animations.AnimationManager) {
  const w = 32;
  const h = 32;
  const canvas = textures.createCanvas('mine_vein', w * 4, h)!;
  const ctx = canvas.getContext();

  for (let frame = 0; frame < 4; frame++) {
    drawMineVein(ctx, frame * w, 0, frame);
  }
  canvas.refresh();

  const tex = textures.get('mine_vein');
  for (let i = 0; i < 4; i++) tex.add(i + 1, 0, i * w, 0, w, h);

  anims.create({ key: 'mine_idle', frames: [{ key: 'mine_vein', frame: 1 }], frameRate: 1, repeat: -1 });
  anims.create({
    key: 'mine_active',
    frames: [
      { key: 'mine_vein', frame: 2 },
      { key: 'mine_vein', frame: 3 },
      { key: 'mine_vein', frame: 4 },
    ],
    frameRate: 5,
    repeat: -1,
  });
}

function drawMineVein(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  ctx.fillStyle = '#474f5a';
  ctx.fillRect(x + 1, y + 2, 30, 26);
  ctx.fillStyle = '#3a414a';
  ctx.fillRect(x + 2, y + 3, 28, 24);

  ctx.fillStyle = '#59636e';
  ctx.fillRect(x + 5, y + 7, 6, 4);
  ctx.fillRect(x + 14, y + 10, 5, 3);
  ctx.fillRect(x + 20, y + 16, 7, 4);

  ctx.fillStyle = '#7f95aa';
  const pulse = frame > 0 ? 1 : 0;
  ctx.fillRect(x + 8, y + 8, 2 + pulse, 2);
  ctx.fillRect(x + 16, y + 11, 2, 1 + pulse);
  ctx.fillRect(x + 23, y + 17, 2, 2 + pulse);

  if (frame >= 2) {
    ctx.fillStyle = '#d3f4ff';
    ctx.fillRect(x + 10, y + 9, 1, 1);
    ctx.fillRect(x + 18, y + 12, 1, 1);
    ctx.fillRect(x + 25, y + 19, 1, 1);
  }

  ctx.fillStyle = '#2a2f36';
  ctx.fillRect(x + 0, y + 28, 32, 4);
}

function generateLantern(textures: Phaser.Textures.TextureManager) {
  const lantern = textures.createCanvas('prop_mining_lantern', 12, 18)!;
  const ctx = lantern.getContext();
  ctx.fillStyle = '#5f4b2c';
  ctx.fillRect(2, 4, 8, 11);
  ctx.fillStyle = '#8a6a3c';
  ctx.fillRect(1, 3, 10, 2);
  ctx.fillRect(2, 15, 8, 2);
  ctx.fillStyle = '#ffb347';
  ctx.fillRect(4, 6, 4, 6);
  ctx.fillStyle = '#ffd9a1';
  ctx.fillRect(5, 7, 2, 3);
  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(5, 0, 2, 3);
  ctx.fillRect(4, 1, 4, 1);
  lantern.refresh();
}

function generateAnvil(textures: Phaser.Textures.TextureManager) {
  const anvil = textures.createCanvas('prop_mining_anvil', 18, 14)!;
  const ctx = anvil.getContext();
  ctx.fillStyle = '#7a8088';
  ctx.fillRect(2, 2, 14, 3);
  ctx.fillRect(4, 5, 10, 2);
  ctx.fillStyle = '#676d75';
  ctx.fillRect(7, 7, 4, 4);
  ctx.fillRect(5, 11, 8, 2);
  ctx.fillStyle = '#858b95';
  ctx.fillRect(12, 3, 4, 1);
  anvil.refresh();
}

function generateMinecart(textures: Phaser.Textures.TextureManager) {
  const cart = textures.createCanvas('prop_mining_cart', 20, 14)!;
  const ctx = cart.getContext();
  ctx.fillStyle = '#5a5f66';
  ctx.fillRect(1, 3, 18, 6);
  ctx.fillStyle = '#44484f';
  ctx.fillRect(2, 5, 16, 4);
  ctx.fillStyle = '#6f757d';
  ctx.fillRect(0, 2, 20, 2);
  ctx.fillStyle = '#2b2e33';
  ctx.fillRect(4, 9, 4, 2);
  ctx.fillRect(12, 9, 4, 2);
  ctx.fillStyle = '#8f959d';
  ctx.fillRect(5, 10, 2, 2);
  ctx.fillRect(13, 10, 2, 2);
  cart.refresh();
}

function generateBed(textures: Phaser.Textures.TextureManager) {
  const bed = textures.createCanvas('prop_mining_bed', 28, 14)!;
  const ctx = bed.getContext();
  ctx.fillStyle = '#5d3e28';
  ctx.fillRect(1, 2, 26, 10);
  ctx.fillStyle = '#7a5335';
  ctx.fillRect(0, 1, 28, 2);
  ctx.fillStyle = '#9cb0c6';
  ctx.fillRect(2, 4, 24, 7);
  ctx.fillStyle = '#d8dde7';
  ctx.fillRect(3, 5, 6, 3);
  ctx.fillStyle = '#6984a1';
  ctx.fillRect(10, 6, 14, 4);
  bed.refresh();
}

export const MINING_THEME: EnvironmentTheme = {
  type: 'mining',
  backgroundColor: '#171b22',

  behavior: {
    layout: {
      entrance: { x: 400, y: 470 },
      workSlots: Array.from({ length: 12 }, (_, idx) => ({
        x: 90 + (idx % 6) * 110,
        y: 120 + Math.floor(idx / 6) * 95,
      })),
      waitingSlots: Array.from({ length: 4 }, (_, idx) => ({
        x: 80 + idx * 95,
        y: 390,
      })),
      idleSlots: [
        { x: 540, y: 426 },
        { x: 575, y: 426 },
        { x: 675, y: 426 },
        { x: 710, y: 426 },
      ],
    },
    actionsByBucket: {
      working: { zone: 'work', pose: 'work', loop: 'mining_work' },
      thinking: { zone: 'work', pose: 'work', loop: 'mining_work' },
      waiting: { zone: 'waiting', pose: 'work', loop: 'mining_waiting' },
      idle: { zone: 'idle', pose: 'sit', loop: 'mining_idle' },
      stopped: { zone: 'idle', pose: 'sit', loop: 'mining_idle' },
    },
  },

  floors: {
    main: { key: 'floor_mining_main', generate: generateFloors },
    counter: { key: 'floor_mining_forge', generate: () => {} },
    lounge: { key: 'floor_mining_bunk', generate: () => {} },
    entrance: { key: 'floor_mining_entry', generate: () => {} },
  },

  wall: {
    baseColor: 0x2a3038,
    stripeColor: 0x333942,
    stripeAlpha: 0.35,
    edgeColor: 0x1a1f27,
    highlightColor: 0x404854,
    highlightAlpha: 0.35,
    neonStripColor: 0xffa64d,
    neonStripAlpha: 0.45,
    neonGlowAlpha: 0.08,
  },

  bottomStrip: {
    counterSurfaceColor: 0x5a4028,
    counterDarkColor: 0x3f2d1e,
    counterAccentColor: 0x6b4b2f,
    showBell: false,
    loungeAccentColor: 0x4b5d73,
    loungeAccentAlpha: 0.35,
  },

  zoneDividerColor: 0x6a727d,
  zoneDividerAlpha: 0.35,

  workstation: {
    textureKey: 'mine_vein',
    frameCount: 4,
    idleAnim: 'mine_idle',
    activeAnim: 'mine_active',
    generate: generateWorkstation,
    glowColor: 0x6fa0c8,
    activeGlowColor: 0x8cc8f0,
    floorGlowColor: 0x4d7ca0,
  },

  labels: {
    mainLabel: '[ MINE SHAFT ]',
    mainLabelColor: '#8cc8f0',
    counterLabel: 'BLACKSMITH',
    counterLabelColor: '#ffb36b',
    loungeLabel: 'BUNKS',
    loungeLabelColor: '#b6c8dd',
  },

  titleSign: {
    bgColor: 0x171b22,
    bgAlpha: 0.85,
    shadowColor: '#ff7f40',
    textColor: '#ffb36b',
    glowColor: 0xff8e4d,
  },

  signs: [
    { x: 80, y: 15, text: 'VEIN ACTIVE', color: '#8cc8f0', baseAlpha: 0.7, flickerMs: 2400 },
    { x: 700, y: 15, text: 'SHIFT CLOCK', color: '#ffb36b', baseAlpha: 0.6, flickerMs: 2000 },
    { x: 76, y: 358, text: 'FORGE', color: '#ff8e4d', baseAlpha: 0.45, flickerMs: 2800 },
    { x: 760, y: 358, text: 'REST BUNKS', color: '#aac6e6', baseAlpha: 0.45, flickerMs: 3000 },
  ],

  props: [
    { textureKey: 'prop_mining_lantern', x: 24, y: 58, scale: 2, depth: 4, generate: generateLantern },
    { textureKey: 'prop_mining_lantern', x: 776, y: 58, scale: 2, depth: 4, generate: () => {} },
    { textureKey: 'prop_mining_lantern', x: 24, y: 420, scale: 2, depth: 4, generate: () => {} },
    { textureKey: 'prop_mining_lantern', x: 776, y: 420, scale: 2, depth: 4, generate: () => {} },
    { textureKey: 'prop_mining_anvil', x: 160, y: 24, scale: 1.8, depth: 3, generate: generateAnvil },
    { textureKey: 'prop_mining_cart', x: 560, y: 24, scale: 1.6, depth: 3, generate: generateMinecart },
    { textureKey: 'prop_mining_anvil', x: 395, y: 420, scale: 1.6, depth: 4, generate: () => {} },
    { textureKey: 'prop_mining_bed', x: 560, y: 430, scale: 1.4, depth: 4, generate: generateBed },
    { textureKey: 'prop_mining_bed', x: 700, y: 430, scale: 1.4, depth: 4, generate: () => {} },
    { textureKey: 'prop_mining_cart', x: 32, y: 380, scale: 1.4, depth: 4, generate: () => {} },
  ],

  particles: {
    count: 10,
    color: 0xd7e2ef,
    minAlpha: 0.02,
    maxAlpha: 0.1,
    durationRange: [5000, 9000],
    driftRange: [-45, 45],
  },

  showScanlines: false,
  scanlineAlpha: 0,
  showVignette: true,

  hudAccentColor: '#ff9e57',
};
