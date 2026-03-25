import Phaser from 'phaser';
import type { SubagentInfo } from '@shared/types';

export class SubagentSprite extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Sprite;
  private nametag: Phaser.GameObjects.Text;
  private orbitAngle = Math.random() * Math.PI * 2;
  private orbitRadius = 28;
  private orbitSpeed = 0.8;

  public info: SubagentInfo;
  public parentSessionId: string;

  private parentX = 0;
  private parentY = 0;

  constructor(scene: Phaser.Scene, info: SubagentInfo, parentSessionId: string, spriteIndex: number) {
    super(scene, 0, 0);

    this.info = info;
    this.parentSessionId = parentSessionId;

    // Smaller sprite with lighter tint
    const spriteKey = `agent_${spriteIndex % 8}`;
    this.sprite = scene.add.sprite(0, 0, spriteKey, 1);
    this.sprite.setScale(1.2); // Smaller than parent
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setTint(0xaa88ff); // Purple tint for subagents
    this.sprite.setAlpha(0.85);
    this.add(this.sprite);

    // Nametag with agent type
    this.nametag = scene.add.text(0, -14, info.agentType || 'sub', {
      fontFamily: 'monospace',
      fontSize: '6px',
      color: '#aa88ff',
      backgroundColor: 'rgba(10, 10, 26, 0.8)',
      padding: { x: 2, y: 1 },
      align: 'center',
    });
    this.nametag.setOrigin(0.5, 1);
    this.add(this.nametag);

    // Play work animation
    const workAnim = `${spriteKey}_work`;
    if (scene.anims.exists(workAnim)) {
      this.sprite.play(workAnim);
    }

    // Spawn effect
    this.setAlpha(0);
    this.setScale(0.3);
    scene.tweens.add({
      targets: this,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 400,
      ease: 'Back.easeOut',
    });

    scene.add.existing(this);
  }

  update(_time: number, delta: number) {
    // Orbit around parent position
    this.orbitAngle += (this.orbitSpeed * delta) / 1000;
    this.x = this.parentX + Math.cos(this.orbitAngle) * this.orbitRadius;
    this.y = this.parentY + Math.sin(this.orbitAngle) * (this.orbitRadius * 0.4); // Elliptical orbit
  }

  setParentPosition(x: number, y: number) {
    this.parentX = x;
    this.parentY = y;
  }

  despawn(onComplete?: () => void) {
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scaleX: 0.2,
      scaleY: 0.2,
      duration: 300,
      ease: 'Power2',
      onComplete: () => {
        onComplete?.();
        this.destroy();
      },
    });
  }
}
