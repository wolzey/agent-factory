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
    this.agentManager = new AgentManager(this);

    // Connect to server
    this.socket = new SocketClient();
    this.socket.onMessage((msg: WSMessageToClient) => this.handleMessage(msg));
    this.socket.connect();

    // Neon title
    this.add.text(400, 18, 'AGENT FACTORY', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ff00ff',
      align: 'center',
    }).setOrigin(0.5).setShadow(0, 0, '#ff00ff', 8);

    // Lounge label
    this.add.text(400, 340, '~ LOUNGE ~', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#aa88ff',
      align: 'center',
    }).setOrigin(0.5).setAlpha(0.6);

    // Arcade area label
    this.add.text(400, 50, '[ ARCADE FLOOR ]', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#00ffff',
      align: 'center',
    }).setOrigin(0.5).setAlpha(0.6);
  }

  update(time: number, delta: number) {
    this.agentManager.update(time, delta);
  }

  private handleMessage(msg: WSMessageToClient) {
    switch (msg.type) {
      case 'full_state':
        this.agentManager.handleFullState(msg.agents);
        break;
      case 'agent_update':
        this.agentManager.handleAgentUpdate(msg.agent);
        break;
      case 'agent_remove':
        this.agentManager.handleAgentRemove(msg.sessionId);
        break;
      case 'effect':
        this.agentManager.handleEffect(msg.sessionId, msg.effect, msg.data);
        break;
    }
  }

  private drawBackground() {
    // Dark base
    this.cameras.main.setBackgroundColor('#0a0a1a');

    // Floor tiles (checkerboard pattern)
    const tileSize = 16;
    for (let y = 0; y < 480; y += tileSize) {
      for (let x = 0; x < 800; x += tileSize) {
        const isDark = (Math.floor(x / tileSize) + Math.floor(y / tileSize)) % 2 === 0;
        const rect = this.add.rectangle(
          x + tileSize / 2,
          y + tileSize / 2,
          tileSize, tileSize,
          isDark ? 0x0a0a1a : 0x0d0d22,
        );
        rect.setAlpha(1);
      }
    }

    // Wall at top
    this.add.rectangle(400, 20, 800, 40, 0x16213e);

    // Neon strip on wall
    const neonStrip = this.add.rectangle(400, 38, 800, 2, 0xff00ff);
    neonStrip.setAlpha(0.8);

    // Pulsing neon strip
    this.tweens.add({
      targets: neonStrip,
      alpha: { from: 0.5, to: 1 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Lounge area divider
    this.add.rectangle(400, 330, 700, 2, 0xaa88ff, 0.3);

    // Lounge carpet
    const carpet = this.add.rectangle(400, 390, 720, 80, 0x1a0a2e, 0.5);
    carpet.setStrokeStyle(1, 0xaa88ff, 0.2);

    // Some decorative neon elements
    this.drawNeonDecor();
  }

  private drawNeonDecor() {
    // Left wall neon sign "NOW CODING"
    const sign1 = this.add.text(60, 15, 'NOW CODING', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#00ff66',
    }).setAlpha(0.7);

    this.tweens.add({
      targets: sign1,
      alpha: { from: 0.4, to: 0.9 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
    });

    // Right wall neon sign "HIGH SCORE"
    const sign2 = this.add.text(680, 15, 'HIGH SCORE', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#ffff00',
    }).setAlpha(0.7);

    this.tweens.add({
      targets: sign2,
      alpha: { from: 0.3, to: 0.8 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      delay: 500,
    });

    // Corner decorative pixels (like retro stars)
    const starPositions = [
      { x: 30, y: 60 }, { x: 770, y: 60 },
      { x: 30, y: 460 }, { x: 770, y: 460 },
      { x: 200, y: 330 }, { x: 600, y: 330 },
    ];

    for (const pos of starPositions) {
      const star = this.add.rectangle(pos.x, pos.y, 3, 3, 0xffffff, 0.3);
      this.tweens.add({
        targets: star,
        alpha: { from: 0.1, to: 0.5 },
        duration: Phaser.Math.Between(1000, 3000),
        yoyo: true,
        repeat: -1,
        delay: Phaser.Math.Between(0, 2000),
      });
    }
  }
}
