import Phaser from 'phaser';
import type { WorkstationConfig } from '../environments';

export class Machine extends Phaser.GameObjects.Container {
  private cabinet: Phaser.GameObjects.Sprite;
  private glow: Phaser.GameObjects.Rectangle;
  private floorGlow: Phaser.GameObjects.Rectangle;
  private active = false;
  private workstation: WorkstationConfig;

  public slotId: number;

  constructor(scene: Phaser.Scene, x: number, y: number, slotId: number, workstation: WorkstationConfig) {
    super(scene, x, y);
    this.slotId = slotId;
    this.workstation = workstation;
    this.setDepth(6);

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
}
