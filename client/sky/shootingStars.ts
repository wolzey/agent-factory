import { lerpRgb } from './skyPhase';
import type { SkyPalette } from './skyPhase';
import { createSeededRandom } from './skylineData';
import type { PixelBuffer } from './skylinePainter';

export const SHOOTING_STAR_DEPTH_OFFSET = 0.03;

export interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  duration: number;
  tail: number;
}

export interface ShootingStarConditions {
  /** Final star visibility after weather has dimmed the night sky. */
  stars01: number;
  /** A small annual rhythm that makes a few parts of the year more active. */
  seasonalActivity01: number;
}

export interface ShootingStarOptions {
  minDelaySeconds?: number;
  maxDelaySeconds?: number;
}

const MAX_STEP_SECONDS = 0.1;
const NIGHT_THRESHOLD = 0.42;

function circularDayDistance(a: number, b: number): number {
  const direct = Math.abs(a - b);
  return Math.min(direct, 365.25 - direct);
}

function softSeasonPeak(dayOfYear: number, center: number, halfWidth: number): number {
  const distance = circularDayDistance(dayOfYear, center);
  if (distance >= halfWidth) return 0;
  const t = 1 - distance / halfWidth;
  return t * t * (3 - 2 * t);
}

/**
 * A restrained annual rhythm for the night sky. Late summer and early winter get
 * slightly shorter waits, while shooting stars remain rare throughout the year.
 */
export function seasonalShootingStarActivity01(dayOfYear: number): number {
  const day = ((dayOfYear - 1) % 365.25 + 365.25) % 365.25 + 1;
  return Math.max(
    softSeasonPeak(day, 224, 18),
    softSeasonPeak(day, 348, 16),
  );
}

export class ShootingStarSim {
  star: ShootingStar | null = null;
  private readonly random: () => number;
  private readonly minDelaySeconds: number;
  private readonly maxDelaySeconds: number;
  private delaySeconds: number;

  constructor(
    readonly width: number,
    readonly height: number,
    seed = 0x5a1c,
    options: ShootingStarOptions = {},
  ) {
    this.random = createSeededRandom(seed + 71);
    this.minDelaySeconds = Math.max(0.1, options.minDelaySeconds ?? 80);
    this.maxDelaySeconds = Math.max(this.minDelaySeconds, options.maxDelaySeconds ?? 240);
    this.delaySeconds = this.nextDelay();
  }

  get isBlank(): boolean {
    return this.star === null;
  }

  step(dtSeconds: number, conditions: ShootingStarConditions): void {
    const dt = Math.min(Math.max(dtSeconds, 0), MAX_STEP_SECONDS);
    if (dt <= 0) return;

    if (conditions.stars01 < NIGHT_THRESHOLD) {
      this.star = null;
      return;
    }

    if (this.star) {
      this.star.age += dt;
      this.star.x += this.star.vx * dt;
      this.star.y += this.star.vy * dt;
      if (
        this.star.age >= this.star.duration
        || this.star.x < -this.star.tail
        || this.star.x > this.width + this.star.tail
        || this.star.y > this.height + this.star.tail
      ) {
        this.star = null;
        this.delaySeconds = this.nextDelay();
      }
      return;
    }

    const seasonalTempo = 1 + Math.max(0, Math.min(1, conditions.seasonalActivity01)) * 0.75;
    this.delaySeconds -= dt * seasonalTempo;
    if (this.delaySeconds <= 0) this.spawn();
  }

  private nextDelay(): number {
    return this.minDelaySeconds + this.random() * (this.maxDelaySeconds - this.minDelaySeconds);
  }

  private spawn(): void {
    const direction = this.random() < 0.78 ? 1 : -1;
    const speed = 54 + this.random() * 28;
    const duration = 0.48 + this.random() * 0.28;
    this.star = {
      x: direction > 0
        ? this.width * (0.06 + this.random() * 0.56)
        : this.width * (0.38 + this.random() * 0.56),
      y: 3 + this.random() * Math.max(3, this.height * 0.32),
      vx: direction * speed,
      vy: 18 + this.random() * 16,
      age: 0,
      duration,
      tail: 8 + Math.round(this.random() * 8),
    };
  }
}

export function paintShootingStar(
  pixels: PixelBuffer,
  sim: ShootingStarSim,
  palette: SkyPalette,
  stars01: number,
): void {
  const star = sim.star;
  if (!star) return;

  const life = star.age / star.duration;
  const fade = Math.min(1, star.age / 0.08, (1 - life) / 0.22) * stars01;
  if (fade <= 0) return;

  const speed = Math.hypot(star.vx, star.vy) || 1;
  const ux = star.vx / speed;
  const uy = star.vy / speed;
  const head = lerpRgb(palette.sun, [255, 255, 255], 0.82);
  const tail = lerpRgb(palette.skyHorizon, head, 0.74);

  for (let i = star.tail; i >= 1; i--) {
    const strength = (1 - i / (star.tail + 1)) * fade;
    pixels.set(
      Math.round(star.x - ux * i),
      Math.round(star.y - uy * i),
      tail,
      Math.round(210 * strength),
    );
  }

  const x = Math.round(star.x);
  const y = Math.round(star.y);
  pixels.set(x, y, head, Math.round(255 * fade));
  pixels.set(x - Math.sign(star.vx), y, head, Math.round(170 * fade));
}
