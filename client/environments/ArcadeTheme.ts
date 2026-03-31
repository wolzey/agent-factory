import type { EnvironmentTheme } from './EnvironmentTheme';

function generateFloors(textures: Phaser.Textures.TextureManager) {
  // Arcade floor: subtle dark checkerboard with grid accent
  const s = 32;
  const arcadeCanvas = textures.createCanvas('floor_arcade', s, s)!;
  const actx = arcadeCanvas.getContext();
  for (let py = 0; py < s; py++) {
    for (let px = 0; px < s; px++) {
      actx.fillStyle = (Math.floor(px / 2) + Math.floor(py / 2)) % 2 === 0 ? '#0a0a1a' : '#0c0c20';
      actx.fillRect(px, py, 1, 1);
    }
  }
  actx.fillStyle = 'rgba(17, 17, 51, 0.4)';
  actx.fillRect(0, 0, s, 1);
  actx.fillRect(0, 0, 1, s);
  arcadeCanvas.refresh();

  // Counter floor: warm toned alternating rows
  const counterCanvas = textures.createCanvas('floor_counter', s, s)!;
  const cctx = counterCanvas.getContext();
  for (let py = 0; py < s; py++) {
    cctx.fillStyle = py % 4 < 2 ? '#1a1408' : '#1f180c';
    cctx.fillRect(0, py, s, 1);
  }
  cctx.fillStyle = 'rgba(40, 30, 15, 0.5)';
  cctx.fillRect(5, 3, 1, 1);
  cctx.fillRect(18, 9, 1, 1);
  cctx.fillRect(11, 22, 1, 1);
  cctx.fillRect(27, 15, 1, 1);
  counterCanvas.refresh();

  // Lounge floor: purple carpet with diamond pattern
  const loungeCanvas = textures.createCanvas('floor_lounge', 16, 16)!;
  const lctx = loungeCanvas.getContext();
  for (let py = 0; py < 16; py++) {
    for (let px = 0; px < 16; px++) {
      lctx.fillStyle = '#1a0a2e';
      lctx.fillRect(px, py, 1, 1);
    }
  }
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
  const entranceCanvas = textures.createCanvas('floor_entrance', 16, 16)!;
  const ectx = entranceCanvas.getContext();
  for (let py = 0; py < 16; py++) {
    for (let px = 0; px < 16; px++) {
      ectx.fillStyle = (px + py) % 2 === 0 ? '#060610' : '#080814';
      ectx.fillRect(px, py, 1, 1);
    }
  }
  entranceCanvas.refresh();
}

function generateWorkstation(textures: Phaser.Textures.TextureManager, anims: Phaser.Animations.AnimationManager) {
  const w = 32, h = 32;
  const canvas = textures.createCanvas('arcade_cabinet', w * 4, h)!;
  const ctx = canvas.getContext();

  for (let frame = 0; frame < 4; frame++) {
    drawArcadeCabinet(ctx, frame * w, 0, frame);
  }
  canvas.refresh();

  const tex = textures.get('arcade_cabinet');
  for (let i = 0; i < 4; i++) tex.add(i + 1, 0, i * w, 0, w, h);

  anims.create({ key: 'arcade_idle', frames: [{ key: 'arcade_cabinet', frame: 1 }], frameRate: 1, repeat: -1 });
  anims.create({
    key: 'arcade_active',
    frames: [{ key: 'arcade_cabinet', frame: 2 }, { key: 'arcade_cabinet', frame: 3 }, { key: 'arcade_cabinet', frame: 4 }],
    frameRate: 4,
    repeat: -1,
  });
}

function drawArcadeCabinet(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  // Cabinet body
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(x + 4, y + 2, 24, 28);

  // Side panels with accent stripe
  ctx.fillStyle = '#16213e';
  ctx.fillRect(x + 2, y + 4, 2, 24);
  ctx.fillRect(x + 28, y + 4, 2, 24);
  ctx.fillStyle = frame > 0 ? 'rgba(255, 0, 255, 0.3)' : 'rgba(255, 0, 255, 0.1)';
  ctx.fillRect(x + 3, y + 6, 1, 18);
  ctx.fillRect(x + 28, y + 6, 1, 18);

  // Top marquee
  ctx.fillStyle = frame > 0 ? '#ff00ff' : '#440044';
  ctx.fillRect(x + 6, y + 2, 20, 4);
  if (frame > 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(x + 8, y + 3, 16, 1);
  }

  // Screen
  ctx.fillStyle = frame === 0 ? '#111122' : '#001133';
  ctx.fillRect(x + 7, y + 7, 18, 12);

  if (frame > 0) {
    ctx.fillStyle = `rgba(0, 255, 102, ${0.3 + frame * 0.1})`;
    ctx.fillRect(x + 8, y + 8, 6 + frame * 2, 1);
    ctx.fillRect(x + 10, y + 10, 4 + frame, 1);
    ctx.fillRect(x + 8, y + 12, 8, 1);
    ctx.fillRect(x + 9, y + 14, 5 + frame, 1);
    ctx.fillRect(x + 8, y + 16, 3, 1);

    if (frame === 2) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 11, y + 16, 2, 1);
    }

    ctx.fillStyle = `rgba(0, 255, 255, ${0.06 + frame * 0.02})`;
    for (let sy = 0; sy < 12; sy += 2) {
      ctx.fillRect(x + 7, y + 7 + sy, 18, 1);
    }

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
  ctx.fillStyle = '#333';
  ctx.fillRect(x + 6, y + 30, 4, 2);
  ctx.fillRect(x + 22, y + 30, 4, 2);
}

function generatePlant(textures: Phaser.Textures.TextureManager) {
  const plant = textures.createCanvas('prop_plant', 16, 16)!;
  const pctx = plant.getContext();
  pctx.fillStyle = '#3a2a1e';
  pctx.fillRect(5, 11, 6, 4);
  pctx.fillStyle = '#4a3a2e';
  pctx.fillRect(4, 10, 8, 2);
  pctx.fillStyle = '#006633';
  pctx.fillRect(7, 4, 2, 7);
  pctx.fillStyle = '#00ff66';
  pctx.fillRect(4, 3, 3, 2);
  pctx.fillRect(9, 2, 3, 2);
  pctx.fillRect(5, 6, 2, 2);
  pctx.fillRect(10, 5, 2, 2);
  pctx.fillStyle = '#88ffaa';
  pctx.fillRect(4, 3, 1, 1);
  pctx.fillRect(11, 2, 1, 1);
  plant.refresh();
}

function generatePoster(textures: Phaser.Textures.TextureManager) {
  const poster = textures.createCanvas('prop_poster', 16, 20)!;
  const ctx = poster.getContext();
  ctx.fillStyle = '#333';
  ctx.fillRect(0, 0, 16, 20);
  ctx.fillStyle = '#111122';
  ctx.fillRect(1, 1, 14, 18);
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(7, 4, 2, 8);
  ctx.fillRect(5, 4, 6, 2);
  ctx.fillStyle = '#ff0044';
  ctx.fillRect(6, 3, 4, 3);
  ctx.fillStyle = '#00ffff';
  ctx.fillRect(3, 15, 10, 1);
  ctx.fillRect(5, 17, 6, 1);
  poster.refresh();
}

function generatePoster2(textures: Phaser.Textures.TextureManager) {
  const poster2 = textures.createCanvas('prop_poster2', 16, 20)!;
  const ctx = poster2.getContext();
  ctx.fillStyle = '#333';
  ctx.fillRect(0, 0, 16, 20);
  ctx.fillStyle = '#0a1a0a';
  ctx.fillRect(1, 1, 14, 18);
  ctx.fillStyle = '#00ff66';
  ctx.fillRect(3, 3, 6, 1);
  ctx.fillRect(3, 5, 8, 1);
  ctx.fillRect(3, 7, 4, 1);
  ctx.fillRect(3, 9, 7, 1);
  ctx.fillRect(3, 11, 5, 1);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(3, 13, 2, 1);
  poster2.refresh();
}

function generateVending(textures: Phaser.Textures.TextureManager) {
  const vend = textures.createCanvas('prop_vending', 16, 24)!;
  const ctx = vend.getContext();
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(1, 0, 14, 24);
  ctx.fillStyle = '#16213e';
  ctx.fillRect(0, 0, 1, 24);
  ctx.fillRect(15, 0, 1, 24);
  ctx.fillStyle = '#001133';
  ctx.fillRect(2, 1, 12, 4);
  ctx.fillStyle = '#00ccff';
  ctx.fillRect(3, 2, 4, 1);
  const canColors = ['#ff0044', '#00ff66', '#ffff00', '#ff6600', '#00ccff', '#ff00ff', '#4466ff', '#ff6b6b', '#51cf66', '#ffd43b', '#cc5de8', '#20c997'];
  for (let cy = 0; cy < 4; cy++) {
    for (let cx = 0; cx < 3; cx++) {
      ctx.fillStyle = canColors[(cy * 3 + cx) % canColors.length];
      ctx.fillRect(3 + cx * 4, 6 + cy * 4, 3, 3);
    }
  }
  ctx.fillStyle = '#111';
  ctx.fillRect(4, 22, 8, 2);
  vend.refresh();
}

function generateCouch(textures: Phaser.Textures.TextureManager) {
  const couch = textures.createCanvas('prop_couch', 32, 14)!;
  const ctx = couch.getContext();
  ctx.fillStyle = '#442266';
  ctx.fillRect(2, 0, 28, 6);
  ctx.fillStyle = '#553388';
  ctx.fillRect(0, 5, 32, 6);
  ctx.fillStyle = '#664499';
  ctx.fillRect(3, 6, 12, 3);
  ctx.fillRect(17, 6, 12, 3);
  ctx.fillStyle = '#3a1a55';
  ctx.fillRect(0, 2, 3, 10);
  ctx.fillRect(29, 2, 3, 10);
  ctx.fillStyle = '#222';
  ctx.fillRect(2, 11, 2, 3);
  ctx.fillRect(28, 11, 2, 3);
  couch.refresh();
}

function generateCoffee(textures: Phaser.Textures.TextureManager) {
  const coffee = textures.createCanvas('prop_coffee', 12, 16)!;
  const ctx = coffee.getContext();
  ctx.fillStyle = '#2a2a3e';
  ctx.fillRect(1, 0, 10, 14);
  ctx.fillStyle = '#333350';
  ctx.fillRect(0, 0, 12, 2);
  ctx.fillStyle = '#001133';
  ctx.fillRect(2, 3, 8, 3);
  ctx.fillStyle = '#00ff66';
  ctx.fillRect(3, 4, 2, 1);
  ctx.fillStyle = '#ff6600';
  ctx.fillRect(3, 8, 2, 2);
  ctx.fillStyle = '#00ccff';
  ctx.fillRect(7, 8, 2, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(4, 12, 4, 3);
  ctx.fillStyle = '#8B6914';
  ctx.fillRect(5, 12, 2, 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.fillRect(5, 10, 1, 2);
  ctx.fillRect(6, 9, 1, 2);
  coffee.refresh();
}

export const ARCADE_THEME: EnvironmentTheme = {
  type: 'arcade',
  backgroundColor: '#0a0a1a',
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
    main: { key: 'floor_arcade', generate: generateFloors },
    counter: { key: 'floor_counter', generate: () => {} },
    lounge: { key: 'floor_lounge', generate: () => {} },
    entrance: { key: 'floor_entrance', generate: () => {} },
  },

  wall: {
    baseColor: 0x16213e,
    stripeColor: 0x1a2544,
    stripeAlpha: 0.3,
    edgeColor: 0x0f1830,
    highlightColor: 0x2a3550,
    highlightAlpha: 0.5,
    neonStripColor: 0xff00ff,
    neonStripAlpha: 0.8,
    neonGlowAlpha: 0.06,
  },

  bottomStrip: {
    counterSurfaceColor: 0xc4991a,
    counterDarkColor: 0x8b6914,
    counterAccentColor: 0x5a4510,
    showBell: true,
    loungeAccentColor: 0x2a1050,
    loungeAccentAlpha: 0.4,
  },

  zoneDividerColor: 0x444466,
  zoneDividerAlpha: 0.4,

  workstation: {
    textureKey: 'arcade_cabinet',
    frameCount: 4,
    idleAnim: 'arcade_idle',
    activeAnim: 'arcade_active',
    generate: generateWorkstation,
    glowColor: 0xff00ff,
    activeGlowColor: 0xff00ff,
    floorGlowColor: 0x00ff66,
  },

  labels: {
    mainLabel: '[ ARCADE FLOOR ]',
    mainLabelColor: '#00ffff',
    counterLabel: 'FRONT COUNTER',
    counterLabelColor: '#ff9900',
    loungeLabel: 'LOUNGE',
    loungeLabelColor: '#aa88ff',
  },

  titleSign: {
    bgColor: 0x0a0a1a,
    bgAlpha: 0.8,
    shadowColor: '#ff00ff',
    textColor: '#ff44ff',
    glowColor: 0xff00ff,
  },

  signs: [
    { x: 80, y: 15, text: 'NOW CODING', color: '#00ff66', baseAlpha: 0.7, flickerMs: 2200 },
    { x: 700, y: 15, text: 'HIGH SCORE', color: '#ffff00', baseAlpha: 0.6, flickerMs: 1800 },
    { x: 60, y: 358, text: 'OPEN 24/7', color: '#00ccff', baseAlpha: 0.4, flickerMs: 3000 },
    { x: 760, y: 358, text: 'CHILL ZONE', color: '#aa88ff', baseAlpha: 0.4, flickerMs: 2800 },
  ],

  props: [
    { textureKey: 'prop_plant', x: 22, y: 58, scale: 2, depth: 4, generate: generatePlant },
    { textureKey: 'prop_plant', x: 778, y: 58, scale: 2, depth: 4, generate: () => {} },
    { textureKey: 'prop_plant', x: 22, y: 420, scale: 2, depth: 4, generate: () => {} },
    { textureKey: 'prop_plant', x: 778, y: 420, scale: 2, depth: 4, generate: () => {} },
    { textureKey: 'prop_poster', x: 160, y: 24, scale: 1.5, depth: 3, generate: generatePoster },
    { textureKey: 'prop_poster2', x: 560, y: 24, scale: 1.5, depth: 3, generate: generatePoster2 },
    { textureKey: 'prop_vending', x: 395, y: 420, scale: 1.5, depth: 4, generate: generateVending },
    { textureKey: 'prop_couch', x: 560, y: 430, scale: 1.5, depth: 4, generate: generateCouch },
    { textureKey: 'prop_couch', x: 700, y: 430, scale: 1.5, depth: 4, generate: () => {} },
    { textureKey: 'prop_coffee', x: 32, y: 380, scale: 1.5, depth: 4, generate: generateCoffee },
  ],

  particles: {
    count: 12,
    color: 0xffffff,
    minAlpha: 0.04,
    maxAlpha: 0.18,
    durationRange: [4000, 8000],
    driftRange: [-50, 50],
  },

  showScanlines: true,
  scanlineAlpha: 0.8,
  showVignette: true,

  hudAccentColor: '#ff00ff',
};
