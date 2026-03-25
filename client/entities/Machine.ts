import Phaser from 'phaser';

export class Machine extends Phaser.GameObjects.Container {
  private cabinet: Phaser.GameObjects.Sprite;
  private glow: Phaser.GameObjects.Rectangle;
  private active = false;

  public slotId: number;

  constructor(scene: Phaser.Scene, x: number, y: number, slotId: number) {
    super(scene, x, y);
    this.slotId = slotId;

    // Neon glow under cabinet
    this.glow = scene.add.rectangle(0, 12, 36, 8, 0xff00ff, 0);
    this.add(this.glow);

    // Arcade cabinet sprite
    this.cabinet = scene.add.sprite(0, 0, 'arcade_cabinet', 1);
    this.cabinet.setScale(2);
    this.cabinet.setOrigin(0.5, 0.5);
    this.cabinet.play('arcade_idle');
    this.add(this.cabinet);

    scene.add.existing(this);
  }

  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;

    if (active) {
      this.cabinet.play('arcade_active');
      // Neon glow pulse
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
    } else {
      this.cabinet.play('arcade_idle');
      this.scene.tweens.killTweensOf(this.glow);
      this.scene.tweens.add({
        targets: this.glow,
        alpha: 0,
        duration: 500,
      });
    }
  }
}
