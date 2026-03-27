import Phaser from 'phaser';
import { SocketClient } from '../network/socket';
import { AgentManager } from '../systems/AgentManager';
import { ChatOverlay } from '../ui/ChatOverlay';
import { AuthManager } from '../auth/AuthManager';
import { LoginOverlay } from '../ui/LoginOverlay';
import { CommandInput } from '../ui/CommandInput';
import type { WSMessageToClient, EnvironmentType } from '@shared/types';
import { getTheme } from '../environments';
import type { EnvironmentTheme } from '../environments';

export class FactoryScene extends Phaser.Scene {
  private socket!: SocketClient;
  private agentManager!: AgentManager;
  private chatOverlay!: ChatOverlay;
  private authManager!: AuthManager;
  private loginOverlay!: LoginOverlay;
  private commandInput!: CommandInput;
  private titleShadow!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private theme!: EnvironmentTheme;

  constructor() {
    super({ key: 'FactoryScene' });
  }

  create(data?: { environment?: EnvironmentType }) {
    const envType = data?.environment ?? 'arcade';
    this.theme = getTheme(envType);

    this.drawBackground();
    this.drawWall();
    this.drawBottomStrip();
    this.drawZoneDividers();
    this.drawNeonSigns();
    this.placeProps();
    this.createAmbientParticles();
    if (this.theme.showScanlines) {
      this.addScanlineOverlay();
    }
    if (this.theme.showVignette) {
      this.addVignette();
    }

    this.applyThemeColors();

    this.agentManager = new AgentManager(this, envType);
    this.chatOverlay = new ChatOverlay();

    this.socket = new SocketClient();
    this.socket.onMessage((msg: WSMessageToClient) => this.handleMessage(msg));

    // Auth
    this.authManager = new AuthManager();

    this.commandInput = new CommandInput(
      this.authManager,
      this.socket,
      (chat) => this.chatOverlay.addMessage(chat),
      () => this.loginOverlay.showLoggedOut(),
    );
    this.commandInput.attachTo(this.chatOverlay.getContainer());

    this.loginOverlay = new LoginOverlay(
      this.authManager,
      this.socket,
      () => this.commandInput.show(),
      () => this.commandInput.hide(),
    );

    // Re-authenticate on reconnect
    this.socket.onConnect(() => {
      if (this.authManager.isLoggedIn && this.authManager.token) {
        this.socket.send({ type: 'auth', token: this.authManager.token });
      }
    });

    this.socket.connect();

    this.fetchConfig();
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
      case 'global_effect':
        if (msg.effect === 'vortex') this.agentManager.triggerVortex();
        break;
      case 'chat_message': this.chatOverlay.addMessage(msg.chat); break;
      case 'auth_result':
        if (msg.success && msg.username) {
          this.authManager.login(this.authManager.token!, msg.username);
          this.loginOverlay.showLoggedIn(msg.username);
        } else {
          this.loginOverlay.showError(msg.error || 'Invalid token');
        }
        break;
    }
  }

  // ── Server config ────────────────────────────────────────────────
  private async fetchConfig() {
    try {
      // Config may already be in registry from BootScene
      const cached = this.registry.get('serverConfig');
      if (cached) {
        if (cached.title) this.applyTitle(cached.title);
        if (cached.graphicDeath !== undefined) this.agentManager.setServerGraphicDeath(cached.graphicDeath);
        return;
      }

      const res = await fetch('/api/config');
      if (!res.ok) return;
      const config = await res.json();
      if (config.title) {
        this.applyTitle(config.title);
      }
      if (config.graphicDeath !== undefined) {
        this.agentManager.setServerGraphicDeath(config.graphicDeath);
      }
    } catch {
      console.warn('[config] Failed to fetch server config');
    }
  }

  private applyTitle(title: string) {
    const upper = title.toUpperCase();
    this.titleShadow.setText(upper);
    this.titleText.setText(upper);
    document.title = title;
    const hudTitle = document.querySelector('.hud-title');
    if (hudTitle) hudTitle.textContent = upper;
  }

  private applyThemeColors() {
    document.documentElement.style.setProperty('--accent-color', this.theme.hudAccentColor);
  }

  // ── Background floors ─────────────────────────────────────────────
  private drawBackground() {
    this.cameras.main.setBackgroundColor(this.theme.backgroundColor);
    const { floors } = this.theme;

    // Main floor (y: 44 to 340)
    this.add.tileSprite(400, 192, 800, 296, floors.main.key).setDepth(0);
    // Counter floor (left half)
    this.add.tileSprite(200, 405, 400, 130, floors.counter.key).setDepth(0);
    // Lounge floor (right half)
    this.add.tileSprite(600, 405, 400, 130, floors.lounge.key).setDepth(0);
    // Entrance strip
    this.add.tileSprite(400, 475, 800, 10, floors.entrance.key).setDepth(0);
  }

  // ── Wall with depth ───────────────────────────────────────────────
  private drawWall() {
    const { wall } = this.theme;

    this.add.rectangle(400, 22, 800, 44, wall.baseColor).setDepth(0);

    for (let by = 0; by < 44; by += 8) {
      this.add.rectangle(400, by + 0.5, 800, 1, wall.stripeColor, wall.stripeAlpha).setDepth(1);
    }

    this.add.rectangle(400, 43, 800, 3, wall.edgeColor).setDepth(1);
    this.add.rectangle(400, 0.5, 800, 1, wall.highlightColor, wall.highlightAlpha).setDepth(1);

    const neonGlow = this.add.rectangle(400, 45, 800, 8, wall.neonStripColor, wall.neonGlowAlpha).setDepth(1);
    const neonStrip = this.add.rectangle(400, 45, 800, 2, wall.neonStripColor, wall.neonStripAlpha).setDepth(1);

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
    const { bottomStrip } = this.theme;

    // Counter surface (left side)
    this.add.rectangle(200, 362, 340, 1, bottomStrip.counterSurfaceColor, 0.7).setDepth(2);
    this.add.rectangle(200, 364, 340, 4, bottomStrip.counterDarkColor, 0.8).setDepth(2);
    this.add.rectangle(200, 369, 340, 8, bottomStrip.counterAccentColor, 0.7).setDepth(2);

    // Bell on counter (only for themes that have it)
    if (bottomStrip.showBell) {
      this.add.rectangle(200, 360, 6, 4, 0xffcc00).setDepth(2);
      this.add.rectangle(200, 358, 2, 2, 0xffffff).setDepth(2);
    }

    // Lounge carpet border (right side)
    const carpet = this.add.rectangle(600, 405, 380, 110, 0x000000, 0).setDepth(1);
    carpet.setStrokeStyle(1, bottomStrip.loungeAccentColor, bottomStrip.loungeAccentAlpha);
  }

  // ── Zone dividers ─────────────────────────────────────────────────
  private drawZoneDividers() {
    const { zoneDividerColor, zoneDividerAlpha } = this.theme;

    // Main -> bottom strip divider
    for (let dx = 30; dx < 770; dx += 12) {
      this.add.rectangle(dx, 340, 6, 1, zoneDividerColor, zoneDividerAlpha).setDepth(1);
    }

    // Vertical divider between counter and lounge
    for (let dy = 345; dy < 465; dy += 8) {
      this.add.rectangle(400, dy, 1, 4, zoneDividerColor, zoneDividerAlpha * 0.75).setDepth(1);
    }
  }

  // ── Neon signs ────────────────────────────────────────────────────
  private drawNeonSigns() {
    const { titleSign, labels } = this.theme;

    // Main title
    this.add.rectangle(400, 22, 220, 28, titleSign.bgColor, titleSign.bgAlpha).setDepth(3);

    this.titleShadow = this.add.text(400, 22, 'AGENT FACTORY', {
      fontFamily: 'monospace', fontSize: '20px', color: titleSign.shadowColor,
    }).setOrigin(0.5).setAlpha(0.3).setDepth(3);
    (this.titleShadow as any).setShadow?.(0, 0, titleSign.shadowColor, 12);

    this.titleText = this.add.text(400, 22, 'AGENT FACTORY', {
      fontFamily: 'monospace', fontSize: '20px', color: titleSign.textColor, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(3);

    const titleGlowRect = this.add.rectangle(400, 22, 230, 32, titleSign.glowColor, 0.04).setDepth(2);
    this.tweens.add({
      targets: titleGlowRect,
      alpha: { from: 0.03, to: 0.08 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
    });

    // Zone labels
    this.add.text(400, 52, labels.mainLabel, {
      fontFamily: 'monospace', fontSize: '10px', color: labels.mainLabelColor,
    }).setOrigin(0.5).setAlpha(0.5).setDepth(3);

    this.add.text(200, 344, labels.counterLabel, {
      fontFamily: 'monospace', fontSize: '9px', color: labels.counterLabelColor,
    }).setOrigin(0.5).setAlpha(0.5).setDepth(3);

    this.add.text(630, 344, labels.loungeLabel, {
      fontFamily: 'monospace', fontSize: '9px', color: labels.loungeLabelColor,
    }).setOrigin(0.5).setAlpha(0.5).setDepth(3);

    // Decorative signs
    for (const sign of this.theme.signs) {
      this.createNeonSign(sign.x, sign.y, sign.text, sign.color, sign.baseAlpha, sign.flickerMs);
    }
  }

  private createNeonSign(x: number, y: number, text: string, color: string, baseAlpha: number, flickerMs: number) {
    const textObj = this.add.text(x, y, text, {
      fontFamily: 'monospace', fontSize: '11px', color,
    }).setOrigin(0.5).setDepth(3);

    const w = textObj.width + 8;
    const h = textObj.height + 4;
    this.add.rectangle(x, y, w, h, parseInt(this.theme.backgroundColor.replace('#', ''), 16), 0.7).setDepth(2);

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
    for (const prop of this.theme.props) {
      this.add.image(prop.x, prop.y, prop.textureKey).setScale(prop.scale).setDepth(prop.depth);
    }
  }

  // ── Ambient particles ────────────────────────────────────────
  private createAmbientParticles() {
    const { particles } = this.theme;

    for (let i = 0; i < particles.count; i++) {
      const dust = this.add.rectangle(
        Phaser.Math.Between(20, 780),
        Phaser.Math.Between(50, 450),
        1, 1, particles.color, particles.minAlpha,
      ).setDepth(10);

      this.tweens.add({
        targets: dust,
        x: dust.x + Phaser.Math.Between(particles.driftRange[0], particles.driftRange[1]),
        y: dust.y + Phaser.Math.Between(Math.floor(particles.driftRange[0] / 2), Math.floor(particles.driftRange[1] / 2)),
        alpha: { from: particles.minAlpha, to: particles.maxAlpha },
        duration: Phaser.Math.Between(particles.durationRange[0], particles.durationRange[1]),
        yoyo: true,
        repeat: -1,
        delay: Phaser.Math.Between(0, 4000),
      });
    }
  }

  // ── CRT scanline overlay ──────────────────────────────────────────
  private addScanlineOverlay() {
    this.add.tileSprite(400, 240, 800, 480, 'scanlines').setDepth(998).setAlpha(this.theme.scanlineAlpha);
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
