import Phaser from 'phaser';
import type { SubagentInfo } from '@shared/types';
import type { Point } from '../grab/physics';

const SUBAGENT_SCALE = 0.5;

// Distinct colors for each subagent so they're visually distinguishable
const SUBAGENT_COLORS = [
  0xaa88ff, // purple
  0x88ffaa, // mint
  0xff88aa, // pink
  0x88aaff, // light blue
  0xffaa88, // peach
  0xaaff88, // lime
  0xff88ff, // magenta
  0x88ffff, // cyan
];

export class SubagentSprite extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Sprite;
  private nametag: Phaser.GameObjects.Text;
  private orbitAngle: number;
  private orbitRadius: number;
  private orbitSpeed: number;

  public info: SubagentInfo;
  public parentSessionId: string;

  private parentX = 0;
  private parentY = 0;
  private surroundingShadow = false;

  public isZombie = false;

  constructor(
    scene: Phaser.Scene,
    info: SubagentInfo,
    parentSessionId: string,
    spriteIndex: number,
    siblingIndex: number,
    siblingCount: number,
    isZombie = false,
  ) {
    super(scene, 0, 0);

    this.info = info;
    this.parentSessionId = parentSessionId;
    this.isZombie = isZombie;

    // Evenly space subagents around the orbit
    this.orbitAngle = (siblingIndex / Math.max(siblingCount, 1)) * Math.PI * 2;
    // Widen orbit as more subagents spawn so they don't overlap
    this.orbitRadius = 30 + siblingCount * 4;
    // Slightly different speeds so they don't lock in sync
    this.orbitSpeed = 0.6 + siblingIndex * 0.15;

    // Zombie subagents get the sickly green tint, normal ones get distinct colors
    const tint = isZombie ? 0x448833 : SUBAGENT_COLORS[siblingIndex % SUBAGENT_COLORS.length];
    const spriteKey = `agent_${spriteIndex % 8}`;
    this.sprite = scene.add.sprite(0, 0, spriteKey, 1);
    this.sprite.setScale(SUBAGENT_SCALE);
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setTint(tint);
    this.sprite.setAlpha(isZombie ? 0.75 : 0.85);
    this.add(this.sprite);

    // Nametag with agent type + index — zombie subagents get skull markers
    const tintHex = isZombie ? '#33ff00' : '#' + tint.toString(16).padStart(6, '0');
    const baseName = siblingCount > 1
      ? `${info.agentType || 'sub'} #${siblingIndex + 1}`
      : (info.agentType || 'sub');
    const label = isZombie ? `\u2620 ${baseName} \u2620` : baseName;
    this.nametag = scene.add.text(0, -14, label, {
      fontFamily: 'monospace',
      fontSize: '6px',
      color: tintHex,
      backgroundColor: isZombie ? 'rgba(20, 40, 10, 0.9)' : 'rgba(10, 10, 26, 0.8)',
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
    // When the parent is airborne, tighten and quicken the orbit so the subagents
    // read as a little group gathered around its moving floor shadow.
    const speed = this.surroundingShadow ? this.orbitSpeed * 1.15 : this.orbitSpeed;
    this.orbitAngle += (speed * delta) / 1000;
    const orbit = this.orbitPoint();
    this.x = orbit.x;
    this.y = orbit.y;
  }

  /** Position on the elliptical orbit for the current angle. */
  private orbitPoint(): Point {
    const radius = this.surroundingShadow ? this.orbitRadius + 8 : this.orbitRadius;
    return {
      x: this.parentX + Math.cos(this.orbitAngle) * radius,
      y: this.parentY + Math.sin(this.orbitAngle) * (radius * 0.42),
    };
  }

  setParentPosition(x: number, y: number, surroundingShadow = false) {
    this.parentX = x;
    this.parentY = y;
    this.surroundingShadow = surroundingShadow;
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
