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
import { SoundBank } from '../audio/SoundBank';
import { ControlManager } from '../control/ControlManager';
import { WorldStore } from '../state/WorldStore';
import { GrabManager } from '../grab/GrabManager';
import { SkylineWindow } from '../sky/SkylineWindow';
import { prefersReducedMotion } from '../sky/motion';
import { createAdjustableClock, formatMountainClock, resolveSkyClock } from '../sky/clock';
import { KeyboardDanceFloor } from '../entities/KeyboardDanceFloor';
import type { Clock } from '../sky/clock';
import { createPartnerSkylineSource } from '../sky/partners';
import { parseWeatherOverride } from '../sky/weather';
import { createKeySequenceMatcher, readStoredSkyDebug, storeSkyDebug } from '../sky/skyDebug';
import type { WeatherVisualState } from '../sky/weather';
import { lerpRgb, rgbToInt } from '../sky/skyPhase';
import type { SkyPalette, SkyState } from '../sky/skyPhase';
import {
  WEATHER_PRESETS,
  searchWithWeatherPreset,
  weatherPresetFromSearch,
} from '../sky/weatherPresets';
import type { WeatherPreset } from '../sky/weatherPresets';
import { hangingObstacleRanges } from '../sky/obstacles';
import { VIEW_HEIGHT, WALL_BAND, WALL_HEADROOM, WORLD_HEIGHT, skylineWindowRect, titleHeaderPosition } from './viewport';

export class FactoryScene extends Phaser.Scene {
  private socket!: SocketClient;
  private agentManager!: AgentManager;
  private chatOverlay!: ChatOverlay;
  private authManager!: AuthManager;
  private loginOverlay!: LoginOverlay;
  private commandInput!: CommandInput;
  private controlManager!: ControlManager;
  private grabManager!: GrabManager;
  private serverBuildId?: string;
  private skylineWindow?: SkylineWindow;
  private plants: Array<{
    image: Phaser.GameObjects.Image;
    lightOverlay?: Phaser.GameObjects.Image;
    outsideLight: number;
    minimumLight: number;
  }> = [];
  private keyboardDanceFloor?: KeyboardDanceFloor;
  private titleShadow!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private theme!: EnvironmentTheme;
  private worldStore = new WorldStore();
  private seenWorldEvents = new Set<string>();
  private renderedChatSignature = '';

  constructor() {
    super({ key: 'FactoryScene' });
  }

  create(data?: { environment?: EnvironmentType }) {
    const envType = data?.environment ?? 'arcade';
    this.theme = getTheme(envType);

    // Expose the back-wall headroom above world y = 0. Every world coordinate is unchanged;
    // pointer input already uses worldX/worldY so grabs and controls are unaffected.
    this.cameras.main.setScroll(0, -WALL_HEADROOM);

    this.drawBackground();
    this.drawWall();
    this.drawBottomStrip();
    if (envType === 'arcade') this.keyboardDanceFloor = new KeyboardDanceFloor(this);
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
    this.controlManager = new ControlManager(this, this.authManager, this.socket, this.agentManager);
    this.grabManager = new GrabManager(this, this.authManager, this.socket, this.agentManager);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.grabManager.destroy());

    const logout = () => {
      this.grabManager.handleLoggedOut();
      this.socket.send({ type: 'logout' });
      this.authManager.logout();
      this.controlManager.handleLoggedOut();
      this.commandInput.hide();
      this.loginOverlay.showLoggedOut();
    };

    this.commandInput = new CommandInput(
      this.socket,
      (chat) => this.chatOverlay.addMessage(chat),
      logout,
      () => this.controlManager.selectedSessionId,
    );
    this.commandInput.attachTo(this.chatOverlay.getContainer());

    this.loginOverlay = new LoginOverlay(
      this.authManager,
      this.socket,
      () => this.commandInput.show(),
      logout,
    );

    // Re-authenticate on reconnect
    this.socket.onConnect(() => {
      // Any visual grab left from the previous socket is stale. The server will
      // immediately re-send leases that are still genuinely active.
      this.agentManager.dropStaleGrabs();
      this.grabManager.handleConnected();
      const token = this.authManager.authenticationToken;
      if (token) {
        this.socket.send({ type: 'auth', token });
      }
    });

    this.socket.connect();

    this.fetchConfig();
    this.initAudio();
  }

  private async initAudio() {
    try {
      const soundBank = new SoundBank();
      await soundBank.initialize();
      this.agentManager.setSoundBank(soundBank);

      // Wire HUD audio controls
      const slider = document.getElementById('volume-slider') as HTMLInputElement | null;
      const toggle = document.getElementById('audio-toggle') as HTMLElement | null;

      if (slider) {
        slider.value = String(Math.round(soundBank.getVolume() * 100));
        slider.addEventListener('input', () => {
          soundBank.setVolume(parseInt(slider.value, 10) / 100);
        });
      }

      if (toggle) {
        const updateIcon = () => { toggle.textContent = soundBank.isMuted() ? '\uD83D\uDD07' : '\uD83D\uDD0A'; };
        updateIcon();
        toggle.addEventListener('click', () => {
          soundBank.setMuted(!soundBank.isMuted());
          updateIcon();
        });
      }
    } catch (e) {
      console.warn('[audio] Sound init failed:', e);
    }
  }

  update(time: number, delta: number) {
    this.agentManager.update(time, delta);
    this.keyboardDanceFloor?.update(this.agentManager.floorPositions(), delta);
    this.grabManager.update();
  }

  /**
   * The server tags snapshots with its build id. After a redeploy the reconnecting tab
   * receives a different id and reloads once, so nobody keeps running a stale bundle.
   */
  private isStaleBuild(buildId: string | undefined): boolean {
    if (!buildId) return false;
    if (this.serverBuildId === undefined) {
      this.serverBuildId = buildId;
      return false;
    }
    return this.serverBuildId !== buildId;
  }

  private handleMessage(msg: WSMessageToClient) {
    switch (msg.type) {
      case 'world_snapshot':
        if (this.isStaleBuild(msg.buildId)) {
          window.location.reload();
          return;
        }
        this.worldStore.replace(msg.snapshot);
        this.renderWorld();
        break;
      case 'world_delta': {
        const result = this.worldStore.apply(msg.delta);
        if (result === 'gap') {
          this.socket.send({ type: 'request_state' });
        } else if (result === 'applied') {
          this.renderWorld();
        }
        break;
      }
      case 'full_state':
        this.agentManager.handleFullState(msg.agents);
        this.controlManager.handleStateChanged();
        break;
      case 'agent_update':
        this.agentManager.handleAgentUpdate(msg.agent);
        this.controlManager.handleStateChanged();
        break;
      case 'agent_remove':
        this.agentManager.handleAgentRemove(msg.sessionId);
        this.controlManager.handleStateChanged();
        break;
      case 'effect': this.agentManager.handleEffect(msg.sessionId, msg.effect, msg.data); break;
      case 'global_effect':
        if (msg.effect === 'vortex') this.agentManager.triggerVortex();
        break;
      case 'chat_message': this.chatOverlay.addMessage(msg.chat); break;
      case 'auth_result':
        if (msg.success && msg.username && this.authManager.completeLogin(msg.username)) {
          this.loginOverlay.showLoggedIn(msg.username);
          this.controlManager.handleAuthenticated(msg.username);
        } else {
          this.authManager.logout();
          this.controlManager.handleLoggedOut();
          this.grabManager.handleLoggedOut();
          this.commandInput.hide();
          this.loginOverlay.showLoggedOut();
          this.loginOverlay.showError(msg.error || 'Invalid token');
        }
        break;
      case 'control_result':
      case 'control_revoked':
        this.controlManager.handleMessage(msg);
        break;
      case 'grab_result':
      case 'grab_update':
      case 'grab_release':
        this.grabManager.handleMessage(msg);
        break;
    }
  }

  private renderWorld(): void {
    const snapshot = this.worldStore.snapshot;
    if (!snapshot) return;
    this.agentManager.handleWorldSnapshot(snapshot);
    const lastChat = snapshot.chat.at(-1);
    const chatSignature = `${snapshot.chat.length}:${lastChat?.timestamp ?? 0}:${lastChat?.username ?? ''}:${lastChat?.message ?? ''}`;
    if (chatSignature !== this.renderedChatSignature) {
      this.renderedChatSignature = chatSignature;
      this.chatOverlay.replaceMessages(snapshot.chat);
    }
    this.controlManager.handleStateChanged();

    for (const event of snapshot.events) {
      if (event.expiresAt <= snapshot.serverTime || this.seenWorldEvents.has(event.id)) continue;
      this.seenWorldEvents.add(event.id);
      if (event.effect === 'vortex') {
        this.agentManager.triggerVortex(event.startedAt, event.expiresAt, snapshot.serverTime);
      }
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

    const wallHeight = WALL_BAND.bottom - WALL_BAND.top;
    this.add.rectangle(400, WALL_BAND.top + wallHeight / 2, 800, wallHeight, wall.baseColor).setDepth(0);

    for (let by = WALL_BAND.top; by < WALL_BAND.bottom; by += 8) {
      this.add.rectangle(400, by + 0.5, 800, 1, wall.stripeColor, wall.stripeAlpha).setDepth(1);
    }

    // Skyline window: the glass fills the back wall band above the room (see viewport.ts).
    // Signs and the title keep their depth so they hang in front of the glass.
    if (this.theme.skylineWindow) {
      const glass = skylineWindowRect();
      const partners = this.theme.skylineWindow.partners;
      const search = typeof window !== 'undefined' ? window.location.search : '';
      const params = new URLSearchParams(search);
      const adjustableClock = createAdjustableClock(resolveSkyClock(search));
      const skyClock = adjustableClock.clock;
      const weatherOverride = parseWeatherOverride(search);
      this.skylineWindow = new SkylineWindow(this, {
        ...glass,
        depth: 1,
        style: this.theme.skylineWindow,
        clock: skyClock,
        weatherOverride,
        shootingStarDelaySeconds: params.has('skyDebug') ? [1, 3] : undefined,
        reducedMotion: prefersReducedMotion(),
        onLightingChange: (palette, weather, state) => this.updateWindowPlantLighting(palette, weather, state),
        source: partners && partners.length > 0
          ? createPartnerSkylineSource(partners, undefined, {
            avoid: hangingObstacleRanges(this.theme.signs, this.theme.props, glass),
            panes: this.theme.skylineWindow.panes,
          })
          : undefined,
      }).create();
      const headerY = titleHeaderPosition().y;
      const clock = this.createWindowClock(glass.x + glass.width - 105, headerY, skyClock);
      let debugControls: Array<() => void> | null = null;
      const setSkyDebug = (enabled: boolean) => {
        if (enabled === (debugControls !== null)) return;
        const globals = window as unknown as { __skylineWindow?: SkylineWindow };
        if (enabled) {
          debugControls = [
            this.attachClockDrag(clock, skyClock, adjustableClock.set),
            this.createWeatherControl(
              glass.x + glass.width - 178,
              headerY,
              weatherPresetFromSearch(window.location.search) ?? WEATHER_PRESETS[0],
            ),
          ];
          // Exposed for visual QA (tooltip text, partner targets, sky state).
          globals.__skylineWindow = this.skylineWindow;
        } else {
          for (const dispose of debugControls ?? []) dispose();
          debugControls = null;
          delete globals.__skylineWindow;
        }
        this.tweens.add({ targets: clock.display, scale: { from: 1.4, to: 1 }, duration: 350, ease: 'Back.easeOut' });
      };
      if (typeof window !== 'undefined') {
        if (params.has('skyDebug') || readStoredSkyDebug(window.localStorage)) setSkyDebug(true);
        const matchCode = createKeySequenceMatcher();
        const onKeyDown = (event: KeyboardEvent) => {
          const tag = (event.target as HTMLElement | null)?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA') return;
          if (!matchCode(event.key)) return;
          const enabled = debugControls === null;
          setSkyDebug(enabled);
          storeSkyDebug(window.localStorage, enabled);
        };
        document.addEventListener('keydown', onKeyDown);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => document.removeEventListener('keydown', onKeyDown));
      }
    }

    this.add.rectangle(400, 43, 800, 3, wall.edgeColor).setDepth(1);
    this.add.rectangle(400, WALL_BAND.top + 0.5, 800, 1, wall.highlightColor, wall.highlightAlpha).setDepth(1);

    if (wall.neonStripAlpha > 0 || wall.neonGlowAlpha > 0) {
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
  }

  private createWindowClock(x: number, y: number, clock: Clock) {
    const background = this.add.rectangle(x, y, 34, 16, 0x080708, 0.88)
      .setStrokeStyle(1, 0x5e1118, 0.9)
      .setDepth(3);
    const display = this.add.text(x, y, formatMountainClock(clock()), {
      fontFamily: 'monospace', fontSize: '9px', color: '#ff3344', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(4);
    display.setShadow(0, 0, '#ff2233', 4);
    this.time.addEvent({
      delay: 250,
      loop: true,
      callback: () => display.setText(formatMountainClock(clock())),
    });
    return { background, display };
  }

  /** Debug-only clock scrubbing; returns a disposer that removes the drag target. */
  private attachClockDrag(
    { background, display }: { background: Phaser.GameObjects.Rectangle; display: Phaser.GameObjects.Text },
    clock: Clock,
    setClock: (timestamp: number) => void,
  ): () => void {
    const hitArea = this.add.zone(background.x, background.y, 44, 24)
      .setDepth(5)
      .setInteractive({ cursor: 'ew-resize' });
    let activePointerId: number | null = null;
    let dragStartX = 0;
    let dragStartTime = 0;

    const stopDragging = (pointer: Phaser.Input.Pointer) => {
      if (pointer.id !== activePointerId) return;
      activePointerId = null;
      background.setStrokeStyle(1, 0x5e1118, 0.9);
      display.setScale(1);
      const params = new URLSearchParams(window.location.search);
      params.set('skyTime', new Date(clock()).toISOString());
      params.delete('skySpeed');
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}${window.location.hash}`);
    };

    hitArea.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      activePointerId = pointer.id;
      dragStartX = pointer.worldX;
      dragStartTime = clock();
      background.setStrokeStyle(1, 0xff3344, 1);
      display.setScale(1.08);
    });
    const moveClock = (pointer: Phaser.Input.Pointer) => {
      if (pointer.id !== activePointerId) return;
      setClock(dragStartTime - (pointer.worldX - dragStartX) * 4 * 60_000);
      display.setText(formatMountainClock(clock()));
      this.skylineWindow?.refresh();
    };
    this.input.on('pointermove', moveClock);
    this.input.on('pointerup', stopDragging);
    this.input.on('pointerupoutside', stopDragging);
    const dispose = () => {
      this.input.off('pointermove', moveClock);
      this.input.off('pointerup', stopDragging);
      this.input.off('pointerupoutside', stopDragging);
      hitArea.destroy();
      background.setStrokeStyle(1, 0x5e1118, 0.9);
      display.setScale(1);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, dispose);
    return dispose;
  }

  /** Debug-only weather preset menu; returns a disposer that removes it. */
  private createWeatherControl(x: number, y: number, initial: WeatherPreset): () => void {
    const width = 58;
    const rowHeight = 12;
    let active = initial;
    let expanded = false;

    const button = this.add.rectangle(x, y, width, 16, 0x080b14, 0.94)
      .setStrokeStyle(1, 0x165a68, 0.95)
      .setDepth(30)
      .setInteractive({ cursor: 'pointer' });
    const label = this.add.text(x, y, active.label.toUpperCase(), {
      fontFamily: 'monospace', fontSize: '7px', color: '#5cecff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(31);

    const menu = this.add.container(x, y + 15).setDepth(32).setVisible(false);
    WEATHER_PRESETS.forEach((preset, index) => {
      const rowY = index * rowHeight;
      const background = this.add.rectangle(0, rowY, width, rowHeight - 1, 0x080b14, 0.97)
        .setStrokeStyle(1, 0x165a68, 0.7)
        .setInteractive({ cursor: 'pointer' });
      const text = this.add.text(0, rowY, preset.label.toUpperCase(), {
        fontFamily: 'monospace', fontSize: '6px', color: '#b8f8ff',
      }).setOrigin(0.5);
      const choose = () => {
        active = preset;
        label.setText(active.label.toUpperCase());
        this.skylineWindow?.setWeather(active.state);
        const search = searchWithWeatherPreset(window.location.search, active.id);
        window.history.replaceState(null, '', `${window.location.pathname}${search}${window.location.hash}`);
        expanded = false;
        menu.setVisible(false);
        button.setStrokeStyle(1, 0x165a68, 0.95);
      };
      background.on('pointerover', () => background.setFillStyle(0x123844, 0.98));
      background.on('pointerout', () => background.setFillStyle(0x080b14, 0.97));
      background.on('pointerdown', choose);
      text.setInteractive({ cursor: 'pointer' }).on('pointerdown', choose);
      menu.add([background, text]);
    });

    button.on('pointerdown', () => {
      expanded = !expanded;
      menu.setVisible(expanded);
      button.setStrokeStyle(1, expanded ? 0x5cecff : 0x165a68, 1);
    });
    label.setInteractive({ cursor: 'pointer' }).on('pointerdown', () => button.emit('pointerdown'));
    return () => {
      button.destroy();
      label.destroy();
      menu.destroy(true);
    };
  }

  // ── Bottom strip: counter (left) + lounge (right) ─────────────────
  private drawBottomStrip() {
    const { bottomStrip } = this.theme;

    // Counter surface (left side)
    this.add.rectangle(165, 362, 270, 1, bottomStrip.counterSurfaceColor, 0.7).setDepth(2);
    this.add.rectangle(165, 364, 270, 4, bottomStrip.counterDarkColor, 0.8).setDepth(2);
    this.add.rectangle(165, 369, 270, 8, bottomStrip.counterAccentColor, 0.7).setDepth(2);

    // Bell on counter (only for themes that have it)
    if (bottomStrip.showBell) {
      this.add.rectangle(165, 360, 6, 4, 0xffcc00).setDepth(2);
      this.add.rectangle(165, 358, 2, 2, 0xffffff).setDepth(2);
    }

    // Lounge carpet border (right side)
    const carpet = this.add.rectangle(600, 405, 380, 110, 0x000000, 0).setDepth(1);
    carpet.setStrokeStyle(1, bottomStrip.loungeAccentColor, bottomStrip.loungeAccentAlpha);
  }

  // ── Zone dividers ─────────────────────────────────────────────────
  private drawZoneDividers() {
    const { zoneDividerColor, zoneDividerAlpha } = this.theme;

    const wallSegments: Array<[number, number]> = [[0, 308], [352, 400], [400, 518], [562, 800]];
    wallSegments.forEach(([left, right]) => {
      this.add.rectangle((left + right) / 2, 340, right - left, 4, zoneDividerColor, 0.8).setDepth(2);
      this.add.rectangle((left + right) / 2, 338, right - left, 1, 0x777799, zoneDividerAlpha).setDepth(2);
    });
    [330, 540].forEach(x => {
      this.add.rectangle(x - 23, 343, 2, 8, zoneDividerColor, 0.9).setDepth(2);
      this.add.rectangle(x + 23, 343, 2, 8, zoneDividerColor, 0.9).setDepth(2);
    });

    // Vertical divider between counter and lounge
    for (let dy = 345; dy < 465; dy += 8) {
      this.add.rectangle(400, dy, 1, 4, zoneDividerColor, zoneDividerAlpha * 0.75).setDepth(1);
    }
  }

  // ── Neon signs ────────────────────────────────────────────────────
  private drawNeonSigns() {
    const { titleSign, labels } = this.theme;

    // Main title: a small neon header mounted on the wall above the window frame, so it
    // reads as architecture instead of covering the mountains and city.
    const header = titleHeaderPosition();
    const headerW = 150;
    const headerH = 12;
    this.add.rectangle(header.x, header.y, headerW, headerH, titleSign.bgColor, titleSign.bgAlpha).setDepth(3);
    // Thin neon rails running out from the header along the wall.
    this.add.rectangle(header.x - headerW / 2 - 60, header.y, 116, 1, titleSign.glowColor, 0.35).setDepth(3);
    this.add.rectangle(header.x + headerW / 2 + 60, header.y, 116, 1, titleSign.glowColor, 0.35).setDepth(3);

    this.titleShadow = this.add.text(header.x, header.y, 'AGENT FACTORY', {
      fontFamily: 'monospace', fontSize: '10px', color: titleSign.shadowColor, fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0.35).setDepth(3);
    (this.titleShadow as any).setShadow?.(0, 0, titleSign.shadowColor, 8);

    this.titleText = this.add.text(header.x, header.y, 'AGENT FACTORY', {
      fontFamily: 'monospace', fontSize: '10px', color: titleSign.textColor, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(3);

    const titleGlowRect = this.add.rectangle(header.x, header.y, headerW + 8, headerH + 4, titleSign.glowColor, 0.04).setDepth(2);
    this.tweens.add({
      targets: titleGlowRect,
      alpha: { from: 0.03, to: 0.08 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
    });

    // Zone labels
    if (labels.mainLabel) {
      this.add.text(400, 52, labels.mainLabel, {
        fontFamily: 'monospace', fontSize: '10px', color: labels.mainLabelColor,
      }).setOrigin(0.5).setAlpha(0.5).setDepth(3);
    }

    this.add.text(200, 344, labels.counterLabel, {
      fontFamily: 'monospace', fontSize: '9px', color: labels.counterLabelColor,
    }).setOrigin(0.5).setAlpha(0.5).setDepth(3);

    this.add.text(630, 344, labels.loungeLabel, {
      fontFamily: 'monospace', fontSize: '9px', color: labels.loungeLabelColor,
    }).setOrigin(0.5).setAlpha(0.5).setDepth(3);

    // Decorative signs
    for (const sign of this.theme.signs) {
      this.createNeonSign(sign.x, sign.y, sign.text, sign.color, sign.baseAlpha, sign.flickerMs, sign.fontSize);
    }
  }

  private createNeonSign(
    x: number,
    y: number,
    text: string,
    color: string,
    baseAlpha: number,
    flickerMs: number,
    fontSize = '11px',
  ) {
    const textObj = this.add.text(x, y, text, {
      fontFamily: 'monospace', fontSize, color,
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
      if (!this.textures.exists(prop.textureKey)) continue;
      const image = this.add.image(prop.x, prop.y, prop.textureKey)
        .setScale(prop.scale)
        .setAngle(prop.angle ?? 0)
        .setDepth(prop.depth);
      if (prop.textureKey.startsWith('prop_window_')) {
        image.setOrigin(0.5, 1);
        const lightOverlay = this.add.image(prop.x, prop.y, prop.textureKey)
          .setOrigin(0.5, 1)
          .setScale(prop.scale)
          .setAngle(prop.angle ?? 0)
          .setDepth(prop.depth + 0.01)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(0);
        const distanceFromGlass = Phaser.Math.Clamp((prop.y - 40) / 12, 0, 1);
        this.plants.push({ image, lightOverlay, outsideLight: 0.42 - distanceFromGlass * 0.1, minimumLight: 0.34 });
      } else if (prop.textureKey.startsWith('prop_floor_')) {
        image.setOrigin(0.5, 1);
        this.plants.push({ image, outsideLight: 0.14, minimumLight: 0.9 });
      }
    }
  }

  private updateWindowPlantLighting(palette: SkyPalette, weather: WeatherVisualState, state: SkyState) {
    const storm = Math.min(1, weather.cloud01 * 0.35 + weather.rain01 * 0.45 + weather.fog01 * 0.2);
    const daylight = Phaser.Math.Clamp((state.elevationDeg + 8) / 32, 0, 1);
    const moonlight = state.moonVisible ? 0.08 : 0;
    const brightness = (0.34 + daylight * 0.66 + moonlight) * (1 - storm * 0.2);
    const neutralLight: readonly [number, number, number] = [
      Math.round(255 * brightness),
      Math.round(255 * brightness),
      Math.round(255 * Math.min(1, brightness * 1.06)),
    ];
    const ambientLight = lerpRgb(neutralLight, palette.skyHorizon, 0.28);
    const directionalLight = state.sunVisible
      ? lerpRgb(ambientLight, palette.sunGlow, 0.1 + palette.sunGlowStrength * 0.18)
      : lerpRgb(ambientLight, [94, 112, 164], 0.12);
    const floorShade = lerpRgb(ambientLight, palette.nearRidge, 0.44);
    const lightProgress = state.sunVisible ? state.sunProgress : state.moonProgress;
    const leftStrength = 0.24 + (1 - lightProgress) * 0.58;
    const rightStrength = 0.24 + lightProgress * 0.58;
    const leftLight = lerpRgb(ambientLight, directionalLight, leftStrength);
    const rightLight = lerpRgb(ambientLight, directionalLight, rightStrength);

    for (const plant of this.plants) {
      const localBrightness = Math.max(brightness, plant.minimumLight);
      const localNeutral: readonly [number, number, number] = [
        Math.round(255 * localBrightness),
        Math.round(255 * localBrightness),
        Math.round(255 * Math.min(1, localBrightness * 1.06)),
      ];
      const roomLight = lerpRgb(localNeutral, ambientLight, plant.outsideLight);
      const tint = (color: readonly [number, number, number]) => rgbToInt(lerpRgb(roomLight, color, plant.outsideLight));
      plant.image.setTint(
        tint(leftLight),
        tint(rightLight),
        tint(lerpRgb(leftLight, floorShade, 0.58)),
        tint(lerpRgb(rightLight, floorShade, 0.58)),
      );
      if (plant.lightOverlay) {
        const glow = state.sunVisible ? palette.sunGlow : [94, 112, 164] as const;
        plant.lightOverlay.setTintFill(
          rgbToInt(lerpRgb(ambientLight, glow, leftStrength)),
          rgbToInt(lerpRgb(ambientLight, glow, rightStrength)),
          rgbToInt(lerpRgb(floorShade, glow, leftStrength * 0.32)),
          rgbToInt(lerpRgb(floorShade, glow, rightStrength * 0.32)),
        );
        const rimStrength = state.sunVisible ? 0.015 + palette.sunGlowStrength * 0.08 : 0.008;
        plant.lightOverlay.setAlpha(rimStrength * plant.outsideLight * (1 - storm * 0.55));
      }
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
    const viewCenterY = WALL_BAND.top + VIEW_HEIGHT / 2;
    this.add.tileSprite(400, viewCenterY, 800, VIEW_HEIGHT, 'scanlines').setDepth(998).setAlpha(this.theme.scanlineAlpha);
  }

  // ── Vignette ──────────────────────────────────────────────────────
  private addVignette() {
    const top = WALL_BAND.top;
    const viewCenterY = top + VIEW_HEIGHT / 2;
    this.add.rectangle(400, top + 3, 800, 6, 0x000000, 0.35).setDepth(999);
    this.add.rectangle(400, top + 9, 800, 6, 0x000000, 0.15).setDepth(999);
    this.add.rectangle(400, top + 15, 800, 6, 0x000000, 0.05).setDepth(999);
    this.add.rectangle(400, WORLD_HEIGHT - 3, 800, 6, 0x000000, 0.35).setDepth(999);
    this.add.rectangle(400, WORLD_HEIGHT - 9, 800, 6, 0x000000, 0.15).setDepth(999);
    this.add.rectangle(400, WORLD_HEIGHT - 15, 800, 6, 0x000000, 0.05).setDepth(999);
    this.add.rectangle(3, viewCenterY, 6, VIEW_HEIGHT, 0x000000, 0.25).setDepth(999);
    this.add.rectangle(9, viewCenterY, 6, VIEW_HEIGHT, 0x000000, 0.1).setDepth(999);
    this.add.rectangle(797, viewCenterY, 6, VIEW_HEIGHT, 0x000000, 0.25).setDepth(999);
    this.add.rectangle(791, viewCenterY, 6, VIEW_HEIGHT, 0x000000, 0.1).setDepth(999);
  }
}
