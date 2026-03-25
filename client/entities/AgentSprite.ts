import Phaser from 'phaser';
import type { AgentSession, AgentActivity } from '@shared/types';
import { TOMBSTONE_DURATION_MS } from '@shared/constants';
import { BootScene } from '../scenes/BootScene';

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
  public isZombie = false;
  private spriteKey: string;
  private currentAnim = '';
  private targetX = 0;
  private targetY = 0;
  private isMoving = false;
  private isEmoting = false;
  private moveSpeed = 80; // pixels per second
  private zombieStaggerTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene, session: AgentSession) {
    super(scene, 0, 0);

    this.sessionData = session;

    // Generate a custom sprite sheet for this avatar's config
    const bootScene = scene.scene.get('BootScene') as BootScene;
    if (session.avatar?.hairStyle !== undefined && bootScene) {
      this.spriteKey = bootScene.generateAgentSprite(session.avatar);
    } else {
      const spriteIdx = session.avatar?.spriteIndex ?? 0;
      this.spriteKey = `agent_${spriteIdx % 8}`;
    }

    // Neon glow under feet
    this.neonGlow = scene.add.rectangle(0, 6, 20, 6, 0xff00ff, 0.15);
    this.add(this.neonGlow);

    // Character sprite
    this.sprite = scene.add.sprite(0, 0, this.spriteKey, 1);
    this.sprite.setScale(2);
    this.sprite.setOrigin(0.5, 0.5);
    this.add(this.sprite);

    // Nametag
    this.nametag = scene.add.text(0, -24, this.computeLabel(session), {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#00ffff',
      backgroundColor: 'rgba(10, 10, 26, 0.85)',
      padding: { x: 3, y: 1 },
      align: 'center',
    });
    this.nametag.setOrigin(0.5, 1);
    this.add(this.nametag);

    // For new-style avatars, colors are baked into the sprite — tint the glow only.
    // For legacy avatars (no hairStyle), apply tint to the sprite too.
    if (session.avatar?.color) {
      const hex = parseInt(session.avatar.color.replace('#', ''), 16);
      if (!isNaN(hex)) {
        if (session.avatar.hairStyle === undefined) {
          this.sprite.setTint(hex);
        }
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
    this.nametag.setText(this.computeLabel(session));

    // Update status icon
    this.updateStatusIcon(session.activity, session.currentTool);
  }

  die(onComplete?: () => void, serverGraphicDeath?: boolean) {
    if (serverGraphicDeath || this.sessionData.avatar?.graphicDeath) {
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

  // ── Emotes ───────────────────────────────────────────────────────

  playEmote(emote: string) {
    if (this.isEmoting) return;
    this.isEmoting = true;

    switch (emote) {
      case 'dance':  this.emoteDance(); break;
      case 'jump':   this.emoteJump(); break;
      case 'guitar': this.emoteGuitar(); break;
      case 'gun':    this.emoteGun(); break;
      case 'laugh':  this.emoteLaugh(); break;
      default:       this.isEmoting = false; break;
    }
  }

  private finishEmote() {
    this.isEmoting = false;
    // Reset sprite transform in case an emote left it altered
    this.sprite.setAngle(0);
    this.sprite.setPosition(0, 0);
    this.sprite.setScale(2);
  }

  private showEmoteLabel(text: string, duration = 1200) {
    const label = this.scene.add.text(0, -38, text, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffffff',
    }).setOrigin(0.5);
    this.add(label);

    this.scene.tweens.add({
      targets: label,
      y: label.y - 18,
      alpha: 0,
      duration,
      ease: 'Power2',
      onComplete: () => label.destroy(),
    });
  }

  private emoteDance() {
    this.showEmoteLabel('\u266b dance \u266b');

    const rainbowColors = [0xff0000, 0xff8800, 0xffff00, 0x00ff00, 0x0088ff, 0xff00ff];

    // Sway side-to-side
    this.scene.tweens.add({
      targets: this.sprite,
      x: 6,
      duration: 300,
      yoyo: true,
      repeat: 5,
      ease: 'Sine.easeInOut',
      onYoyo: (_tween: Phaser.Tweens.Tween, target: Phaser.GameObjects.Sprite) => {
        target.x = target.x > 0 ? -6 : 6;
      },
    });

    // Slight rotation bounce
    this.scene.tweens.add({
      targets: this.sprite,
      angle: 10,
      duration: 200,
      yoyo: true,
      repeat: 5,
      ease: 'Sine.easeInOut',
      onYoyo: (_tween: Phaser.Tweens.Tween, target: Phaser.GameObjects.Sprite) => {
        target.angle = target.angle > 0 ? -10 : 10;
      },
    });

    // Rainbow particles every 300ms
    for (let i = 0; i < 6; i++) {
      this.scene.time.delayedCall(i * 300, () => {
        if (!this.scene) return;
        const color = rainbowColors[i % rainbowColors.length];
        for (let j = 0; j < 3; j++) {
          const p = this.scene.add.circle(
            this.x + Phaser.Math.Between(-10, 10),
            this.y + Phaser.Math.Between(-15, 5),
            Phaser.Math.Between(2, 4), color, 0.8,
          ).setDepth(this.depth + 1);

          this.scene.tweens.add({
            targets: p,
            y: p.y - Phaser.Math.Between(15, 30),
            x: p.x + Phaser.Math.Between(-12, 12),
            alpha: 0,
            scaleX: 0.3,
            scaleY: 0.3,
            duration: Phaser.Math.Between(400, 700),
            ease: 'Power2',
            onComplete: () => p.destroy(),
          });
        }
      });
    }

    // Neon glow pulses
    const origAlpha = this.neonGlow.alpha;
    this.scene.tweens.add({
      targets: this.neonGlow,
      alpha: 0.6,
      duration: 300,
      yoyo: true,
      repeat: 3,
    });

    this.scene.time.delayedCall(2000, () => {
      this.neonGlow.setAlpha(origAlpha);
      this.finishEmote();
    });
  }

  private emoteJump() {
    this.showEmoteLabel('boing!');

    const origY = this.sprite.y;

    // Jump up
    this.scene.tweens.add({
      targets: this.sprite,
      y: origY - 40,
      duration: 400,
      ease: 'Back.easeOut',
      onComplete: () => {
        // Sparkle particles at peak
        for (let i = 0; i < 6; i++) {
          const spark = this.scene.add.circle(
            this.x + Phaser.Math.Between(-8, 8),
            this.y - 40 + Phaser.Math.Between(-5, 5),
            2, 0xffff00, 0.9,
          ).setDepth(this.depth + 1);

          const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
          this.scene.tweens.add({
            targets: spark,
            x: spark.x + Math.cos(angle) * 20,
            y: spark.y + Math.sin(angle) * 20,
            alpha: 0,
            duration: 400,
            ease: 'Power2',
            onComplete: () => spark.destroy(),
          });
        }

        // Fall back down
        this.scene.tweens.add({
          targets: this.sprite,
          y: origY,
          duration: 500,
          ease: 'Bounce.easeOut',
          onComplete: () => {
            // Squash on landing
            this.scene.tweens.add({
              targets: this.sprite,
              scaleY: 1.4,
              scaleX: 2.6,
              duration: 80,
              yoyo: true,
              ease: 'Power1',
            });

            // Dust particles on landing
            for (let i = 0; i < 8; i++) {
              const dust = this.scene.add.circle(
                this.x + Phaser.Math.Between(-12, 12),
                this.y + 6,
                Phaser.Math.Between(1, 3), 0xaaaaaa, 0.5,
              ).setDepth(this.depth + 1);

              this.scene.tweens.add({
                targets: dust,
                x: dust.x + Phaser.Math.Between(-20, 20),
                y: dust.y + Phaser.Math.Between(-5, 5),
                alpha: 0,
                duration: Phaser.Math.Between(300, 600),
                ease: 'Power2',
                onComplete: () => dust.destroy(),
              });
            }

            this.scene.time.delayedCall(300, () => this.finishEmote());
          },
        });
      },
    });
  }

  private emoteGuitar() {
    this.showEmoteLabel('\u266a \u266b \u266a');

    const noteChars = ['\u266a', '\u266b', '\u2669'];
    const noteColors = ['#ff44ff', '#44ffff', '#ffff44', '#44ff44', '#ff8844'];

    // Headbang tilt
    this.scene.tweens.add({
      targets: this.sprite,
      angle: 15,
      duration: 200,
      yoyo: true,
      repeat: 7,
      ease: 'Sine.easeInOut',
      onYoyo: (_tween: Phaser.Tweens.Tween, target: Phaser.GameObjects.Sprite) => {
        target.angle = target.angle > 0 ? -15 : 15;
      },
    });

    // Floating musical notes
    for (let i = 0; i < 8; i++) {
      this.scene.time.delayedCall(i * 250, () => {
        if (!this.scene) return;
        const note = this.scene.add.text(
          this.x + Phaser.Math.Between(-12, 12),
          this.y - 20,
          noteChars[i % noteChars.length],
          {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: noteColors[i % noteColors.length],
          },
        ).setOrigin(0.5).setDepth(this.depth + 1);

        this.scene.tweens.add({
          targets: note,
          y: note.y - Phaser.Math.Between(25, 45),
          x: note.x + Phaser.Math.Between(-15, 15),
          alpha: 0,
          duration: Phaser.Math.Between(600, 900),
          ease: 'Power1',
          onComplete: () => note.destroy(),
        });
      });
    }

    // Yellow sparks at hand positions
    for (let i = 0; i < 4; i++) {
      this.scene.time.delayedCall(200 + i * 400, () => {
        if (!this.scene) return;
        for (let j = 0; j < 3; j++) {
          const side = j % 2 === 0 ? -8 : 8;
          const spark = this.scene.add.circle(
            this.x + side, this.y + 4,
            2, 0xffcc00, 0.8,
          ).setDepth(this.depth + 1);

          this.scene.tweens.add({
            targets: spark,
            y: spark.y + Phaser.Math.Between(-10, -20),
            x: spark.x + Phaser.Math.Between(-8, 8),
            alpha: 0,
            duration: 400,
            ease: 'Power2',
            onComplete: () => spark.destroy(),
          });
        }
      });
    }

    this.scene.time.delayedCall(2200, () => this.finishEmote());
  }

  private emoteGun() {
    this.showEmoteLabel('pew pew!');

    const fireShot = (delay: number) => {
      this.scene.time.delayedCall(delay, () => {
        if (!this.scene) return;

        // Recoil
        this.scene.tweens.add({
          targets: this.sprite,
          x: this.sprite.x - 3,
          duration: 60,
          yoyo: true,
          ease: 'Power2',
        });

        // Muzzle flash
        const flash = this.scene.add.circle(
          this.x + 22, this.y - 4,
          6, 0xffff00, 0.9,
        ).setDepth(this.depth + 1);

        this.scene.tweens.add({
          targets: flash,
          scaleX: 2.5,
          scaleY: 2.5,
          alpha: 0,
          duration: 150,
          ease: 'Power3',
          onComplete: () => flash.destroy(),
        });

        // White core flash
        const core = this.scene.add.circle(
          this.x + 22, this.y - 4,
          3, 0xffffff, 1,
        ).setDepth(this.depth + 2);

        this.scene.tweens.add({
          targets: core,
          alpha: 0,
          scaleX: 1.5,
          scaleY: 1.5,
          duration: 80,
          onComplete: () => core.destroy(),
        });

        // Bullet trails
        for (let i = 0; i < 3; i++) {
          const bullet = this.scene.add.rectangle(
            this.x + 24, this.y - 4 + Phaser.Math.Between(-3, 3),
            4, 1, 0xffff00, 0.8,
          ).setDepth(this.depth + 1);

          this.scene.tweens.add({
            targets: bullet,
            x: bullet.x + 80,
            alpha: 0,
            scaleX: 0.3,
            duration: Phaser.Math.Between(200, 350),
            ease: 'Power1',
            onComplete: () => bullet.destroy(),
          });
        }

        // Smoke
        for (let i = 0; i < 4; i++) {
          const smoke = this.scene.add.circle(
            this.x + 20 + Phaser.Math.Between(-3, 3),
            this.y - 4,
            Phaser.Math.Between(2, 4), 0x888888, 0.3,
          ).setDepth(this.depth + 1);

          this.scene.tweens.add({
            targets: smoke,
            y: smoke.y - Phaser.Math.Between(10, 25),
            x: smoke.x + Phaser.Math.Between(-5, 5),
            alpha: 0,
            scaleX: 2,
            scaleY: 2,
            duration: Phaser.Math.Between(400, 700),
            ease: 'Power1',
            onComplete: () => smoke.destroy(),
          });
        }
      });
    };

    fireShot(100);
    fireShot(500);

    this.scene.time.delayedCall(1500, () => this.finishEmote());
  }

  private emoteLaugh() {
    this.showEmoteLabel('haha!');

    // Rapid bouncing
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.sprite.y - 5,
      duration: 120,
      yoyo: true,
      repeat: 7,
      ease: 'Sine.easeInOut',
    });

    // Floating "ha" text
    const haTexts = ['ha', 'ha', 'HA', 'ha', 'HA'];
    for (let i = 0; i < haTexts.length; i++) {
      this.scene.time.delayedCall(i * 200, () => {
        if (!this.scene) return;
        const ha = this.scene.add.text(
          this.x + Phaser.Math.Between(-15, 15),
          this.y - 20,
          haTexts[i],
          {
            fontFamily: 'monospace',
            fontSize: i === 2 || i === 4 ? '12px' : '9px',
            color: '#ffdd00',
            fontStyle: 'bold',
          },
        ).setOrigin(0.5).setDepth(this.depth + 1);

        this.scene.tweens.add({
          targets: ha,
          y: ha.y - Phaser.Math.Between(20, 40),
          x: ha.x + Phaser.Math.Between(-10, 10),
          alpha: 0,
          duration: Phaser.Math.Between(500, 800),
          ease: 'Power1',
          onComplete: () => ha.destroy(),
        });
      });
    }

    // Cheerful particles
    for (let i = 0; i < 3; i++) {
      this.scene.time.delayedCall(300 + i * 250, () => {
        if (!this.scene) return;
        for (let j = 0; j < 3; j++) {
          const color = j % 2 === 0 ? 0xffdd00 : 0xff8800;
          const p = this.scene.add.circle(
            this.x + Phaser.Math.Between(-8, 8),
            this.y + Phaser.Math.Between(-10, 0),
            Phaser.Math.Between(1, 3), color, 0.7,
          ).setDepth(this.depth + 1);

          this.scene.tweens.add({
            targets: p,
            y: p.y - Phaser.Math.Between(10, 20),
            x: p.x + Phaser.Math.Between(-10, 10),
            alpha: 0,
            duration: Phaser.Math.Between(300, 500),
            ease: 'Power2',
            onComplete: () => p.destroy(),
          });
        }
      });
    }

    this.scene.time.delayedCall(1500, () => this.finishEmote());
  }

  spawnTombstone(): { container: Phaser.GameObjects.Container; x: number; y: number } {
    const worldX = this.x;
    const worldY = this.y;
    const label = this.computeLabel(this.sessionData);
    const scene = this.scene; // Capture before this sprite is destroyed

    const container = scene.add.container(worldX, worldY + 4);
    container.setDepth(7 + worldY * 0.001);
    container.setAlpha(0);
    container.setScale(0.5);

    // Tombstone image
    const stone = scene.add.image(0, 0, 'tombstone');
    stone.setScale(2);
    container.add(stone);

    // Name text above tombstone
    const name = scene.add.text(0, -26, label, {
      fontFamily: 'monospace',
      fontSize: '7px',
      color: '#aaaacc',
      backgroundColor: 'rgba(10, 10, 26, 0.7)',
      padding: { x: 2, y: 1 },
    });
    name.setOrigin(0.5, 1);
    container.add(name);

    // Rise up from the ground
    scene.tweens.add({
      targets: container,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      y: worldY - 4,
      duration: 600,
      ease: 'Back.easeOut',
    });

    // Fade out and sink after duration
    scene.time.delayedCall(TOMBSTONE_DURATION_MS, () => {
      if (container.scene) {
        container.scene.tweens.add({
          targets: container,
          alpha: 0,
          y: container.y + 10,
          scaleX: 0.6,
          scaleY: 0.6,
          duration: 800,
          ease: 'Power2',
          onComplete: () => container.destroy(),
        });
      }
    });

    return { container, x: worldX, y: worldY };
  }

  riseFromGrave(graveX: number, graveY: number, tombstone: Phaser.GameObjects.Container) {
    this.isZombie = true;

    // Position at grave
    this.setPosition(graveX, graveY);
    this.setAlpha(0);
    this.sprite.setAngle(0);

    // Start buried — offset down and invisible
    this.sprite.setY(16);
    this.nametag.setAlpha(0);
    this.neonGlow.setAlpha(0);

    // Permanent zombie look: sickly green tint, green glow, zombie nametag
    this.sprite.setTint(0x55aa55);
    this.neonGlow.setFillStyle(0x00ff00, 0.25);
    this.nametag.setColor('#55cc55');
    this.nametag.setText(`☠ ${this.computeLabel(this.sessionData)}`);

    // Slower zombie walk speed
    this.moveSpeed = 45;

    // Shake and destroy tombstone
    this.scene.tweens.add({
      targets: tombstone,
      x: tombstone.x + 2,
      duration: 60,
      yoyo: true,
      repeat: 8,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        // Tombstone cracks apart
        this.scene.tweens.add({
          targets: tombstone,
          alpha: 0,
          scaleX: 1.3,
          scaleY: 0.4,
          y: tombstone.y + 8,
          duration: 300,
          ease: 'Power2',
          onComplete: () => tombstone.destroy(),
        });
      },
    });

    // Emit dirt particles
    this.scene.time.delayedCall(500, () => {
      for (let i = 0; i < 12; i++) {
        const dirt = this.scene.add.circle(
          graveX + Phaser.Math.Between(-10, 10),
          graveY + Phaser.Math.Between(-4, 4),
          Phaser.Math.Between(1, 3),
          Phaser.Math.Between(0, 1) ? 0x3a2a1a : 0x2a5a2a,
        ).setDepth(9);

        this.scene.tweens.add({
          targets: dirt,
          x: dirt.x + Phaser.Math.Between(-20, 20),
          y: dirt.y - Phaser.Math.Between(10, 30),
          alpha: 0,
          duration: Phaser.Math.Between(400, 700),
          ease: 'Power2',
          onComplete: () => dirt.destroy(),
        });
      }
    });

    // Agent rises up from the ground
    this.scene.time.delayedCall(600, () => {
      this.setAlpha(1);

      // Rise sprite from below
      this.scene.tweens.add({
        targets: this.sprite,
        y: 0,
        duration: 800,
        ease: 'Power2',
      });

      // Fade in nametag
      this.scene.tweens.add({
        targets: this.nametag,
        alpha: 1,
        duration: 400,
        delay: 400,
      });

      // Fade in glow
      this.scene.tweens.add({
        targets: this.neonGlow,
        alpha: 0.25,
        duration: 400,
        delay: 400,
      });

      // Zombie stagger on rise
      this.scene.tweens.add({
        targets: this.sprite,
        x: this.sprite.x + 3,
        duration: 100,
        yoyo: true,
        repeat: 3,
        delay: 800,
        ease: 'Sine.easeInOut',
      });

      // Continuous zombie idle stagger — tilts back and forth periodically
      this.zombieStaggerTimer = this.scene.time.addEvent({
        delay: 2000,
        loop: true,
        callback: () => {
          if (!this.scene || !this.sprite) return;
          this.scene.tweens.add({
            targets: this.sprite,
            angle: Phaser.Math.Between(-4, 4),
            duration: 300,
            yoyo: true,
            ease: 'Sine.easeInOut',
          });
        },
      });

      // Green spark burst
      this.scene.time.delayedCall(1500, () => {
        if (!this.scene) return;
        this.scene.tweens.add({
          targets: this.neonGlow,
          alpha: 0.5,
          duration: 200,
          yoyo: true,
        });
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

  private computeLabel(session: AgentSession): string {
    return session.username;
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
    const parts: string[] = [];
    if (this.sessionData.sessionName) parts.push(this.sessionData.sessionName);
    parts.push(cwdBase);
    if (this.sessionData.activity) parts.push(this.sessionData.activity);
    if (subCount > 0) parts.push(`${subCount} subagent(s)`);
    detailEl.textContent = parts.join(' | ');

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
