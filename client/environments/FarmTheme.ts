import type { EnvironmentTheme } from './EnvironmentTheme';

function generateFloors(textures: Phaser.Textures.TextureManager) {
  const s = 32;

  // Farm fields: green grass with subtle furrow lines
  const fieldCanvas = textures.createCanvas('floor_farm_field', s, s)!;
  const fctx = fieldCanvas.getContext();
  for (let py = 0; py < s; py++) {
    for (let px = 0; px < s; px++) {
      fctx.fillStyle = (Math.floor(px / 4) + Math.floor(py / 4)) % 2 === 0 ? '#2a4a1a' : '#2e5220';
      fctx.fillRect(px, py, 1, 1);
    }
  }
  // Furrow lines
  fctx.fillStyle = '#1a3a12';
  for (let fy = 0; fy < s; fy += 8) {
    fctx.fillRect(0, fy, s, 1);
  }
  // Random grass tufts
  fctx.fillStyle = '#3a6a2a';
  fctx.fillRect(3, 5, 1, 1);
  fctx.fillRect(12, 2, 1, 1);
  fctx.fillRect(20, 11, 1, 1);
  fctx.fillRect(7, 18, 1, 1);
  fctx.fillRect(25, 6, 1, 1);
  fctx.fillRect(15, 27, 1, 1);
  fctx.fillRect(28, 22, 1, 1);
  // Tiny flower dots
  fctx.fillStyle = '#ffee44';
  fctx.fillRect(9, 14, 1, 1);
  fctx.fillRect(22, 3, 1, 1);
  fieldCanvas.refresh();

  // Farm stand floor: packed dirt / wooden planks
  const standCanvas = textures.createCanvas('floor_farm_stand', s, s)!;
  const sctx = standCanvas.getContext();
  for (let py = 0; py < s; py++) {
    sctx.fillStyle = py % 4 < 2 ? '#3a2a18' : '#40301e';
    sctx.fillRect(0, py, s, 1);
  }
  // Plank gaps
  sctx.fillStyle = '#2a1a08';
  for (let pg = 0; pg < s; pg += 8) {
    sctx.fillRect(0, pg, s, 1);
  }
  // Wood grain dots
  sctx.fillStyle = 'rgba(60, 40, 20, 0.5)';
  sctx.fillRect(4, 3, 1, 1);
  sctx.fillRect(15, 10, 1, 1);
  sctx.fillRect(22, 5, 1, 1);
  sctx.fillRect(9, 19, 1, 1);
  sctx.fillRect(28, 25, 1, 1);
  standCanvas.refresh();

  // Stables floor: hay/straw scattered pattern
  const stableCanvas = textures.createCanvas('floor_farm_stable', 16, 16)!;
  const stctx = stableCanvas.getContext();
  for (let py = 0; py < 16; py++) {
    for (let px = 0; px < 16; px++) {
      stctx.fillStyle = '#3a3018';
      stctx.fillRect(px, py, 1, 1);
    }
  }
  // Scattered hay
  stctx.fillStyle = '#c4a036';
  stctx.fillRect(2, 3, 2, 1);
  stctx.fillRect(7, 1, 1, 2);
  stctx.fillRect(11, 5, 2, 1);
  stctx.fillRect(4, 9, 1, 2);
  stctx.fillRect(13, 10, 2, 1);
  stctx.fillRect(1, 13, 2, 1);
  stctx.fillRect(9, 14, 1, 1);
  // Shadow spots
  stctx.fillStyle = '#2a2010';
  stctx.fillRect(6, 7, 1, 1);
  stctx.fillRect(14, 3, 1, 1);
  stctx.fillRect(3, 12, 1, 1);
  stableCanvas.refresh();

  // Entrance: muddy path
  const entCanvas = textures.createCanvas('floor_farm_entrance', 16, 16)!;
  const ectx = entCanvas.getContext();
  for (let py = 0; py < 16; py++) {
    for (let px = 0; px < 16; px++) {
      ectx.fillStyle = (px + py) % 2 === 0 ? '#1a1408' : '#201810';
      ectx.fillRect(px, py, 1, 1);
    }
  }
  entCanvas.refresh();
}

function generateWorkstation(textures: Phaser.Textures.TextureManager, anims: Phaser.Animations.AnimationManager) {
  const w = 32, h = 32;
  const canvas = textures.createCanvas('garden_plot', w * 4, h)!;
  const ctx = canvas.getContext();

  for (let frame = 0; frame < 4; frame++) {
    drawGardenPlot(ctx, frame * w, 0, frame);
  }
  canvas.refresh();

  const tex = textures.get('garden_plot');
  for (let i = 0; i < 4; i++) tex.add(i + 1, 0, i * w, 0, w, h);

  anims.create({ key: 'garden_idle', frames: [{ key: 'garden_plot', frame: 1 }], frameRate: 1, repeat: -1 });
  anims.create({
    key: 'garden_active',
    frames: [{ key: 'garden_plot', frame: 2 }, { key: 'garden_plot', frame: 3 }, { key: 'garden_plot', frame: 4 }],
    frameRate: 3,
    repeat: -1,
  });
}

function drawGardenPlot(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  // Raised garden bed - wooden sides
  ctx.fillStyle = '#5a4020';
  ctx.fillRect(x + 3, y + 14, 26, 3); // front
  ctx.fillRect(x + 3, y + 8, 2, 6);   // left side
  ctx.fillRect(x + 27, y + 8, 2, 6);  // right side
  ctx.fillRect(x + 3, y + 8, 26, 2);  // back

  // Wood grain highlight
  ctx.fillStyle = '#6a5030';
  ctx.fillRect(x + 5, y + 15, 8, 1);
  ctx.fillRect(x + 18, y + 15, 6, 1);

  // Soil
  ctx.fillStyle = '#2a1a08';
  ctx.fillRect(x + 5, y + 10, 22, 4);

  // Soil texture dots
  ctx.fillStyle = '#3a2a18';
  ctx.fillRect(x + 7, y + 11, 1, 1);
  ctx.fillRect(x + 14, y + 12, 1, 1);
  ctx.fillRect(x + 21, y + 11, 1, 1);

  if (frame === 0) {
    // Idle: small seedling
    ctx.fillStyle = '#336622';
    ctx.fillRect(x + 15, y + 8, 2, 3); // stem
    ctx.fillStyle = '#44aa22';
    ctx.fillRect(x + 14, y + 7, 2, 2); // left leaf
    ctx.fillRect(x + 16, y + 7, 2, 2); // right leaf

    // Trowel resting on right
    ctx.fillStyle = '#888888';
    ctx.fillRect(x + 22, y + 9, 1, 3); // handle
    ctx.fillStyle = '#665533';
    ctx.fillRect(x + 21, y + 12, 3, 1); // blade
  } else if (frame === 1) {
    // Growing: taller stem, dig marks
    ctx.fillStyle = '#3a2a18';
    ctx.fillRect(x + 9, y + 11, 3, 1); // dig mark

    ctx.fillStyle = '#336622';
    ctx.fillRect(x + 15, y + 6, 2, 5); // taller stem
    ctx.fillStyle = '#44aa22';
    ctx.fillRect(x + 13, y + 5, 2, 2);
    ctx.fillRect(x + 17, y + 5, 2, 2);
    ctx.fillRect(x + 14, y + 7, 2, 1);
    ctx.fillRect(x + 16, y + 7, 2, 1);
  } else if (frame === 2) {
    // More growth, more leaves
    ctx.fillStyle = '#336622';
    ctx.fillRect(x + 15, y + 4, 2, 7); // tall stem
    ctx.fillStyle = '#44aa22';
    ctx.fillRect(x + 12, y + 4, 3, 2); // left leaves
    ctx.fillRect(x + 17, y + 3, 3, 2); // right leaves
    ctx.fillRect(x + 13, y + 7, 2, 1);
    ctx.fillRect(x + 17, y + 6, 2, 1);
    // Growth sparkles
    ctx.fillStyle = '#88ff44';
    ctx.fillRect(x + 11, y + 3, 1, 1);
    ctx.fillRect(x + 20, y + 2, 1, 1);
  } else {
    // Full plant with fruit
    ctx.fillStyle = '#336622';
    ctx.fillRect(x + 15, y + 2, 2, 9); // big stem
    ctx.fillStyle = '#44aa22';
    ctx.fillRect(x + 11, y + 2, 4, 3); // left bush
    ctx.fillRect(x + 17, y + 1, 4, 3); // right bush
    ctx.fillRect(x + 13, y + 5, 2, 2);
    ctx.fillRect(x + 17, y + 4, 2, 2);
    // Fruit/flower
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(x + 12, y + 1, 2, 2); // tomato
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(x + 19, y + 0, 2, 2); // flower
    // Sparkles
    ctx.fillStyle = '#88ff44';
    ctx.fillRect(x + 10, y + 0, 1, 1);
    ctx.fillRect(x + 22, y + 1, 1, 1);
    ctx.fillRect(x + 14, y + 0, 1, 1);
  }

  // Ground shadow under bed
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.fillRect(x + 4, y + 17, 24, 2);

  // Legs
  ctx.fillStyle = '#4a3018';
  ctx.fillRect(x + 5, y + 17, 2, 3);
  ctx.fillRect(x + 25, y + 17, 2, 3);
}

function generateSunflower(textures: Phaser.Textures.TextureManager) {
  const sf = textures.createCanvas('prop_sunflower', 16, 16)!;
  const ctx = sf.getContext();
  // Stem
  ctx.fillStyle = '#336622';
  ctx.fillRect(7, 6, 2, 9);
  // Leaves
  ctx.fillStyle = '#44aa22';
  ctx.fillRect(5, 9, 2, 2);
  ctx.fillRect(9, 11, 2, 2);
  // Petals
  ctx.fillStyle = '#ffcc00';
  ctx.fillRect(5, 1, 6, 1); // top
  ctx.fillRect(4, 2, 8, 1);
  ctx.fillRect(4, 3, 1, 3); // left
  ctx.fillRect(11, 3, 1, 3); // right
  ctx.fillRect(4, 6, 8, 1);
  ctx.fillRect(5, 7, 6, 1); // bottom
  // Center
  ctx.fillStyle = '#8B6914';
  ctx.fillRect(5, 2, 6, 5);
  ctx.fillStyle = '#664400';
  ctx.fillRect(6, 3, 4, 3);
  // Seeds pattern
  ctx.fillStyle = '#553300';
  ctx.fillRect(7, 3, 1, 1);
  ctx.fillRect(8, 4, 1, 1);
  // Bright petal tips
  ctx.fillStyle = '#ffdd44';
  ctx.fillRect(5, 1, 1, 1);
  ctx.fillRect(10, 1, 1, 1);
  ctx.fillRect(4, 2, 1, 1);
  ctx.fillRect(11, 2, 1, 1);
  sf.refresh();
}

function generateBarnPoster(textures: Phaser.Textures.TextureManager) {
  const poster = textures.createCanvas('prop_barn_poster', 16, 20)!;
  const ctx = poster.getContext();
  // Wooden frame
  ctx.fillStyle = '#5a4020';
  ctx.fillRect(0, 0, 16, 20);
  // Interior
  ctx.fillStyle = '#d4c4a0';
  ctx.fillRect(1, 1, 14, 18);
  // Barn silhouette
  ctx.fillStyle = '#cc3333';
  // Roof triangle
  ctx.fillRect(4, 3, 8, 1);
  ctx.fillRect(5, 2, 6, 1);
  ctx.fillRect(6, 1, 4, 1);
  ctx.fillRect(7, 0, 2, 1);
  // Barn walls
  ctx.fillStyle = '#884422';
  ctx.fillRect(4, 4, 8, 6);
  // Door
  ctx.fillStyle = '#553311';
  ctx.fillRect(6, 6, 4, 4);
  // Hay loft window
  ctx.fillStyle = '#ffcc44';
  ctx.fillRect(7, 5, 2, 1);
  // Text
  ctx.fillStyle = '#5a4020';
  ctx.fillRect(3, 13, 10, 1);
  ctx.fillRect(5, 15, 6, 1);
  poster.refresh();
}

function generateBarnPoster2(textures: Phaser.Textures.TextureManager) {
  const poster = textures.createCanvas('prop_barn_poster2', 16, 20)!;
  const ctx = poster.getContext();
  // Wooden frame
  ctx.fillStyle = '#5a4020';
  ctx.fillRect(0, 0, 16, 20);
  // Interior
  ctx.fillStyle = '#d4c4a0';
  ctx.fillRect(1, 1, 14, 18);
  // Tractor silhouette
  ctx.fillStyle = '#338833';
  ctx.fillRect(3, 5, 8, 4); // body
  ctx.fillRect(2, 4, 4, 2); // cabin
  // Wheels
  ctx.fillStyle = '#333333';
  ctx.fillRect(3, 9, 3, 3); // big wheel
  ctx.fillRect(9, 9, 2, 2); // small wheel
  // Exhaust
  ctx.fillStyle = '#666666';
  ctx.fillRect(10, 3, 1, 3);
  // Text
  ctx.fillStyle = '#5a4020';
  ctx.fillRect(3, 14, 10, 1);
  ctx.fillRect(5, 16, 6, 1);
  poster.refresh();
}

function generateHayCart(textures: Phaser.Textures.TextureManager) {
  const cart = textures.createCanvas('prop_hay_cart', 16, 24)!;
  const ctx = cart.getContext();
  // Cart body
  ctx.fillStyle = '#6a5030';
  ctx.fillRect(1, 6, 14, 12);
  // Side planks
  ctx.fillStyle = '#5a4020';
  ctx.fillRect(0, 6, 1, 12);
  ctx.fillRect(15, 6, 1, 12);
  // Plank lines
  ctx.fillStyle = '#4a3018';
  ctx.fillRect(1, 10, 14, 1);
  ctx.fillRect(1, 14, 14, 1);
  // Hay bales on top
  ctx.fillStyle = '#d4a017';
  ctx.fillRect(2, 1, 12, 6);
  // Hay straps
  ctx.fillStyle = '#8a7026';
  ctx.fillRect(2, 3, 12, 1);
  // Hay wisps
  ctx.fillStyle = '#e4b027';
  ctx.fillRect(3, 0, 2, 1);
  ctx.fillRect(8, 0, 1, 1);
  ctx.fillRect(12, 0, 2, 1);
  // Wheels
  ctx.fillStyle = '#4a3020';
  ctx.fillRect(2, 18, 4, 4);
  ctx.fillRect(10, 18, 4, 4);
  // Wheel hubs
  ctx.fillStyle = '#6a5040';
  ctx.fillRect(3, 19, 2, 2);
  ctx.fillRect(11, 19, 2, 2);
  // Axle
  ctx.fillStyle = '#3a2010';
  ctx.fillRect(6, 20, 4, 1);
  cart.refresh();
}

function generateHayBale(textures: Phaser.Textures.TextureManager) {
  const bale = textures.createCanvas('prop_hay_bale', 32, 14)!;
  const ctx = bale.getContext();
  // Main bale body
  ctx.fillStyle = '#c4a036';
  ctx.fillRect(1, 1, 30, 10);
  // Top rounded edge
  ctx.fillStyle = '#d4b047';
  ctx.fillRect(2, 0, 28, 2);
  // Binding straps
  ctx.fillStyle = '#8a7026';
  ctx.fillRect(1, 3, 30, 1);
  ctx.fillRect(1, 7, 30, 1);
  // Straw texture
  ctx.fillStyle = '#b49026';
  ctx.fillRect(4, 2, 1, 1);
  ctx.fillRect(10, 5, 1, 1);
  ctx.fillRect(18, 2, 1, 1);
  ctx.fillRect(24, 5, 1, 1);
  ctx.fillRect(7, 9, 1, 1);
  ctx.fillRect(20, 9, 1, 1);
  // Light highlights
  ctx.fillStyle = '#d4c057';
  ctx.fillRect(6, 1, 2, 1);
  ctx.fillRect(15, 1, 3, 1);
  ctx.fillRect(25, 1, 2, 1);
  // Bottom shadow
  ctx.fillStyle = '#9a8026';
  ctx.fillRect(1, 10, 30, 1);
  // Legs (small supports)
  ctx.fillStyle = '#8a7026';
  ctx.fillRect(3, 11, 3, 3);
  ctx.fillRect(26, 11, 3, 3);
  ctx.fillRect(13, 11, 3, 2);
  bale.refresh();
}

function generateWaterTrough(textures: Phaser.Textures.TextureManager) {
  const trough = textures.createCanvas('prop_water_trough', 12, 16)!;
  const ctx = trough.getContext();
  // Stone/wood body
  ctx.fillStyle = '#6a6a6a';
  ctx.fillRect(1, 2, 10, 10);
  // Rim
  ctx.fillStyle = '#7a7a7a';
  ctx.fillRect(0, 1, 12, 2);
  // Inner dark
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(2, 3, 8, 8);
  // Water
  ctx.fillStyle = '#4488cc';
  ctx.fillRect(2, 4, 8, 6);
  // Water highlight
  ctx.fillStyle = '#88bbee';
  ctx.fillRect(3, 5, 3, 1);
  ctx.fillRect(4, 6, 2, 1);
  // Water ripple
  ctx.fillStyle = '#5599dd';
  ctx.fillRect(6, 7, 3, 1);
  // Legs
  ctx.fillStyle = '#5a5a5a';
  ctx.fillRect(2, 12, 2, 4);
  ctx.fillRect(8, 12, 2, 4);
  trough.refresh();
}

export const FARM_THEME: EnvironmentTheme = {
  type: 'farm',
  backgroundColor: '#1a2a10',
  behavior: {
    layout: {
      entrance: { x: 400, y: 470 },
      workSlots: Array.from({ length: 12 }, (_, idx) => ({
        x: 80 + (idx % 6) * 120,
        y: 110 + Math.floor(idx / 6) * 110,
      })),
      waitingSlots: Array.from({ length: 4 }, (_, idx) => ({
        x: 60 + idx * 90,
        y: 390,
      })),
      idleSlots: [
        { x: 550, y: 424 },
        { x: 570, y: 424 },
        { x: 690, y: 424 },
        { x: 710, y: 424 },
      ],
    },
    actionsByBucket: {
      working: { zone: 'work', pose: 'work', loop: 'default_work' },
      thinking: { zone: 'work', pose: 'work', loop: 'default_work' },
      waiting: { zone: 'waiting', pose: 'work', loop: 'default_waiting' },
      idle: { zone: 'idle', pose: 'sit', loop: 'default_idle' },
      stopped: { zone: 'idle', pose: 'sit', loop: 'default_idle' },
    },
  },

  floors: {
    main: { key: 'floor_farm_field', generate: generateFloors },
    counter: { key: 'floor_farm_stand', generate: () => {} },
    lounge: { key: 'floor_farm_stable', generate: () => {} },
    entrance: { key: 'floor_farm_entrance', generate: () => {} },
  },

  wall: {
    baseColor: 0x4a3828,
    stripeColor: 0x3a2818,
    stripeAlpha: 0.4,
    edgeColor: 0x2a1808,
    highlightColor: 0x5a4838,
    highlightAlpha: 0.4,
    neonStripColor: 0xffaa44,
    neonStripAlpha: 0.3,
    neonGlowAlpha: 0.08,
  },

  bottomStrip: {
    counterSurfaceColor: 0xb8860b,
    counterDarkColor: 0x8b6914,
    counterAccentColor: 0x5a4510,
    showBell: false,
    loungeAccentColor: 0x5a4020,
    loungeAccentAlpha: 0.4,
  },

  zoneDividerColor: 0x5a4020,
  zoneDividerAlpha: 0.3,

  workstation: {
    textureKey: 'garden_plot',
    frameCount: 4,
    idleAnim: 'garden_idle',
    activeAnim: 'garden_active',
    generate: generateWorkstation,
    glowColor: 0x44aa22,
    activeGlowColor: 0x66cc33,
    floorGlowColor: 0x44aa22,
  },

  labels: {
    mainLabel: '[ FARM FIELDS ]',
    mainLabelColor: '#66cc33',
    counterLabel: 'FARM STAND',
    counterLabelColor: '#d4a017',
    loungeLabel: 'STABLES',
    loungeLabelColor: '#c4a036',
  },

  titleSign: {
    bgColor: 0x3a2a18,
    bgAlpha: 0.8,
    shadowColor: '#44aa22',
    textColor: '#66cc33',
    glowColor: 0x44aa22,
  },

  signs: [
    { x: 80, y: 15, text: 'NOW GROWING', color: '#66cc33', baseAlpha: 0.7, flickerMs: 3000 },
    { x: 700, y: 15, text: 'FARM FRESH', color: '#ffcc44', baseAlpha: 0.6, flickerMs: 2500 },
    { x: 60, y: 358, text: 'DAWN-DUSK', color: '#87ceeb', baseAlpha: 0.4, flickerMs: 4000 },
    { x: 760, y: 358, text: 'HAY LOFT', color: '#d4a017', baseAlpha: 0.4, flickerMs: 3500 },
  ],

  props: [
    { textureKey: 'prop_sunflower', x: 22, y: 58, scale: 2, depth: 4, generate: generateSunflower },
    { textureKey: 'prop_sunflower', x: 778, y: 58, scale: 2, depth: 4, generate: () => {} },
    { textureKey: 'prop_sunflower', x: 22, y: 420, scale: 2, depth: 4, generate: () => {} },
    { textureKey: 'prop_sunflower', x: 778, y: 420, scale: 2, depth: 4, generate: () => {} },
    { textureKey: 'prop_barn_poster', x: 160, y: 24, scale: 1.5, depth: 3, generate: generateBarnPoster },
    { textureKey: 'prop_barn_poster2', x: 560, y: 24, scale: 1.5, depth: 3, generate: generateBarnPoster2 },
    { textureKey: 'prop_hay_cart', x: 395, y: 420, scale: 1.5, depth: 4, generate: generateHayCart },
    { textureKey: 'prop_hay_bale', x: 560, y: 430, scale: 1.5, depth: 4, generate: generateHayBale },
    { textureKey: 'prop_hay_bale', x: 700, y: 430, scale: 1.5, depth: 4, generate: () => {} },
    { textureKey: 'prop_water_trough', x: 32, y: 380, scale: 1.5, depth: 4, generate: generateWaterTrough },
  ],

  particles: {
    count: 8,
    color: 0xffeeaa,
    minAlpha: 0.03,
    maxAlpha: 0.12,
    durationRange: [6000, 12000],
    driftRange: [-80, 80],
  },

  showScanlines: false,
  scanlineAlpha: 0,
  showVignette: true,

  hudAccentColor: '#66cc33',
};
