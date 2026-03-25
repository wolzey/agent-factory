import Phaser from 'phaser';
import { SocketClient } from '../network/socket';
import { AgentManager } from '../systems/AgentManager';
import type { WSMessageToClient } from '@shared/types';

export class FactoryScene extends Phaser.Scene {
  private socket!: SocketClient;
  private agentManager!: AgentManager;

  constructor() {
    super({ key: 'FactoryScene' });
  }

  create() {
    this.drawBackground();
    this.drawWall();
    this.drawBottomStrip();
    this.drawZoneDividers();
    this.drawNeonSigns();
    this.placeProps();
    this.createAmbientParticles();
    this.addScanlineOverlay();
    this.addVignette();

    this.agentManager = new AgentManager(this);

    this.socket = new SocketClient();
    this.socket.onMessage((msg: WSMessageToClient) => this.handleMessage(msg));
    this.socket.connect();
  }

  update(time: number, delta: number) {
    this.agentManager.update(time, delta);
  }

  private handleMessage(msg: WSMessageToClient) {
    switch (msg.type) {
      case 'full_state': this.agentManager.handleFullState(msg.agents); break;
      case 'agent_update': this.agentManager.handleAgentUpdate(msg.agent); break;
      case 'agent_remove': this.agentManager.handleAgentRemove(msg.sessionId); break;
      case 'effect': this.agentManager.handleEffect(msg.sessionId, msg.effect, msg.data); break;
    }
  }

  // ── Background floors ─────────────────────────────────────────────
  private drawBackground() {
    this.cameras.main.setBackgroundColor('#0a0a1a');

    // Arcade floor (y: 44 to 340)
    this.add.tileSprite(400, 192, 800, 296, 'floor_arcade').setDepth(0);

    // Bottom strip (y: 340 to 470) - counter left, lounge right
    // Counter floor (left half)
    this.add.tileSprite(200, 405, 400, 130, 'floor_counter').setDepth(0);
    // Lounge floor (right half)
    this.add.tileSprite(600, 405, 400, 130, 'floor_lounge').setDepth(0);

    // Entrance strip (y: 470 to 480)
    this.add.tileSprite(400, 475, 800, 10, 'floor_entrance').setDepth(0);
  }

  // ── Wall with depth ───────────────────────────────────────────────
  private drawWall() {
    this.add.rectangle(400, 22, 800, 44, 0x16213e).setDepth(0);

    for (let by = 0; by < 44; by += 8) {
      this.add.rectangle(400, by + 0.5, 800, 1, 0x1a2544, 0.3).setDepth(1);
    }

    this.add.rectangle(400, 43, 800, 3, 0x0f1830).setDepth(1);
    this.add.rectangle(400, 0.5, 800, 1, 0x2a3550, 0.5).setDepth(1);

    const neonGlow = this.add.rectangle(400, 45, 800, 8, 0xff00ff, 0.06).setDepth(1);
    const neonStrip = this.add.rectangle(400, 45, 800, 2, 0xff00ff, 0.8).setDepth(1);

    this.tweens.add({
      targets: [neonStrip, neonGlow],
      alpha: { from: 0.5, to: 1 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // ── Bottom strip: counter (left) + lounge (right) ─────────────────
  private drawBottomStrip() {
    // Counter surface (left side)
    this.add.rectangle(200, 362, 340, 1, 0xc4991a, 0.7).setDepth(2);
    this.add.rectangle(200, 364, 340, 4, 0x8b6914, 0.8).setDepth(2);
    this.add.rectangle(200, 369, 340, 8, 0x5a4510, 0.7).setDepth(2);

    // Bell on counter
    this.add.rectangle(200, 360, 6, 4, 0xffcc00).setDepth(2);
    this.add.rectangle(200, 358, 2, 2, 0xffffff).setDepth(2);

    // Lounge carpet border (right side)
    const carpet = this.add.rectangle(600, 405, 380, 110, 0x000000, 0).setDepth(1);
    carpet.setStrokeStyle(1, 0x2a1050, 0.4);
  }

  // ── Zone dividers ─────────────────────────────────────────────────
  private drawZoneDividers() {
    // Arcade -> bottom strip divider (dashed neon line)
    for (let dx = 30; dx < 770; dx += 12) {
      this.add.rectangle(dx, 340, 6, 1, 0x444466, 0.4).setDepth(1);
    }

    // Vertical divider between counter and lounge
    for (let dy = 345; dy < 465; dy += 8) {
      this.add.rectangle(400, dy, 1, 4, 0x444466, 0.3).setDepth(1);
    }
  }

  // ── Neon signs ────────────────────────────────────────────────────
  private drawNeonSigns() {
    // Main title
    this.add.rectangle(400, 22, 220, 28, 0x0a0a1a, 0.8).setDepth(3);

    const titleShadow = this.add.text(400, 22, 'AGENT FACTORY', {
      fontFamily: 'monospace', fontSize: '20px', color: '#ff00ff',
    }).setOrigin(0.5).setAlpha(0.3).setDepth(3);
    (titleShadow as any).setShadow?.(0, 0, '#ff00ff', 12);

    this.add.text(400, 22, 'AGENT FACTORY', {
      fontFamily: 'monospace', fontSize: '20px', color: '#ff44ff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(3);

    const titleGlowRect = this.add.rectangle(400, 22, 230, 32, 0xff00ff, 0.04).setDepth(2);
    this.tweens.add({
      targets: titleGlowRect,
      alpha: { from: 0.03, to: 0.08 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
    });

    // Arcade label
    this.add.text(400, 52, '[ ARCADE FLOOR ]', {
      fontFamily: 'monospace', fontSize: '10px', color: '#00ffff',
    }).setOrigin(0.5).setAlpha(0.5).setDepth(3);

    // Counter label (left)
    this.add.text(200, 348, '[ FRONT COUNTER ]', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ff9900',
    }).setOrigin(0.5).setAlpha(0.5).setDepth(3);

    // Lounge label (right)
    this.add.text(600, 348, '~ LOUNGE ~', {
      fontFamily: 'monospace', fontSize: '9px', color: '#aa88ff',
    }).setOrigin(0.5).setAlpha(0.5).setDepth(3);

    // Wall neon signs
    this.createNeonSign(80, 15, 'NOW CODING', '#00ff66', 0.7, 2200);
    this.createNeonSign(700, 15, 'HIGH SCORE', '#ffff00', 0.6, 1800);
    this.createNeonSign(280, 15, 'INSERT COIN', '#ff9900', 0.5, 2500);
    this.createNeonSign(130, 348, 'OPEN 24/7', '#00ccff', 0.4, 3000);
    this.createNeonSign(660, 348, 'CHILL ZONE', '#aa88ff', 0.4, 2800);
  }

  private createNeonSign(x: number, y: number, text: string, color: string, baseAlpha: number, flickerMs: number) {
    const textObj = this.add.text(x, y, text, {
      fontFamily: 'monospace', fontSize: '11px', color,
    }).setOrigin(0.5).setDepth(3);

    const w = textObj.width + 8;
    const h = textObj.height + 4;
    this.add.rectangle(x, y, w, h, 0x0a0a1a, 0.7).setDepth(2);

    const colorNum = parseInt(color.replace('#', ''), 16);
    this.add.rectangle(x, y, w + 4, h + 4, colorNum, 0.04).setDepth(2);

    textObj.setDepth(3).setAlpha(baseAlpha);

    this.tweens.add({
      targets: textObj,
      alpha: { from: baseAlpha * 0.5, to: baseAlpha },
      duration: flickerMs,
      yoyo: true,
      repeat: -1,
      delay: Phaser.Math.Between(0, 1000),
    });
  }

  // ── Environmental props ───────────────────────────────────────────
  private placeProps() {
    // Neon plants
    const plantPositions = [
      { x: 22, y: 58 }, { x: 778, y: 58 },
      { x: 22, y: 420 }, { x: 778, y: 420 },
    ];
    for (const p of plantPositions) {
      this.add.image(p.x, p.y, 'prop_plant').setScale(2).setDepth(4);
    }

    // Wall posters
    this.add.image(160, 24, 'prop_poster').setScale(1.5).setDepth(3);
    this.add.image(560, 24, 'prop_poster2').setScale(1.5).setDepth(3);

    // Vending machine (between the two zones)
    this.add.image(395, 420, 'prop_vending').setScale(1.5).setDepth(4);

    // Couches in lounge (right side)
    this.add.image(560, 430, 'prop_couch').setScale(1.5).setDepth(4);
    this.add.image(700, 430, 'prop_couch').setScale(1.5).setDepth(4);

    // Coffee machine near counter (left side)
    this.add.image(32, 380, 'prop_coffee').setScale(1.5).setDepth(4);
  }

  // ── Ambient dust particles ────────────────────────────────────────
  private createAmbientParticles() {
    for (let i = 0; i < 12; i++) {
      const dust = this.add.rectangle(
        Phaser.Math.Between(20, 780),
        Phaser.Math.Between(50, 450),
        1, 1, 0xffffff, 0.12,
      ).setDepth(10);

      this.tweens.add({
        targets: dust,
        x: dust.x + Phaser.Math.Between(-50, 50),
        y: dust.y + Phaser.Math.Between(-25, 25),
        alpha: { from: 0.04, to: 0.18 },
        duration: Phaser.Math.Between(4000, 8000),
        yoyo: true,
        repeat: -1,
        delay: Phaser.Math.Between(0, 4000),
      });
    }
  }

  // ── CRT scanline overlay ──────────────────────────────────────────
  private addScanlineOverlay() {
    this.add.tileSprite(400, 240, 800, 480, 'scanlines').setDepth(998).setAlpha(0.8);
  }

  // ── Vignette ──────────────────────────────────────────────────────
  private addVignette() {
    this.add.rectangle(400, 3, 800, 6, 0x000000, 0.35).setDepth(999);
    this.add.rectangle(400, 9, 800, 6, 0x000000, 0.15).setDepth(999);
    this.add.rectangle(400, 15, 800, 6, 0x000000, 0.05).setDepth(999);
    this.add.rectangle(400, 477, 800, 6, 0x000000, 0.35).setDepth(999);
    this.add.rectangle(400, 471, 800, 6, 0x000000, 0.15).setDepth(999);
    this.add.rectangle(400, 465, 800, 6, 0x000000, 0.05).setDepth(999);
    this.add.rectangle(3, 240, 6, 480, 0x000000, 0.25).setDepth(999);
    this.add.rectangle(9, 240, 6, 480, 0x000000, 0.1).setDepth(999);
    this.add.rectangle(797, 240, 6, 480, 0x000000, 0.25).setDepth(999);
    this.add.rectangle(791, 240, 6, 480, 0x000000, 0.1).setDepth(999);
  }
}
