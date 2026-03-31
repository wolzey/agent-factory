import Phaser from 'phaser';
import type { WorkstationConfig } from '../environments';

export class Machine extends Phaser.GameObjects.Container {
  private cabinet: Phaser.GameObjects.Sprite;
  private glow: Phaser.GameObjects.Rectangle;
  private floorGlow: Phaser.GameObjects.Rectangle;
  private heatOverlay: Phaser.GameObjects.Rectangle;
  private heatTween: Phaser.Tweens.Tween | null = null;
  private active = false;
  private workstation: WorkstationConfig;

  public slotId: number;

  constructor(scene: Phaser.Scene, x: number, y: number, slotId: number, workstation: WorkstationConfig) {
    super(scene, x, y);
    this.slotId = slotId;
    this.workstation = workstation;
    this.setDepth(6);

    // Heat overlay (below everything else in container)
    this.heatOverlay = scene.add.rectangle(0, 32, 30, 10, 0x4444ff, 0);
    this.add(this.heatOverlay);

    // Floor reflection glow (simulates screen light on ground)
    this.floorGlow = scene.add.rectangle(0, 30, 26, 8, workstation.floorGlowColor, 0);
    this.add(this.floorGlow);

    // Neon glow under cabinet
    this.glow = scene.add.rectangle(0, 10, 28, 6, workstation.glowColor, 0);
    this.add(this.glow);

    // Workstation sprite (1.5x scale)
    this.cabinet = scene.add.sprite(0, 0, workstation.textureKey, 1);
    this.cabinet.setScale(1.5);
    this.cabinet.setOrigin(0.5, 0.5);
    this.cabinet.play(workstation.idleAnim);
    this.add(this.cabinet);

    scene.add.existing(this);
  }

  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;

    if (active) {
      this.cabinet.play(this.workstation.activeAnim);

      // Marquee glow
      this.scene.tweens.add({
        targets: this.glow,
        alpha: 0.5,
        duration: 300,
        ease: 'Sine.easeOut',
      });
      this.scene.tweens.add({
        targets: this.glow,
        alpha: { from: 0.3, to: 0.6 },
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      // Screen floor reflection
      this.scene.tweens.add({
        targets: this.floorGlow,
        alpha: { from: 0.04, to: 0.1 },
        duration: 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else {
      this.cabinet.play(this.workstation.idleAnim);

      this.scene.tweens.killTweensOf(this.glow);
      this.scene.tweens.killTweensOf(this.floorGlow);

      this.scene.tweens.add({ targets: this.glow, alpha: 0, duration: 500 });
      this.scene.tweens.add({ targets: this.floorGlow, alpha: 0, duration: 500 });
    }
  }

  /** Error explosion: flash red, shake, emit sparks and smoke from cabinet */
  sparkAndSmoke() {
    // Flash cabinet red
    this.cabinet.setTint(0xff0000);
    this.scene.time.delayedCall(500, () => this.cabinet.clearTint());

    // Shake cabinet
    const origX = this.cabinet.x;
    this.scene.tweens.add({
      targets: this.cabinet,
      x: { from: origX - 3, to: origX + 3 },
      duration: 50,
      yoyo: true,
      repeat: 7,
      onComplete: () => { this.cabinet.x = origX; },
    });

    // Screen flicker
    this.scene.tweens.add({
      targets: this.cabinet,
      alpha: { from: 0.3, to: 1 },
      duration: 80,
      yoyo: true,
      repeat: 3,
    });

    // Orange/red spark particles from cabinet top
    const sparkColors = [0xff4400, 0xff6600, 0xff2200, 0xffaa00, 0xff0000];
    for (let i = 0; i < 10; i++) {
      const color = sparkColors[Phaser.Math.Between(0, sparkColors.length - 1)];
      const px = this.x + Phaser.Math.Between(-12, 12);
      const py = this.y - 15;
      const p = this.scene.add.circle(px, py, Phaser.Math.Between(1, 3), color, 0.9).setDepth(10);

      const angle = Phaser.Math.FloatBetween(-Math.PI * 0.8, -Math.PI * 0.2);
      const dist = Phaser.Math.Between(15, 40);
      this.scene.tweens.add({
        targets: p,
        x: px + Math.cos(angle) * dist,
        y: py + Math.sin(angle) * dist,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: Phaser.Math.Between(300, 600),
        ease: 'Power2',
        onComplete: () => p.destroy(),
      });
    }

    // Gray smoke circles drifting upward
    for (let i = 0; i < 7; i++) {
      this.scene.time.delayedCall(i * 80, () => {
        if (!this.scene) return;
        const sx = this.x + Phaser.Math.Between(-8, 8);
        const sy = this.y - 10;
        const smoke = this.scene.add.circle(sx, sy, Phaser.Math.Between(3, 6), 0x888888, 0.5).setDepth(10);

        this.scene.tweens.add({
          targets: smoke,
          y: sy - Phaser.Math.Between(25, 50),
          x: sx + Phaser.Math.Between(-10, 10),
          alpha: 0,
          scaleX: 3,
          scaleY: 3,
          duration: Phaser.Math.Between(1000, 1500),
          ease: 'Power1',
          onComplete: () => smoke.destroy(),
        });
      });
    }
  }

  /** Set heatmap intensity (0 = invisible, 1 = max hot red) */
  setHeat(intensity: number) {
    if (intensity <= 0) {
      if (this.heatTween) {
        this.heatTween.destroy();
        this.heatTween = null;
      }
      this.scene.tweens.add({ targets: this.heatOverlay, alpha: 0, duration: 500 });
      return;
    }

    // Color gradient: blue (0) → yellow (0.5) → red (1)
    let color: number;
    if (intensity < 0.5) {
      const t = intensity / 0.5;
      const r = Math.round(0x44 + (0xff - 0x44) * t);
      const g = Math.round(0x44 + (0xaa - 0x44) * t);
      const b = Math.round(0xff + (0x00 - 0xff) * t);
      color = (r << 16) | (g << 8) | b;
    } else {
      const t = (intensity - 0.5) / 0.5;
      const r = Math.round(0xff);
      const g = Math.round(0xaa * (1 - t));
      const b = 0;
      color = (r << 16) | (g << 8) | b;
    }

    this.heatOverlay.setFillStyle(color, 0.35);

    if (!this.heatTween) {
      this.heatTween = this.scene.tweens.add({
        targets: this.heatOverlay,
        alpha: { from: 0.2, to: 0.45 },
        duration: 1000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }
}
