import Phaser from 'phaser';
import { solarSnapshot } from './solar';
import type { SolarOptions } from './solar';
import { lerp, lerpRgb, rgbToInt, skyStateFromSnapshot } from './skyPhase';
import type { SkyPalette, SkyState } from './skyPhase';
import { createSeededRandom } from './skylineData';
import type { SkylineBuilding, SkylineDataSource } from './skylineData';
import {
  DEFAULT_SEED,
  PixelBuffer,
  createSkylineGeometry,
  paintSkyline,
  paintWindowWeather,
} from './skylinePainter';
import type { SkylineGeometry } from './skylinePainter';
import type { Clock } from './clock';
import { partnerBuildings } from './partners';
import { BackRainSim, GlassRainSim, OUTSIDE_RAIN_DEPTH_OFFSET, paintBackRain, paintGlassRain } from './rain';
import { starOffsetAt } from './starMotion';
import {
  SHOOTING_STAR_DEPTH_OFFSET,
  ShootingStarSim,
  paintShootingStar,
  seasonalShootingStarActivity01,
} from './shootingStars';
import {
  CLEAR_WEATHER,
  OpenMeteoWeatherProvider,
  cloudLayerWeights,
  lerpWeather,
  weatheredSkyState,
} from './weather';
import type { WeatherProvider, WeatherVisualState } from './weather';
import { CLOUD_LAYER_PLAN } from './cloudLayers';
import type { CloudLayerSpec } from './cloudLayers';

/** Frame colours, supplied by the environment theme. */
export interface SkylineWindowStyle {
  frameColor: number;
  mullionColor: number;
  sillColor: number;
  panes: number;
  showCity?: boolean;
}

export interface SkylineWindowOptions {
  /** Left edge of the glass in world pixels. */
  x: number;
  /** Top edge of the glass in world pixels. */
  y: number;
  width: number;
  height: number;
  depth: number;
  style: SkylineWindowStyle;
  clock?: Clock;
  reducedMotion?: boolean;
  source?: SkylineDataSource | null;
  /** Milliseconds between palette refreshes. */
  refreshMs?: number;
  weatherRefreshMs?: number;
  weatherTransitionMs?: number;
  weather?: WeatherProvider | null;
  weatherOverride?: WeatherVisualState | null;
  solar?: SolarOptions;
  seed?: number;
  /** Override the normal rare delay range for visual QA. */
  shootingStarDelaySeconds?: readonly [number, number];
  onLightingChange?: (palette: SkyPalette, weather: WeatherVisualState, state: SkyState) => void;
}

const TEXTURE_PREFIX = 'skyline_window';
const TWINKLE_COUNT = 10;
const WEATHER_REFRESH_MS = 10 * 60_000;
const WEATHER_TRANSITION_MS = 8_000;
/** Under reduced motion the rain layers still move, just at a gentle cadence. */
const REDUCED_MOTION_RAIN_MS = 250;

/**
 * A pixel-art window onto the Wasatch Front, drawn entirely inside the wall band.
 * The sky, mountains and city are composited into one canvas texture that is
 * repainted every `refreshMs` from deterministic solar math; the only continuous
 * motion (cloud drift, star twinkle) is skipped when the viewer prefers reduced motion.
 */
export class SkylineWindow {
  private readonly scene: Phaser.Scene;
  private readonly opts: SkylineWindowOptions;
  private readonly clock: Clock;
  private readonly reducedMotion: boolean;
  private readonly textureKey: string;
  private readonly weatherTextureKey: string;
  private readonly backRainTextureKey: string;
  private readonly shootingStarTextureKey: string;
  private readonly geometry: SkylineGeometry;

  private canvas?: Phaser.Textures.CanvasTexture;
  private weatherCanvas?: Phaser.Textures.CanvasTexture;
  private backRainCanvas?: Phaser.Textures.CanvasTexture;
  private shootingStarCanvas?: Phaser.Textures.CanvasTexture;
  private image?: Phaser.GameObjects.Image;
  private cloudLayers: Array<{ sprite: Phaser.GameObjects.TileSprite; spec: CloudLayerSpec }> = [];
  private cloudSnowLiftLayers: Phaser.GameObjects.TileSprite[] = [];
  private weatherLayer?: Phaser.GameObjects.Image;
  private backRainLayer?: Phaser.GameObjects.Image;
  private shootingStarLayer?: Phaser.GameObjects.Image;

  // Per-frame rain: outside streaks in front of the landscape and drops running down the glass.
  private readonly glassRain: GlassRainSim;
  private readonly backRain: BackRainSim;
  private readonly shootingStars: ShootingStarSim;
  private readonly glassPixels: PixelBuffer;
  private readonly backPixels: PixelBuffer;
  private readonly shootingStarPixels: PixelBuffer;
  private rainAccumulatedMs = 0;
  private rainLayersBlank = true;
  private shootingStarLayerBlank = true;
  private onSceneUpdate = (_time: number, delta: number) => this.updateRain(delta);
  private mountainLayers: Phaser.GameObjects.Image[] = [];
  private mountainSnowLiftLayers: Phaser.GameObjects.Image[] = [];
  private starLayer?: Phaser.GameObjects.Container;
  private starDots: Array<{
    dot: Phaser.GameObjects.Rectangle;
    baseX: number;
    baseY: number;
    index: number;
  }> = [];
  private frameParts: Phaser.GameObjects.GameObject[] = [];
  private timer?: Phaser.Time.TimerEvent;
  private weatherTimer?: Phaser.Time.TimerEvent;
  private tweens: Phaser.Tweens.Tween[] = [];
  private lastState?: SkyState;
  private lastDayOfYear = 1;
  private weatherProvider: WeatherProvider | null;
  private weatherFrom: WeatherVisualState;
  private weatherTarget: WeatherVisualState;
  private lastWeather: WeatherVisualState;
  private weatherTransitionStartedAt = 0;
  private weatherAbort?: AbortController;
  private weatherWarningShown = false;

  constructor(scene: Phaser.Scene, options: SkylineWindowOptions) {
    this.scene = scene;
    this.opts = options;
    this.clock = options.clock ?? Date.now;
    this.reducedMotion = options.reducedMotion ?? false;
    this.textureKey = `${TEXTURE_PREFIX}_${options.width}x${options.height}`;
    this.weatherTextureKey = `${TEXTURE_PREFIX}_weather_${options.width}x${options.height}`;
    this.backRainTextureKey = `${TEXTURE_PREFIX}_backrain_${options.width}x${options.height}`;
    this.shootingStarTextureKey = `${TEXTURE_PREFIX}_shooting_${options.width}x${options.height}`;
    this.geometry = createSkylineGeometry(options.width, options.height, options.seed ?? DEFAULT_SEED, options.source);
    const seed = options.seed ?? DEFAULT_SEED;
    this.glassRain = new GlassRainSim(options.width, options.height, seed);
    this.backRain = new BackRainSim(options.width, options.height, seed);
    this.shootingStars = new ShootingStarSim(options.width, options.height, seed, {
      minDelaySeconds: options.shootingStarDelaySeconds?.[0],
      maxDelaySeconds: options.shootingStarDelaySeconds?.[1],
    });
    this.glassPixels = new PixelBuffer(options.width, options.height);
    this.backPixels = new PixelBuffer(options.width, options.height);
    this.shootingStarPixels = new PixelBuffer(options.width, options.height);
    const initialWeather = options.weatherOverride ?? CLEAR_WEATHER;
    this.weatherProvider = options.weatherOverride ? null : options.weather === undefined ? new OpenMeteoWeatherProvider() : options.weather;
    this.weatherFrom = initialWeather;
    this.weatherTarget = initialWeather;
    this.lastWeather = initialWeather;
  }

  /** Current sky state, for debugging and QA. */
  get state(): SkyState | undefined {
    return this.lastState;
  }

  get weather(): WeatherVisualState {
    return this.lastWeather;
  }

  /** Buildings that carry partner metadata (hover and focus targets). */
  get partnerTargets(): SkylineBuilding[] {
    return partnerBuildings(this.geometry.buildings);
  }

  /** Name currently shown in the tooltip, or null. Exposed for QA. */
  get tooltipText(): string | null {
    return null;
  }

  create(): this {
    const { x, y, width, height, depth, style } = this.opts;
    const textures = this.scene.textures;

    if (textures.exists(this.textureKey)) textures.remove(this.textureKey);
    if (textures.exists(this.weatherTextureKey)) textures.remove(this.weatherTextureKey);
    if (textures.exists(this.backRainTextureKey)) textures.remove(this.backRainTextureKey);
    if (textures.exists(this.shootingStarTextureKey)) textures.remove(this.shootingStarTextureKey);
    this.canvas = textures.createCanvas(this.textureKey, width, height)!;
    this.weatherCanvas = textures.createCanvas(this.weatherTextureKey, width, height)!;
    this.backRainCanvas = textures.createCanvas(this.backRainTextureKey, width, height)!;
    this.shootingStarCanvas = textures.createCanvas(this.shootingStarTextureKey, width, height)!;

    this.image = this.scene.add.image(x + width / 2, y + height / 2, this.textureKey).setDepth(depth);

    this.cloudLayers = CLOUD_LAYER_PLAN.filter(spec => textures.exists(spec.texture)).map((spec, index) => {
      const sprite = this.scene.add
        .tileSprite(x + width / 2, y + height / 2, width, height, spec.texture)
        .setDepth(depth + spec.depthOffset);
      sprite.tilePositionX = index * 137;
      return { sprite, spec };
    });
    this.cloudSnowLiftLayers = this.cloudLayers.map(({ sprite, spec }) =>
      this.scene.add
        .tileSprite(x + width / 2, y + height / 2, width, height, spec.texture)
        .setDepth(depth + spec.depthOffset + 0.001)
        .setTilePosition(sprite.tilePositionX)
        .setVisible(false),
    );

    // A meteor is part of the distant sky: clouds can cross it and every terrain pass
    // naturally occludes it as it falls toward the horizon.
    this.shootingStarLayer = this.scene.add
      .image(x + width / 2, y + height / 2, this.shootingStarTextureKey)
      .setDepth(depth + SHOOTING_STAR_DEPTH_OFFSET);

    // Readable rain is near the building, in front of the full landscape. Distant rain
    // is represented by cloud/fog density instead of impossible streaks behind peaks.
    this.backRainLayer = this.scene.add
      .image(x + width / 2, y + height / 2, this.backRainTextureKey)
      .setDepth(depth + OUTSIDE_RAIN_DEPTH_OFFSET);

    const mountainPasses = [
      { texture: 'sky_mountains_distant', depthOffset: 0.05 },
      { texture: 'sky_mountains_main', depthOffset: 0.1 },
      { texture: 'sky_foothills_front', depthOffset: 0.15 },
    ].filter(pass => textures.exists(pass.texture));
    this.mountainLayers = mountainPasses.map(pass =>
      this.scene.add.image(x + width / 2, y + height / 2, pass.texture).setDepth(depth + pass.depthOffset),
    );
    for (const layer of this.mountainLayers) layer.setDisplaySize(width, height);
    this.mountainSnowLiftLayers = mountainPasses.map(pass =>
      this.scene.add.image(x + width / 2, y + height / 2, pass.texture)
        .setDepth(depth + pass.depthOffset + 0.001)
        .setDisplaySize(width, height)
        .setVisible(false),
    );

    this.weatherLayer = this.scene.add
      .image(x + width / 2, y + height / 2, this.weatherTextureKey)
      .setDepth(depth + 0.3);

    this.starLayer = this.scene.add.container(x, y).setDepth(depth);
    const twinkleRandom = createSeededRandom((this.opts.seed ?? DEFAULT_SEED) + 9);
    const stars = this.geometry.stars;
    for (let i = 0; i < TWINKLE_COUNT && i < stars.length; i++) {
      const star = stars[Math.floor(twinkleRandom() * stars.length)];
      const dot = this.scene.add.rectangle(star.x + 0.5, star.y + 0.5, 1, 1, 0xffffff, 1).setAlpha(this.reducedMotion ? 0.8 : 0.9);
      this.starLayer.add(dot);
      this.starDots.push({ dot, baseX: star.x + 0.5, baseY: star.y + 0.5, index: i });
      if (!this.reducedMotion) {
        this.tweens.push(
          this.scene.tweens.add({
            targets: dot,
            alpha: { from: 0.25, to: 1 },
            duration: 1200 + Math.floor(twinkleRandom() * 1600),
            yoyo: true,
            repeat: -1,
            delay: Math.floor(twinkleRandom() * 1500),
            ease: 'Sine.easeInOut',
          }),
        );
      }
    }

    this.drawFrame(style);
    this.refresh();

    const refreshMs = this.opts.refreshMs ?? (this.reducedMotion ? 1_000 : 250);
    this.timer = this.scene.time.addEvent({ delay: refreshMs, loop: true, callback: () => this.refresh() });
    if (this.weatherProvider) {
      void this.refreshWeather();
      this.weatherTimer = this.scene.time.addEvent({
        delay: this.opts.weatherRefreshMs ?? WEATHER_REFRESH_MS,
        loop: true,
        callback: () => void this.refreshWeather(),
      });
    }
    this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.onSceneUpdate);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    return this;
  }

  /** Recompute the solar state and repaint the glass. Safe to call at any time. */
  refresh(): void {
    if (!this.canvas) return;
    let state: SkyState;
    try {
      const snapshot = solarSnapshot(this.clock(), this.opts.solar);
      state = skyStateFromSnapshot(snapshot);
      this.lastDayOfYear = snapshot.local.dayOfYear;
    } catch (e) {
      console.warn('[skyline] solar math failed, keeping the last frame', e);
      return;
    }
    this.lastState = state;
    const weather = this.weatherAt(this.scene.time.now);
    this.lastWeather = weather;

    const glass = new PixelBuffer(this.geometry.width, this.geometry.height);
    const motionPhase = this.reducedMotion ? 0 : (this.scene.time.now % 5_000) / 5_000;
    paintSkyline(glass, this.geometry, state, this.opts.style.panes, false, weather, motionPhase, false);
    this.upload(this.canvas, glass);

    const palette = weatheredSkyState(state, weather).palette;
    this.opts.onLightingChange?.(palette, weather, state);
    const mountainColors = [
      lerpRgb(palette.farRidge, palette.skyHorizon, 0.18),
      lerpRgb(palette.farRidge, palette.farRim, 0.18),
      lerpRgb(palette.nearRidge, [0, 0, 0], 0.18),
    ];
    this.mountainLayers.forEach((layer, index) => {
      const base = mountainColors[index];
      layer.setTint(rgbToInt(base));
      layer.setAlpha(index === 0 ? 1 - weather.fog01 * 0.28 : 1);
    });
    const snowLiftColor = lerpRgb(palette.skyHorizon, [190, 208, 240], 0.5);
    const snowLiftAlpha = [0.18, 0.28, 0.42];
    this.mountainSnowLiftLayers.forEach((layer, index) => {
      layer.setTintFill(rgbToInt(snowLiftColor));
      layer.setAlpha(weather.snow01 * snowLiftAlpha[index]);
      layer.setVisible(weather.snow01 > 0.01);
    });
    const cloudWeights = cloudLayerWeights(weather);
    const cloudDensity = 0.12 + weather.cloud01 * 0.88;
    this.cloudLayers.forEach(({ sprite, spec }, index) => {
      const baseColor = lerpRgb(palette.cloud, palette.skyHorizon, spec.horizonMix);
      const color = lerpRgb(baseColor, [188, 202, 230], weather.snow01 * 0.72);
      sprite.setTint(rgbToInt(color));
      const foregroundSnow = spec.depthOffset > 0.1 ? 1 + weather.snow01 * 0.38 : 1;
      const snowVolume = 1 + weather.snow01 * 0.65;
      const alphaCap = lerp(0.72, 0.94, weather.snow01);
      sprite.setAlpha(Math.min(alphaCap, cloudDensity * spec.weight(cloudWeights) * spec.alpha * foregroundSnow * snowVolume));
      const lift = this.cloudSnowLiftLayers[index];
      lift.setTintFill(rgbToInt(snowLiftColor));
      lift.setAlpha(sprite.alpha * weather.snow01 * 0.42);
      lift.setVisible(weather.snow01 > 0.01);
    });

    if (this.starLayer) {
      this.starLayer.setAlpha(weatheredSkyState(state, weather).palette.stars);
      const now = this.clock();
      for (const star of this.starDots) {
        const offset = starOffsetAt(now, star.index);
        star.dot.setPosition(star.baseX + offset.x, star.baseY + offset.y);
      }
    }
  }

  /**
   * Advance and repaint the two rain layers. Runs every scene frame so drops fall and run
   * smoothly; under reduced motion it steps at a slower fixed cadence instead.
   */
  private updateRain(deltaMs: number): void {
    if (!this.weatherCanvas || !this.backRainCanvas || !this.shootingStarCanvas || !this.lastState) return;
    this.rainAccumulatedMs += deltaMs;
    if (this.reducedMotion && this.rainAccumulatedMs < REDUCED_MOTION_RAIN_MS) return;
    const dt = this.rainAccumulatedMs / 1000;
    this.rainAccumulatedMs = 0;

    const weather = this.weatherAt(this.scene.time.now);
    this.lastWeather = weather;
    const motionScale = this.reducedMotion ? 0.2 : 1;
    this.cloudLayers.forEach(({ sprite, spec }, index) => {
      const windScale = 0.55 + weather.wind01 * 1.8;
      sprite.tilePositionX += spec.drift * windScale * dt * motionScale;
      this.cloudSnowLiftLayers[index].tilePositionX = sprite.tilePositionX;
    });
    const visibleStars = weatheredSkyState(this.lastState, weather).palette.stars;
    this.shootingStars.step(dt, {
      stars01: visibleStars,
      seasonalActivity01: seasonalShootingStarActivity01(this.lastDayOfYear),
    });
    if (!this.shootingStars.isBlank || !this.shootingStarLayerBlank) {
      this.shootingStarPixels.data.fill(0);
      paintShootingStar(this.shootingStarPixels, this.shootingStars, this.lastState.palette, visibleStars);
      this.upload(this.shootingStarCanvas, this.shootingStarPixels);
      this.shootingStarLayerBlank = this.shootingStars.isBlank;
    }
    this.glassRain.step(dt, weather);
    this.backRain.step(dt, weather);

    const weatherInMotion = this.backRain.streaks.length > 0
      || !this.glassRain.isDry
      || weather.wet01 > 0.08
      || weather.snow01 > 0.02;
    if (!weatherInMotion) {
      // Clear once when the rain ends, then stop uploading until it returns.
      if (!this.rainLayersBlank) {
        this.glassPixels.data.fill(0);
        this.backPixels.data.fill(0);
        this.upload(this.weatherCanvas, this.glassPixels);
        this.upload(this.backRainCanvas, this.backPixels);
        this.rainLayersBlank = true;
      }
      return;
    }
    this.rainLayersBlank = false;

    const palette = weatheredSkyState(this.lastState, weather).palette;
    const motionPeriodMs = weather.snow01 > 0.02 ? 12_000 : 5_000;
    const motionPhase = this.reducedMotion ? 0 : (this.scene.time.now % motionPeriodMs) / motionPeriodMs;

    this.backPixels.data.fill(0);
    paintBackRain(this.backPixels, this.backRain, palette, weather);
    this.upload(this.backRainCanvas, this.backPixels);

    this.glassPixels.data.fill(0);
    paintWindowWeather(this.glassPixels, this.geometry, this.lastState, weather, motionPhase);
    paintGlassRain(this.glassPixels, this.glassRain, palette);
    this.upload(this.weatherCanvas, this.glassPixels);
  }

  setWeather(weather: WeatherVisualState): void {
    const now = this.scene.time.now;
    this.weatherFrom = this.weatherAt(now);
    this.weatherTarget = weather;
    this.weatherTransitionStartedAt = now;
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onSceneUpdate);
    this.timer?.remove(false);
    this.timer = undefined;
    this.weatherTimer?.remove(false);
    this.weatherTimer = undefined;
    this.weatherAbort?.abort();
    this.weatherAbort = undefined;
    for (const tween of this.tweens) tween.remove();
    this.tweens = [];
    this.image?.destroy();
    for (const { sprite } of this.cloudLayers) sprite.destroy();
    this.cloudLayers = [];
    for (const layer of this.cloudSnowLiftLayers) layer.destroy();
    this.cloudSnowLiftLayers = [];
    this.weatherLayer?.destroy();
    this.backRainLayer?.destroy();
    this.shootingStarLayer?.destroy();
    for (const layer of this.mountainLayers) layer.destroy();
    this.mountainLayers = [];
    for (const layer of this.mountainSnowLiftLayers) layer.destroy();
    this.mountainSnowLiftLayers = [];
    this.starLayer?.destroy(true);
    this.starDots = [];
    for (const part of this.frameParts) part.destroy();
    this.frameParts = [];
    this.image = undefined;
    this.weatherLayer = undefined;
    this.backRainLayer = undefined;
    this.shootingStarLayer = undefined;
    this.starLayer = undefined;
  }

  private weatherAt(now: number): WeatherVisualState {
    const duration = this.opts.weatherTransitionMs ?? WEATHER_TRANSITION_MS;
    if (duration <= 0) return this.weatherTarget;
    const t = Math.max(0, Math.min(1, (now - this.weatherTransitionStartedAt) / duration));
    if (t >= 1) this.weatherFrom = this.weatherTarget;
    return lerpWeather(this.weatherFrom, this.weatherTarget, t);
  }

  private async refreshWeather(): Promise<void> {
    if (!this.weatherProvider) return;
    this.weatherAbort?.abort();
    const abort = new AbortController();
    this.weatherAbort = abort;
    const timeout = setTimeout(() => abort.abort(), 5_000);
    try {
      this.setWeather(await this.weatherProvider.current(abort.signal));
      this.weatherWarningShown = false;
    } catch {
      if (!abort.signal.aborted && !this.weatherWarningShown) {
        this.weatherWarningShown = true;
        console.warn('[skyline] live weather unavailable; keeping the last weather frame');
      }
    } finally {
      clearTimeout(timeout);
      if (this.weatherAbort === abort) this.weatherAbort = undefined;
    }
  }

  private upload(canvas: Phaser.Textures.CanvasTexture, pixels: PixelBuffer): void {
    const ctx = canvas.getContext();
    const image = ctx.createImageData(pixels.width, pixels.height);
    image.data.set(pixels.data);
    ctx.putImageData(image, 0, 0);
    canvas.refresh();
  }

  // ── Frame ─────────────────────────────────────────────────────────

  private drawFrame(style: SkylineWindowStyle): void {
    const { x, y, width, height, depth } = this.opts;
    const add = (cx: number, cy: number, w: number, h: number, color: number, alpha = 1) => {
      const rect = this.scene.add.rectangle(cx, cy, w, h, color, alpha).setDepth(depth + 1);
      this.frameParts.push(rect);
      return rect;
    };

    // Frame bars thicken with the glass so a tall window still reads as a solid casement.
    const bar = Math.max(2, Math.round(height / 36));
    add(x - bar / 2, y + height / 2, bar, height + 3, style.frameColor);
    add(x + width + bar / 2, y + height / 2, bar, height + 3, style.frameColor);
    add(x + width / 2, y - 0.5, width + 2 * bar, 1, style.frameColor);
    add(x + width / 2, y + height + 1, width + 2 * bar, 2, style.sillColor);
    add(x + width / 2, y + height + 0.5, width, 1, 0xffffff, 0.08);

    // Mullions between panes.
    const panes = Math.max(1, Math.floor(style.panes));
    const paneWidth = width / panes;
    for (let i = 1; i < panes; i++) {
      const mx = Math.round(x + i * paneWidth);
      add(mx, y + height / 2, bar, height, style.mullionColor);
      add(mx + bar / 2 + 0.5, y + height / 2, 1, height, 0x000000, 0.25);
    }

    // Inner shadow under the head so the glass reads as recessed.
    add(x + width / 2, y + 0.5, width, 1, 0x000000, 0.3);
  }
}
