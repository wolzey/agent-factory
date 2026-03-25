import Phaser from 'phaser';
import type { AgentSession, AgentActivity } from '@shared/types';

const ACTIVITY_ICONS: Record<string, string> = {
  running: 'terminal',
  writing: 'pencil',
  reading: 'magnifier',
  searching: 'globe',
  chatting: 'chat',
  thinking: 'brain',
  planning: 'brain',
};

const ICON_FRAME_MAP: Record<string, number> = {
  terminal: 1,
  pencil: 2,
  magnifier: 3,
  globe: 4,
  chat: 5,
  brain: 6,
};

export class AgentSprite extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Sprite;
  private nametag: Phaser.GameObjects.Text;
  private statusIcon: Phaser.GameObjects.Sprite | null = null;
  private neonGlow: Phaser.GameObjects.Rectangle;
  private thoughtBubble: Phaser.GameObjects.Container | null = null;

  public sessionData: AgentSession;
  private spriteKey: string;
  private currentAnim = '';
  private targetX = 0;
  private targetY = 0;
  private isMoving = false;
  private moveSpeed = 80; // pixels per second

  constructor(scene: Phaser.Scene, session: AgentSession) {
    super(scene, 0, 0);

    this.sessionData = session;
    const spriteIdx = session.avatar?.spriteIndex ?? 0;
    this.spriteKey = `agent_${spriteIdx % 8}`;

    // Neon glow under feet
    this.neonGlow = scene.add.rectangle(0, 6, 20, 6, 0xff00ff, 0.15);
    this.add(this.neonGlow);

    // Character sprite
    this.sprite = scene.add.sprite(0, 0, this.spriteKey, 1);
    this.sprite.setScale(2);
    this.sprite.setOrigin(0.5, 0.5);
    this.add(this.sprite);

    // Nametag
    const cwd = session.cwd || '';
    const cwdBase = cwd.split('/').pop() || '';
    const label = cwdBase ? `${session.username}/${cwdBase}` : session.username;

    this.nametag = scene.add.text(0, -24, label, {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#00ffff',
      backgroundColor: 'rgba(10, 10, 26, 0.85)',
      padding: { x: 3, y: 1 },
      align: 'center',
    });
    this.nametag.setOrigin(0.5, 1);
    this.add(this.nametag);

    // Apply tint if custom color
    if (session.avatar?.color) {
      const hex = parseInt(session.avatar.color.replace('#', ''), 16);
      if (!isNaN(hex)) {
        this.sprite.setTint(hex);
        this.neonGlow.setFillStyle(hex, 0.15);
      }
    }

    // Start idle
    this.playAnimation('idle');

    // Enable input for tooltip
    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on('pointerover', () => this.showTooltip());
    this.sprite.on('pointerout', () => this.hideTooltip());
    this.sprite.on('pointermove', (pointer: Phaser.Input.Pointer) => this.moveTooltip(pointer));

    scene.add.existing(this);
  }

  update(_time: number, delta: number) {
    if (this.isMoving) {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 2) {
        this.x = this.targetX;
        this.y = this.targetY;
        this.isMoving = false;
        this.onArrived();
      } else {
        const step = (this.moveSpeed * delta) / 1000;
        const ratio = Math.min(step / dist, 1);
        this.x += dx * ratio;
        this.y += dy * ratio;

        // Play walk animation in movement direction
        if (Math.abs(dx) > Math.abs(dy)) {
          this.playAnimation(dx > 0 ? 'walk_right' : 'walk_left');
        } else {
          this.playAnimation(dy > 0 ? 'walk_down' : 'walk_up');
        }
      }
    }
  }

  moveTo(x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
    this.isMoving = true;
  }

  updateSession(session: AgentSession) {
    this.sessionData = session;

    // Update nametag
    const cwd = session.cwd || '';
    const cwdBase = cwd.split('/').pop() || '';
    const label = cwdBase ? `${session.username}/${cwdBase}` : session.username;
    this.nametag.setText(label);

    // Update status icon
    this.updateStatusIcon(session.activity, session.currentTool);
  }

  die(onComplete?: () => void) {
    this.hideThoughtBubble();
    this.statusIcon?.setVisible(false);
    this.isMoving = false;

    // Hide nametag
    this.scene.tweens.add({
      targets: this.nametag,
      alpha: 0,
      duration: 300,
    });

    // Fall over (rotate 90 degrees)
    this.scene.tweens.add({
      targets: this.sprite,
      angle: 90,
      y: this.sprite.y + 8,
      duration: 500,
      ease: 'Bounce.easeOut',
      onComplete: () => {
        // Show skull and crossbones at status icon position
        const skull = this.scene.add.image(12, -20, 'skull');
        skull.setScale(1.5);
        skull.setAlpha(0);
        this.add(skull);

        // Skull fade in
        this.scene.tweens.add({
          targets: skull,
          alpha: 1,
          duration: 300,
          ease: 'Power2',
        });

        // Neon glow turns red
        this.neonGlow.setFillStyle(0xff0000, 0.3);

        // After a pause, fade everything out
        this.scene.time.delayedCall(1500, () => {
          this.scene.tweens.add({
            targets: this,
            alpha: 0,
            duration: 600,
            ease: 'Power2',
            onComplete: () => {
              onComplete?.();
              this.destroy();
            },
          });
        });
      },
    });
  }

  private onArrived() {
    const activity = this.sessionData.activity;
    if (activity === 'idle' || activity === 'stopped') {
      this.playAnimation('sit');
    } else {
      this.playAnimation('work');
    }
  }

  private playAnimation(anim: string) {
    const key = `${this.spriteKey}_${anim}`;
    if (this.currentAnim !== key && this.scene.anims.exists(key)) {
      this.sprite.play(key);
      this.currentAnim = key;
    }
  }

  private updateStatusIcon(activity: AgentActivity, tool: string | null) {
    const iconName = ACTIVITY_ICONS[activity];

    // Handle thought bubble for thinking state
    if (activity === 'thinking') {
      this.statusIcon?.setVisible(false);
      this.showThoughtBubble();
      this.neonGlow.setAlpha(0.25);
      return;
    } else {
      this.hideThoughtBubble();
    }

    if (!iconName || activity === 'idle' || activity === 'stopped') {
      this.statusIcon?.setVisible(false);
      this.neonGlow.setAlpha(0.15);
      return;
    }

    if (!this.statusIcon) {
      this.statusIcon = this.scene.add.sprite(12, -20, 'icons', ICON_FRAME_MAP[iconName] || 1);
      this.statusIcon.setScale(1.5);
      this.add(this.statusIcon);
    }

    this.statusIcon.setFrame(ICON_FRAME_MAP[iconName] || 1);
    this.statusIcon.setVisible(true);

    // Brighter glow when active
    this.neonGlow.setAlpha(0.4);
  }

  private showThoughtBubble() {
    if (this.thoughtBubble) return;

    // Compact bubble at same position as status icons (12, -20)
    this.thoughtBubble = this.scene.add.container(12, -20);

    // Small bubble background
    const bubble = this.scene.add.graphics();
    bubble.fillStyle(0xffffff, 0.9);
    bubble.fillRoundedRect(-8, -6, 16, 12, 4);
    this.thoughtBubble.add(bubble);

    // Three animated dots
    const d1 = this.scene.add.circle(-4, 0, 1.5, 0x444466);
    const d2 = this.scene.add.circle(0, 0, 1.5, 0x444466);
    const d3 = this.scene.add.circle(4, 0, 1.5, 0x444466);
    this.thoughtBubble.add(d1);
    this.thoughtBubble.add(d2);
    this.thoughtBubble.add(d3);

    // Small tail dot
    const tail = this.scene.add.circle(-6, 8, 1.5, 0xffffff, 0.7);
    this.thoughtBubble.add(tail);

    this.add(this.thoughtBubble);

    // Bounce dots in sequence
    this.scene.tweens.add({ targets: d1, y: d1.y - 2, duration: 350, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.scene.tweens.add({ targets: d2, y: d2.y - 2, duration: 350, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 117 });
    this.scene.tweens.add({ targets: d3, y: d3.y - 2, duration: 350, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 234 });
  }

  private hideThoughtBubble() {
    if (!this.thoughtBubble) return;
    this.thoughtBubble.destroy();
    this.thoughtBubble = null;
  }

  private showTooltip() {
    const tooltip = document.getElementById('tooltip');
    if (!tooltip) return;

    const nameEl = tooltip.querySelector('.tooltip-name') as HTMLElement;
    const detailEl = tooltip.querySelector('.tooltip-detail') as HTMLElement;
    const toolEl = tooltip.querySelector('.tooltip-tool') as HTMLElement;

    nameEl.textContent = this.sessionData.username;

    const cwdBase = this.sessionData.cwd?.split('/').pop() || 'unknown';
    const subCount = this.sessionData.subagents?.length || 0;
    detailEl.textContent = `${cwdBase} | ${this.sessionData.activity}${subCount > 0 ? ` | ${subCount} subagent(s)` : ''}`;

    if (this.sessionData.currentTool) {
      toolEl.textContent = `Tool: ${this.sessionData.currentTool}`;
      toolEl.style.display = 'block';
    } else {
      toolEl.style.display = 'none';
    }

    tooltip.style.display = 'block';
  }

  private hideTooltip() {
    const tooltip = document.getElementById('tooltip');
    if (tooltip) tooltip.style.display = 'none';
  }

  private moveTooltip(pointer: Phaser.Input.Pointer) {
    const tooltip = document.getElementById('tooltip');
    if (tooltip) {
      tooltip.style.left = `${pointer.event.clientX + 12}px`;
      tooltip.style.top = `${pointer.event.clientY - 12}px`;
    }
  }
}
