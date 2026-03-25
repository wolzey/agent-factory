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
    if (this.sessionData.avatar?.graphicDeath) {
      this.dieGraphic(onComplete);
    } else {
      this.dieStandard(onComplete);
    }
  }

  private dieStandard(onComplete?: () => void) {
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

  private dieGraphic(onComplete?: () => void) {
    this.hideThoughtBubble();
    this.statusIcon?.setVisible(false);
    this.isMoving = false;

    // Hide nametag immediately
    this.nametag.setAlpha(0);

    // Neon glow turns blood red
    this.neonGlow.setFillStyle(0xff0000, 0.5);

    // Phase 1: Throat slash - red line appears across neck
    const slash = this.scene.add.image(0, -4, 'blood_slash');
    slash.setScale(2);
    slash.setAlpha(0);
    this.add(slash);

    this.scene.tweens.add({
      targets: slash,
      alpha: 1,
      scaleX: 2.5,
      duration: 150,
      ease: 'Power3',
    });

    // Spray blood drops upward and outward from neck - initial burst
    this.scene.time.delayedCall(100, () => {
      for (let i = 0; i < 25; i++) {
        const drop = this.scene.add.image(
          Phaser.Math.Between(-6, 6),
          Phaser.Math.Between(-8, -4),
          'blood_drop',
        );
        drop.setScale(Phaser.Math.FloatBetween(1, 3));
        drop.setTint(Phaser.Math.Between(0, 2) === 0 ? 0xff0000 : Phaser.Math.Between(0, 1) ? 0xcc0000 : 0xdd2200);
        this.add(drop);

        const angle = Phaser.Math.FloatBetween(-Math.PI * 0.9, -Math.PI * 0.1);
        const dist = Phaser.Math.Between(25, 70);
        const gravity = Phaser.Math.Between(30, 70);

        this.scene.tweens.add({
          targets: drop,
          x: drop.x + Math.cos(angle) * dist,
          y: drop.y + Math.sin(angle) * dist + gravity,
          alpha: 0.7,
          scaleX: drop.scaleX * 0.4,
          scaleY: drop.scaleY * 0.4,
          angle: Phaser.Math.Between(-360, 360),
          duration: Phaser.Math.Between(400, 800),
          ease: 'Power1',
          onComplete: () => drop.destroy(),
        });
      }
    });

    // Continuous arterial spray - 3 rapid bursts
    for (let burst = 0; burst < 3; burst++) {
      this.scene.time.delayedCall(200 + burst * 150, () => {
        for (let i = 0; i < 15; i++) {
          const drop = this.scene.add.image(
            Phaser.Math.Between(-4, 4),
            Phaser.Math.Between(-8, -4),
            'blood_drop',
          );
          drop.setScale(Phaser.Math.FloatBetween(1.5, 3.5));
          drop.setTint(burst === 0 ? 0xff0000 : burst === 1 ? 0xdd0000 : 0xbb0000);
          this.add(drop);

          // Spray in a fan pattern, alternating left/right each burst
          const side = burst % 2 === 0 ? -1 : 1;
          const angle = Phaser.Math.FloatBetween(-Math.PI * 0.7, -Math.PI * 0.3) + side * 0.3;
          const dist = Phaser.Math.Between(30, 80);

          this.scene.tweens.add({
            targets: drop,
            x: drop.x + Math.cos(angle) * dist,
            y: drop.y + Math.sin(angle) * dist + Phaser.Math.Between(35, 75),
            alpha: 0.5,
            scaleX: drop.scaleX * 0.3,
            scaleY: drop.scaleY * 0.3,
            angle: Phaser.Math.Between(-360, 360),
            duration: Phaser.Math.Between(350, 700),
            ease: 'Power1',
            onComplete: () => drop.destroy(),
          });
        }
      });
    }

    // Phase 2: Heavy dripping blood + stagger
    this.scene.time.delayedCall(500, () => {
      // Thick drips running down the body
      for (let i = 0; i < 18; i++) {
        const drop = this.scene.add.image(
          Phaser.Math.Between(-8, 8),
          Phaser.Math.Between(-10, 0),
          'blood_drop',
        );
        drop.setScale(Phaser.Math.FloatBetween(1.5, 3.5));
        drop.setTint(Phaser.Math.Between(0, 1) ? 0x990000 : 0xaa0000);
        this.add(drop);

        this.scene.tweens.add({
          targets: drop,
          x: drop.x + Phaser.Math.Between(-10, 10),
          y: drop.y + Phaser.Math.Between(25, 55),
          alpha: 0.4,
          scaleY: drop.scaleY * 1.5,
          duration: Phaser.Math.Between(500, 1000),
          ease: 'Power2',
          onComplete: () => drop.destroy(),
        });
      }

      // Sideways spray hitting the "ground"
      for (let i = 0; i < 10; i++) {
        const drop = this.scene.add.image(
          Phaser.Math.Between(-4, 4),
          -6,
          'blood_drop',
        );
        drop.setScale(Phaser.Math.FloatBetween(1, 2));
        drop.setTint(0xcc0000);
        this.add(drop);

        const dir = Phaser.Math.Between(0, 1) ? 1 : -1;
        this.scene.tweens.add({
          targets: drop,
          x: drop.x + dir * Phaser.Math.Between(20, 50),
          y: drop.y + Phaser.Math.Between(15, 35),
          alpha: 0.3,
          angle: dir * Phaser.Math.Between(90, 270),
          duration: Phaser.Math.Between(300, 600),
          ease: 'Power1',
          onComplete: () => drop.destroy(),
        });
      }

      // Violent stagger/shake
      this.scene.tweens.add({
        targets: this.sprite,
        x: this.sprite.x + 4,
        duration: 50,
        yoyo: true,
        repeat: 6,
        ease: 'Sine.easeInOut',
      });
    });

    // Phase 3: Collapse - agent falls face-first with impact spray
    this.scene.time.delayedCall(900, () => {
      // One last arterial gush as they go down
      for (let i = 0; i < 10; i++) {
        const drop = this.scene.add.image(
          Phaser.Math.Between(-3, 3),
          -6,
          'blood_drop',
        );
        drop.setScale(Phaser.Math.FloatBetween(2, 4));
        drop.setTint(0xff0000);
        this.add(drop);

        this.scene.tweens.add({
          targets: drop,
          x: drop.x + Phaser.Math.Between(-40, 40),
          y: drop.y + Phaser.Math.Between(20, 50),
          alpha: 0.5,
          angle: Phaser.Math.Between(-180, 180),
          duration: Phaser.Math.Between(300, 600),
          ease: 'Power1',
          onComplete: () => drop.destroy(),
        });
      }

      this.scene.tweens.add({
        targets: this.sprite,
        angle: 90,
        y: this.sprite.y + 12,
        x: this.sprite.x + 4,
        duration: 400,
        ease: 'Back.easeIn',
        onComplete: () => {
          // Impact splash - blood flies out on impact
          for (let i = 0; i < 15; i++) {
            const splash = this.scene.add.image(
              Phaser.Math.Between(-4, 10),
              Phaser.Math.Between(6, 14),
              'blood_drop',
            );
            splash.setScale(Phaser.Math.FloatBetween(1, 2.5));
            splash.setTint(Phaser.Math.Between(0, 1) ? 0xcc0000 : 0xff0000);
            this.add(splash);

            const dir = Phaser.Math.FloatBetween(0, Math.PI);
            const dist = Phaser.Math.Between(15, 45);
            this.scene.tweens.add({
              targets: splash,
              x: splash.x + Math.cos(dir) * dist,
              y: splash.y + Math.sin(dir) * Phaser.Math.Between(5, 20),
              alpha: 0.3,
              scaleX: 0.5,
              scaleY: 0.5,
              duration: Phaser.Math.Between(300, 600),
              ease: 'Power2',
              onComplete: () => splash.destroy(),
            });
          }

          // Blood pool spreads under the body - larger
          const pool = this.scene.add.image(4, 10, 'blood_splat');
          pool.setScale(0.5, 0.3);
          pool.setAlpha(0);
          pool.setTint(0xaa0000);
          this.add(pool);

          this.scene.tweens.add({
            targets: pool,
            alpha: 0.9,
            scaleX: 3.5,
            scaleY: 2,
            duration: 1000,
            ease: 'Power2',
          });

          // Second pool layer - darker, wider spread
          const pool2 = this.scene.add.image(2, 12, 'blood_splat');
          pool2.setScale(0.3, 0.2);
          pool2.setAlpha(0);
          pool2.setTint(0x660000);
          this.add(pool2);

          this.scene.tweens.add({
            targets: pool2,
            alpha: 0.8,
            scaleX: 4,
            scaleY: 2.2,
            duration: 1400,
            delay: 150,
            ease: 'Power1',
          });

          // Third pool - bright red on top, spreading further
          const pool3 = this.scene.add.image(-2, 8, 'blood_splat');
          pool3.setScale(0.2, 0.2);
          pool3.setAlpha(0);
          pool3.setTint(0xdd0000);
          this.add(pool3);

          this.scene.tweens.add({
            targets: pool3,
            alpha: 0.6,
            scaleX: 2.5,
            scaleY: 1.5,
            duration: 1600,
            delay: 400,
            ease: 'Power1',
          });

          // Continuous drips from the body - more of them, longer lasting
          for (let i = 0; i < 10; i++) {
            this.scene.time.delayedCall(i * 150, () => {
              if (!this.scene) return;
              const drip = this.scene.add.image(
                Phaser.Math.Between(-4, 10),
                Phaser.Math.Between(2, 10),
                'blood_drop',
              );
              drip.setScale(Phaser.Math.FloatBetween(1, 2));
              drip.setTint(0xaa0000);
              this.add(drip);

              this.scene.tweens.add({
                targets: drip,
                y: drip.y + Phaser.Math.Between(5, 12),
                alpha: 0.3,
                duration: Phaser.Math.Between(400, 700),
                ease: 'Power2',
                onComplete: () => drip.destroy(),
              });
            });
          }

          // Neon glow pulses red ominously
          this.scene.tweens.add({
            targets: this.neonGlow,
            alpha: 0.8,
            duration: 300,
            yoyo: true,
            repeat: 2,
            ease: 'Sine.easeInOut',
            onComplete: () => {
              this.neonGlow.setFillStyle(0x660000, 0.4);
            },
          });
        },
      });
    });

    // Phase 4: Fade everything out after the carnage
    this.scene.time.delayedCall(3500, () => {
      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        duration: 800,
        ease: 'Power2',
        onComplete: () => {
          onComplete?.();
          this.destroy();
        },
      });
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
