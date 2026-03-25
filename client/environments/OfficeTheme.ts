import type { EnvironmentTheme } from './EnvironmentTheme';

function generateFloors(textures: Phaser.Textures.TextureManager) {
  const s = 32;

  // Office floor: commercial carpet tile
  const officeCanvas = textures.createCanvas('floor_office', s, s)!;
  const octx = officeCanvas.getContext();
  for (let py = 0; py < s; py++) {
    for (let px = 0; px < s; px++) {
      octx.fillStyle = (Math.floor(px / 4) + Math.floor(py / 4)) % 2 === 0 ? '#28283a' : '#2a2a3e';
      octx.fillRect(px, py, 1, 1);
    }
  }
  // Tile edge grid lines
  octx.fillStyle = '#333348';
  octx.fillRect(0, 0, s, 1);
  octx.fillRect(0, 0, 1, s);
  officeCanvas.refresh();

  // Reception floor: light linoleum with speckle
  const recepCanvas = textures.createCanvas('floor_office_reception', s, s)!;
  const rctx = recepCanvas.getContext();
  for (let py = 0; py < s; py++) {
    rctx.fillStyle = py % 4 < 2 ? '#2a2830' : '#2e2c34';
    rctx.fillRect(0, py, s, 1);
  }
  // Speckle pattern
  rctx.fillStyle = 'rgba(60, 55, 70, 0.4)';
  rctx.fillRect(3, 4, 1, 1);
  rctx.fillRect(11, 8, 1, 1);
  rctx.fillRect(22, 3, 1, 1);
  rctx.fillRect(17, 15, 1, 1);
  rctx.fillRect(7, 22, 1, 1);
  rctx.fillRect(28, 19, 1, 1);
  recepCanvas.refresh();

  // Break room floor: checkered with soft blue tint
  const breakCanvas = textures.createCanvas('floor_office_break', 16, 16)!;
  const bctx = breakCanvas.getContext();
  for (let py = 0; py < 16; py++) {
    for (let px = 0; px < 16; px++) {
      bctx.fillStyle = (px + py) % 2 === 0 ? '#222240' : '#24243e';
      bctx.fillRect(px, py, 1, 1);
    }
  }
  breakCanvas.refresh();

  // Lobby entrance floor
  const lobbyCanvas = textures.createCanvas('floor_office_lobby', 16, 16)!;
  const lctx = lobbyCanvas.getContext();
  for (let py = 0; py < 16; py++) {
    for (let px = 0; px < 16; px++) {
      lctx.fillStyle = (px + py) % 2 === 0 ? '#181824' : '#1a1a28';
      lctx.fillRect(px, py, 1, 1);
    }
  }
  lobbyCanvas.refresh();
}

function generateWorkstation(textures: Phaser.Textures.TextureManager, anims: Phaser.Animations.AnimationManager) {
  const w = 32, h = 32;
  const canvas = textures.createCanvas('office_desk', w * 4, h)!;
  const ctx = canvas.getContext();

  for (let frame = 0; frame < 4; frame++) {
    drawOfficeDesk(ctx, frame * w, 0, frame);
  }
  canvas.refresh();

  const tex = textures.get('office_desk');
  for (let i = 0; i < 4; i++) tex.add(i + 1, 0, i * w, 0, w, h);

  anims.create({ key: 'desk_idle', frames: [{ key: 'office_desk', frame: 1 }], frameRate: 1, repeat: -1 });
  anims.create({
    key: 'desk_active',
    frames: [{ key: 'office_desk', frame: 2 }, { key: 'office_desk', frame: 3 }, { key: 'office_desk', frame: 4 }],
    frameRate: 4,
    repeat: -1,
  });
}

function drawOfficeDesk(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  // Desk surface
  ctx.fillStyle = '#5a5a6a';
  ctx.fillRect(x + 3, y + 18, 26, 4);
  // Desk front edge highlight
  ctx.fillStyle = '#6a6a7a';
  ctx.fillRect(x + 3, y + 18, 26, 1);
  // Desk legs
  ctx.fillStyle = '#4a4a5a';
  ctx.fillRect(x + 4, y + 22, 2, 8);
  ctx.fillRect(x + 26, y + 22, 2, 8);
  // Cross support
  ctx.fillStyle = '#444455';
  ctx.fillRect(x + 6, y + 26, 20, 1);

  // Monitor stand
  ctx.fillStyle = '#333348';
  ctx.fillRect(x + 14, y + 14, 4, 4);
  // Monitor base
  ctx.fillRect(x + 11, y + 17, 10, 2);

  // Monitor frame
  ctx.fillStyle = '#333348';
  ctx.fillRect(x + 6, y + 2, 20, 13);
  // Monitor bezel
  ctx.fillStyle = '#2a2a3a';
  ctx.fillRect(x + 6, y + 2, 20, 1);
  ctx.fillRect(x + 6, y + 14, 20, 1);
  ctx.fillRect(x + 6, y + 2, 1, 13);
  ctx.fillRect(x + 25, y + 2, 1, 13);

  // Monitor screen
  if (frame === 0) {
    // Powered off
    ctx.fillStyle = '#111122';
    ctx.fillRect(x + 7, y + 3, 18, 11);
    // Power LED (red = off)
    ctx.fillStyle = '#880000';
    ctx.fillRect(x + 15, y + 14, 2, 1);
  } else {
    // Screen on - blue desktop
    ctx.fillStyle = '#001144';
    ctx.fillRect(x + 7, y + 3, 18, 11);

    // Code lines
    ctx.fillStyle = `rgba(68, 136, 204, ${0.4 + frame * 0.15})`;
    ctx.fillRect(x + 8, y + 4, 5 + frame * 2, 1);
    ctx.fillRect(x + 10, y + 6, 3 + frame, 1);
    ctx.fillRect(x + 8, y + 8, 7, 1);
    if (frame >= 2) {
      ctx.fillRect(x + 9, y + 10, 4 + frame, 1);
      ctx.fillRect(x + 8, y + 12, 6, 1);
    }

    // Cursor blink
    if (frame === 2) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 8 + 7, y + 8, 1, 1);
    }

    // Progress bar (frame 3)
    if (frame === 3) {
      ctx.fillStyle = '#222244';
      ctx.fillRect(x + 8, y + 12, 16, 1);
      ctx.fillStyle = '#3366cc';
      ctx.fillRect(x + 8, y + 12, 11, 1);
    }

    // Scanlines on monitor
    ctx.fillStyle = `rgba(100, 150, 255, ${0.04 + frame * 0.01})`;
    for (let sy = 0; sy < 11; sy += 2) {
      ctx.fillRect(x + 7, y + 3 + sy, 18, 1);
    }

    // Screen glow
    ctx.fillStyle = `rgba(68, 136, 204, ${0.02 + frame * 0.01})`;
    ctx.fillRect(x + 5, y + 1, 22, 15);

    // Power LED (green = on)
    ctx.fillStyle = '#00cc44';
    ctx.fillRect(x + 15, y + 14, 2, 1);
  }

  // Keyboard
  ctx.fillStyle = '#444455';
  ctx.fillRect(x + 9, y + 19, 10, 2);
  // Key rows
  ctx.fillStyle = '#555566';
  ctx.fillRect(x + 10, y + 19, 8, 1);
  // Key gaps
  ctx.fillStyle = '#333344';
  ctx.fillRect(x + 12, y + 19, 1, 2);
  ctx.fillRect(x + 15, y + 19, 1, 2);

  // Mouse
  ctx.fillStyle = '#555566';
  ctx.fillRect(x + 21, y + 19, 2, 2);
  ctx.fillStyle = '#666677';
  ctx.fillRect(x + 21, y + 19, 2, 1);

  // Coffee mug
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 5, y + 19, 3, 2);
  ctx.fillStyle = '#8B6914';
  ctx.fillRect(x + 5, y + 19, 3, 1);
  // Mug handle
  ctx.fillStyle = '#dddddd';
  ctx.fillRect(x + 4, y + 19, 1, 2);
}

function generateOfficePlant(textures: Phaser.Textures.TextureManager) {
  const plant = textures.createCanvas('prop_office_plant', 16, 16)!;
  const ctx = plant.getContext();
  // Pot
  ctx.fillStyle = '#5a4a3e';
  ctx.fillRect(5, 11, 6, 4);
  ctx.fillStyle = '#6a5a4e';
  ctx.fillRect(4, 10, 8, 2);
  // Soil
  ctx.fillStyle = '#3a2a1e';
  ctx.fillRect(5, 10, 6, 1);
  // Stem
  ctx.fillStyle = '#336633';
  ctx.fillRect(7, 4, 2, 7);
  // Leaves - natural green
  ctx.fillStyle = '#44884a';
  ctx.fillRect(4, 3, 3, 2);
  ctx.fillRect(9, 2, 3, 2);
  ctx.fillRect(5, 6, 2, 2);
  ctx.fillRect(10, 5, 2, 2);
  // Leaf highlights
  ctx.fillStyle = '#55aa55';
  ctx.fillRect(5, 3, 1, 1);
  ctx.fillRect(10, 2, 1, 1);
  plant.refresh();
}

function generateWhiteboard(textures: Phaser.Textures.TextureManager) {
  const wb = textures.createCanvas('prop_whiteboard', 16, 20)!;
  const ctx = wb.getContext();
  // Frame
  ctx.fillStyle = '#555555';
  ctx.fillRect(0, 0, 16, 20);
  // White surface
  ctx.fillStyle = '#e0e0e8';
  ctx.fillRect(1, 1, 14, 16);
  // Tray
  ctx.fillStyle = '#444444';
  ctx.fillRect(1, 17, 14, 2);
  // Markers in tray
  ctx.fillStyle = '#3366cc';
  ctx.fillRect(3, 17, 1, 2);
  ctx.fillStyle = '#cc3333';
  ctx.fillRect(5, 17, 1, 2);
  ctx.fillStyle = '#33aa33';
  ctx.fillRect(7, 17, 1, 2);
  // Scribbled content
  ctx.fillStyle = '#3366cc';
  ctx.fillRect(3, 3, 8, 1);
  ctx.fillRect(3, 5, 6, 1);
  ctx.fillRect(3, 7, 10, 1);
  // Red annotation circle
  ctx.fillStyle = '#cc3333';
  ctx.fillRect(9, 9, 4, 1);
  ctx.fillRect(8, 10, 1, 2);
  ctx.fillRect(13, 10, 1, 2);
  ctx.fillRect(9, 12, 4, 1);
  // Diagram boxes
  ctx.fillStyle = '#3366cc';
  ctx.fillRect(3, 10, 3, 2);
  ctx.fillRect(3, 14, 5, 1);
  wb.refresh();
}

function generateWhiteboard2(textures: Phaser.Textures.TextureManager) {
  const wb = textures.createCanvas('prop_whiteboard2', 16, 20)!;
  const ctx = wb.getContext();
  // Frame
  ctx.fillStyle = '#555555';
  ctx.fillRect(0, 0, 16, 20);
  // White surface
  ctx.fillStyle = '#e0e0e8';
  ctx.fillRect(1, 1, 14, 16);
  // Tray
  ctx.fillStyle = '#444444';
  ctx.fillRect(1, 17, 14, 2);
  // Content: org chart / flow diagram
  ctx.fillStyle = '#3366cc';
  ctx.fillRect(6, 2, 4, 2);   // top box
  ctx.fillRect(7, 4, 2, 2);   // line down
  ctx.fillRect(3, 6, 4, 2);   // left box
  ctx.fillRect(9, 6, 4, 2);   // right box
  ctx.fillRect(5, 5, 6, 1);   // horizontal line
  // Checkmarks
  ctx.fillStyle = '#33aa33';
  ctx.fillRect(3, 10, 1, 1);
  ctx.fillRect(4, 11, 1, 1);
  ctx.fillRect(5, 10, 1, 1);
  ctx.fillStyle = '#666666';
  ctx.fillRect(7, 10, 5, 1);
  ctx.fillRect(7, 12, 4, 1);
  ctx.fillRect(7, 14, 6, 1);
  wb.refresh();
}

function generateWaterCooler(textures: Phaser.Textures.TextureManager) {
  const wc = textures.createCanvas('prop_water_cooler', 16, 24)!;
  const ctx = wc.getContext();
  // Main body
  ctx.fillStyle = '#d0d0d8';
  ctx.fillRect(3, 8, 10, 12);
  // Top
  ctx.fillStyle = '#c0c0c8';
  ctx.fillRect(2, 7, 12, 2);
  // Water jug (inverted)
  ctx.fillStyle = '#4488cc';
  ctx.fillRect(5, 0, 6, 8);
  // Jug highlight
  ctx.fillStyle = '#66aadd';
  ctx.fillRect(6, 1, 2, 6);
  // Jug neck
  ctx.fillStyle = '#3377bb';
  ctx.fillRect(6, 7, 4, 2);
  // Taps
  ctx.fillStyle = '#cc3333';
  ctx.fillRect(4, 12, 2, 2); // hot
  ctx.fillStyle = '#3366cc';
  ctx.fillRect(10, 12, 2, 2); // cold
  // Drip tray
  ctx.fillStyle = '#888888';
  ctx.fillRect(3, 16, 10, 2);
  // Cup dispenser
  ctx.fillStyle = '#bbbbbb';
  ctx.fillRect(3, 10, 3, 2);
  // Base
  ctx.fillStyle = '#999999';
  ctx.fillRect(2, 20, 12, 4);
  ctx.fillStyle = '#888888';
  ctx.fillRect(3, 22, 10, 2);
  wc.refresh();
}

function generateOfficeChair(textures: Phaser.Textures.TextureManager) {
  const chair = textures.createCanvas('prop_office_chair', 32, 14)!;
  const ctx = chair.getContext();
  // Chair back - two chairs side by side
  // Chair 1
  ctx.fillStyle = '#3a3a4a';
  ctx.fillRect(2, 0, 12, 6); // back
  ctx.fillStyle = '#444455';
  ctx.fillRect(2, 5, 12, 6); // seat
  // Armrests
  ctx.fillStyle = '#333344';
  ctx.fillRect(0, 3, 3, 7);
  ctx.fillRect(13, 3, 3, 7);
  // Base
  ctx.fillStyle = '#222222';
  ctx.fillRect(5, 11, 6, 1);
  ctx.fillRect(7, 12, 2, 2); // post
  // Casters
  ctx.fillStyle = '#333333';
  ctx.fillRect(3, 13, 2, 1);
  ctx.fillRect(11, 13, 2, 1);

  // Chair 2
  ctx.fillStyle = '#3a3a4a';
  ctx.fillRect(18, 0, 12, 6);
  ctx.fillStyle = '#444455';
  ctx.fillRect(18, 5, 12, 6);
  ctx.fillStyle = '#333344';
  ctx.fillRect(16, 3, 3, 7);
  ctx.fillRect(29, 3, 3, 7);
  ctx.fillStyle = '#222222';
  ctx.fillRect(21, 11, 6, 1);
  ctx.fillRect(23, 12, 2, 2);
  ctx.fillStyle = '#333333';
  ctx.fillRect(19, 13, 2, 1);
  ctx.fillRect(27, 13, 2, 1);
  chair.refresh();
}

function generateMicrowave(textures: Phaser.Textures.TextureManager) {
  const mw = textures.createCanvas('prop_microwave', 12, 16)!;
  const ctx = mw.getContext();
  // Counter/shelf
  ctx.fillStyle = '#5a5a6a';
  ctx.fillRect(0, 0, 12, 2);
  // Body
  ctx.fillStyle = '#d0d0d8';
  ctx.fillRect(0, 2, 12, 10);
  // Door window
  ctx.fillStyle = '#222222';
  ctx.fillRect(1, 3, 7, 7);
  // Door frame
  ctx.fillStyle = '#bbbbbb';
  ctx.fillRect(1, 3, 7, 1);
  ctx.fillRect(1, 9, 7, 1);
  ctx.fillRect(1, 3, 1, 7);
  ctx.fillRect(7, 3, 1, 7);
  // Inner window reflection
  ctx.fillStyle = '#333333';
  ctx.fillRect(2, 4, 5, 5);
  // Handle
  ctx.fillStyle = '#aaaaaa';
  ctx.fillRect(8, 5, 1, 4);
  // Control panel
  ctx.fillStyle = '#444444';
  ctx.fillRect(9, 3, 3, 7);
  // Digital display
  ctx.fillStyle = '#001100';
  ctx.fillRect(9, 3, 3, 2);
  // Clock "12:00"
  ctx.fillStyle = '#00cc00';
  ctx.fillRect(10, 4, 1, 1);
  // Buttons
  ctx.fillStyle = '#888888';
  ctx.fillRect(10, 6, 1, 1);
  ctx.fillRect(10, 8, 1, 1);
  // LED
  ctx.fillStyle = '#00ff00';
  ctx.fillRect(10, 9, 1, 1);
  // Legs / base
  ctx.fillStyle = '#bbbbbb';
  ctx.fillRect(0, 12, 12, 1);
  // Bottom shelf with mug
  ctx.fillStyle = '#5a5a6a';
  ctx.fillRect(0, 13, 12, 3);
  // Small mug on shelf
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(3, 14, 3, 2);
  ctx.fillStyle = '#8B6914';
  ctx.fillRect(4, 14, 1, 1);
  mw.refresh();
}

export const OFFICE_THEME: EnvironmentTheme = {
  type: 'office',
  backgroundColor: '#1a1a24',

  floors: {
    main: { key: 'floor_office', generate: generateFloors },
    counter: { key: 'floor_office_reception', generate: () => {} },
    lounge: { key: 'floor_office_break', generate: () => {} },
    entrance: { key: 'floor_office_lobby', generate: () => {} },
  },

  wall: {
    baseColor: 0x2a2a3e,
    stripeColor: 0x333348,
    stripeAlpha: 0.3,
    edgeColor: 0x1a1a28,
    highlightColor: 0x3a3a4e,
    highlightAlpha: 0.4,
    neonStripColor: 0xf0f0ff,
    neonStripAlpha: 0.4,
    neonGlowAlpha: 0.05,
  },

  bottomStrip: {
    counterSurfaceColor: 0x5a5a6a,
    counterDarkColor: 0x4a4a5a,
    counterAccentColor: 0x3a3a4a,
    showBell: false,
    loungeAccentColor: 0x333348,
    loungeAccentAlpha: 0.3,
  },

  zoneDividerColor: 0x3a3a4e,
  zoneDividerAlpha: 0.3,

  workstation: {
    textureKey: 'office_desk',
    frameCount: 4,
    idleAnim: 'desk_idle',
    activeAnim: 'desk_active',
    generate: generateWorkstation,
    glowColor: 0x3366cc,
    activeGlowColor: 0x4488dd,
    floorGlowColor: 0x3366cc,
  },

  labels: {
    mainLabel: '[ OFFICE FLOOR ]',
    mainLabelColor: '#4488dd',
    counterLabel: 'RECEPTION',
    counterLabelColor: '#6688aa',
    loungeLabel: 'BREAK ROOM',
    loungeLabelColor: '#88aacc',
  },

  titleSign: {
    bgColor: 0x1a1a24,
    bgAlpha: 0.8,
    shadowColor: '#3366cc',
    textColor: '#4488dd',
    glowColor: 0x3366cc,
  },

  signs: [
    { x: 80, y: 15, text: 'IN PROGRESS', color: '#3366cc', baseAlpha: 0.7, flickerMs: 2000 },
    { x: 700, y: 15, text: 'DEADLINES', color: '#ff6644', baseAlpha: 0.6, flickerMs: 1800 },
    { x: 60, y: 358, text: 'HELP DESK', color: '#44aacc', baseAlpha: 0.4, flickerMs: 3000 },
    { x: 760, y: 358, text: 'CHILL ZONE', color: '#88aacc', baseAlpha: 0.4, flickerMs: 2800 },
  ],

  props: [
    { textureKey: 'prop_office_plant', x: 22, y: 58, scale: 2, depth: 4, generate: generateOfficePlant },
    { textureKey: 'prop_office_plant', x: 778, y: 58, scale: 2, depth: 4, generate: () => {} },
    { textureKey: 'prop_office_plant', x: 22, y: 420, scale: 2, depth: 4, generate: () => {} },
    { textureKey: 'prop_office_plant', x: 778, y: 420, scale: 2, depth: 4, generate: () => {} },
    { textureKey: 'prop_whiteboard', x: 160, y: 24, scale: 1.5, depth: 3, generate: generateWhiteboard },
    { textureKey: 'prop_whiteboard2', x: 560, y: 24, scale: 1.5, depth: 3, generate: generateWhiteboard2 },
    { textureKey: 'prop_water_cooler', x: 395, y: 420, scale: 1.5, depth: 4, generate: generateWaterCooler },
    { textureKey: 'prop_office_chair', x: 560, y: 430, scale: 1.5, depth: 4, generate: generateOfficeChair },
    { textureKey: 'prop_office_chair', x: 700, y: 430, scale: 1.5, depth: 4, generate: () => {} },
    { textureKey: 'prop_microwave', x: 32, y: 380, scale: 1.5, depth: 4, generate: generateMicrowave },
  ],

  particles: {
    count: 6,
    color: 0xccccdd,
    minAlpha: 0.02,
    maxAlpha: 0.10,
    durationRange: [5000, 10000],
    driftRange: [-40, 40],
  },

  showScanlines: false,
  scanlineAlpha: 0,
  showVignette: true,

  hudAccentColor: '#3366cc',
};
