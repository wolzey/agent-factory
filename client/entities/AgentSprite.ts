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
  compacting: 'compress',
};

const ICON_FRAME_MAP: Record<string, number> = {
  terminal: 1,
  pencil: 2,
  magnifier: 3,
  globe: 4,
  chat: 5,
  brain: 6,
  compress: 7,
};

export class AgentSprite extends Phaser.GameObjects.Container {
  private sprite: Phaser.GameObjects.Sprite;
  private nametag: Phaser.GameObjects.Text;
  private statusIcon: Phaser.GameObjects.Sprite | null = null;
  private neonGlow: Phaser.GameObjects.Rectangle;
  private thoughtBubble: Phaser.GameObjects.Container | null = null;
  private questionBubble: Phaser.GameObjects.Container | null = null;
  private planningClipboard: Phaser.GameObjects.Container | null = null;

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

  getMoveSpeed(): number {
    return this.moveSpeed;
  }

  setMoveSpeed(speed: number) {
    this.moveSpeed = speed;
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
      case 'laugh':   this.emoteLaugh(); break;
      case 'wave':    this.emoteWave(); break;
      case 'sleep':   this.emoteSleep(); break;
      case 'explode': this.emoteExplode(); break;
      case 'dizzy':   this.emoteDizzy(); break;
      case 'flex':    this.emoteFlex(); break;
      case 'rage':    this.emoteRage(); break;
      case 'fart':    this.emoteFart(); break;
      default:        this.isEmoting = false; break;
    }
  }

  private finishEmote() {
    this.isEmoting = false;
    // Reset sprite transform in case an emote left it altered
    this.sprite.setAngle(0);
    this.sprite.setPosition(0, 0);
    this.sprite.setScale(2);
  }

  playGunDeath() {
    if (this.isEmoting) return;
    this.isEmoting = true;

    const origGlowColor = this.neonGlow.fillColor;
    const origGlowAlpha = this.neonGlow.fillAlpha;
    const origSpriteY = this.sprite.y;

    // Phase 1: Fall over
    this.scene.tweens.add({
      targets: this.nametag,
      alpha: 0,
      duration: 300,
    });
    this.statusIcon?.setVisible(false);

    this.scene.tweens.add({
      targets: this.sprite,
      angle: 90,
      y: origSpriteY + 8,
      duration: 500,
      ease: 'Bounce.easeOut',
    });

    // Phase 2: Skull appears
    this.scene.time.delayedCall(500, () => {
      if (!this.scene) return;

      const skull = this.scene.add.image(12, -20, 'skull');
      skull.setScale(1.5).setAlpha(0);
      this.add(skull);

      this.scene.tweens.add({
        targets: skull,
        alpha: 1,
        duration: 300,
        ease: 'Power2',
      });

      this.neonGlow.setFillStyle(0xff0000, 0.3);

      // Phase 3: Recovery
      this.scene.time.delayedCall(1300, () => {
        if (!this.scene) return;

        // Skull fades out
        this.scene.tweens.add({
          targets: skull,
          alpha: 0,
          duration: 300,
          onComplete: () => skull.destroy(),
        });

        // Sprite gets back up
        this.scene.tweens.add({
          targets: this.sprite,
          angle: 0,
          y: origSpriteY,
          duration: 400,
          ease: 'Back.easeOut',
        });

        // Nametag returns
        this.scene.tweens.add({
          targets: this.nametag,
          alpha: 1,
          duration: 300,
        });

        // Restore glow
        this.neonGlow.setFillStyle(origGlowColor, origGlowAlpha);
        this.statusIcon?.setVisible(true);

        // Finish
        this.scene.time.delayedCall(500, () => this.finishEmote());
      });
    });
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

  showFloatingLabel(text: string, color: string, duration = 1500) {
    const label = this.scene.add.text(0, -38, text, {
      fontFamily: 'monospace',
      fontSize: '10px',
      color,
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

  private emoteWave() {
    this.showEmoteLabel('hey!');

    // Wave tilt back and forth
    this.scene.tweens.add({
      targets: this.sprite,
      angle: 12,
      duration: 250,
      yoyo: true,
      repeat: 5,
      ease: 'Sine.easeInOut',
      onYoyo: (_tween: Phaser.Tweens.Tween, target: Phaser.GameObjects.Sprite) => {
        target.angle = target.angle > 0 ? -12 : 12;
      },
    });

    // Sparkle dots in an arc above agent
    for (let i = 0; i < 6; i++) {
      this.scene.time.delayedCall(i * 150, () => {
        if (!this.scene) return;
        const angle = (Math.PI * 0.2) + (i / 5) * (Math.PI * 0.6);
        const radius = 18;
        const color = i % 2 === 0 ? 0x00ffff : 0xffffff;
        const spark = this.scene.add.circle(
          this.x + Math.cos(angle) * radius,
          this.y - 20 - Math.sin(angle) * radius,
          2, color, 0.9,
        ).setDepth(this.depth + 1);

        this.scene.tweens.add({
          targets: spark,
          y: spark.y - Phaser.Math.Between(20, 30),
          alpha: 0,
          duration: 500,
          ease: 'Power2',
          onComplete: () => spark.destroy(),
        });
      });
    }

    // Hand-wave trail circles on right side
    for (let i = 0; i < 3; i++) {
      this.scene.time.delayedCall(200 + i * 200, () => {
        if (!this.scene) return;
        const trail = this.scene.add.circle(
          this.x + 10 + i * 3, this.y - 8 + i * 2,
          Phaser.Math.Between(1, 2), 0x00ffff, 0.6,
        ).setDepth(this.depth + 1);

        this.scene.tweens.add({
          targets: trail,
          x: trail.x + 8,
          y: trail.y - 10,
          alpha: 0,
          duration: 400,
          ease: 'Power2',
          onComplete: () => trail.destroy(),
        });
      });
    }

    this.scene.time.delayedCall(1500, () => this.finishEmote());
  }

  private emoteSleep() {
    this.showEmoteLabel('zzz...', 2000);

    // Sink down gently and bob
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.sprite.y + 4,
      duration: 400,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.sprite,
          y: this.sprite.y - 2,
          duration: 600,
          yoyo: true,
          repeat: 4,
          ease: 'Sine.easeInOut',
        });
      },
    });

    // Breathing alpha pulse
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0.7,
      duration: 800,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.easeInOut',
    });

    // Floating Z characters growing in size
    const zSizes = ['8px', '9px', '10px', '12px', '14px'];
    for (let i = 0; i < 5; i++) {
      this.scene.time.delayedCall(i * 400, () => {
        if (!this.scene) return;
        const z = this.scene.add.text(
          this.x + 5 + i * 3,
          this.y - 20,
          'Z',
          {
            fontFamily: 'monospace',
            fontSize: zSizes[i],
            color: '#88bbff',
            fontStyle: 'bold',
          },
        ).setOrigin(0.5).setDepth(this.depth + 1);

        this.scene.tweens.add({
          targets: z,
          y: z.y - Phaser.Math.Between(30, 50),
          x: z.x + Phaser.Math.Between(10, 20),
          alpha: 0,
          duration: Phaser.Math.Between(800, 1200),
          ease: 'Power1',
          onComplete: () => z.destroy(),
        });
      });
    }

    // Blue particles
    for (let i = 0; i < 3; i++) {
      this.scene.time.delayedCall(300 + i * 500, () => {
        if (!this.scene) return;
        for (let j = 0; j < 2; j++) {
          const color = j % 2 === 0 ? 0x4488ff : 0x6699ff;
          const p = this.scene.add.circle(
            this.x + Phaser.Math.Between(-8, 8),
            this.y - 15,
            Phaser.Math.Between(1, 3), color, 0.5,
          ).setDepth(this.depth + 1);

          this.scene.tweens.add({
            targets: p,
            y: p.y - Phaser.Math.Between(15, 25),
            alpha: 0,
            duration: Phaser.Math.Between(500, 800),
            ease: 'Power1',
            onComplete: () => p.destroy(),
          });
        }
      });
    }

    this.scene.time.delayedCall(2500, () => {
      this.sprite.setAlpha(1);
      this.finishEmote();
    });
  }

  private emoteExplode() {
    this.showEmoteLabel('BOOM!');

    const origTint = this.sprite.tintTopLeft;

    // Phase 1: Rapid shake
    for (let i = 0; i < 10; i++) {
      this.scene.time.delayedCall(i * 40, () => {
        if (!this.scene) return;
        this.sprite.x = (i % 2 === 0 ? 3 : -3);
      });
    }

    // Phase 2: Flash white
    this.scene.time.delayedCall(400, () => {
      if (!this.scene) return;
      this.sprite.setTint(0xffffff);
      this.scene.time.delayedCall(100, () => {
        if (!this.scene) return;
        if (origTint && origTint !== 0xffffff) {
          this.sprite.setTint(origTint);
        } else {
          this.sprite.clearTint();
        }
      });
    });

    // Phase 3: Explosion burst
    this.scene.time.delayedCall(500, () => {
      if (!this.scene) return;

      // Sprite scales up and fades
      this.scene.tweens.add({
        targets: this.sprite,
        scaleX: 3,
        scaleY: 3,
        alpha: 0,
        duration: 150,
        ease: 'Power2',
      });

      // Particle burst in all directions
      const explosionColors = [0xff8800, 0xff2200, 0xffdd00];
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const color = explosionColors[i % explosionColors.length];
        const dist = Phaser.Math.Between(30, 50);
        const p = this.scene.add.circle(
          this.x, this.y,
          Phaser.Math.Between(3, 5), color, 0.9,
        ).setDepth(this.depth + 1);

        this.scene.tweens.add({
          targets: p,
          x: p.x + Math.cos(angle) * dist,
          y: p.y + Math.sin(angle) * dist,
          alpha: 0,
          scaleX: 0.3,
          scaleY: 0.3,
          duration: Phaser.Math.Between(400, 600),
          ease: 'Power2',
          onComplete: () => p.destroy(),
        });
      }

      // Shockwave rings
      for (let i = 0; i < 4; i++) {
        const ring = this.scene.add.circle(
          this.x, this.y,
          4, explosionColors[i % explosionColors.length], 0.6,
        ).setDepth(this.depth + 1);

        this.scene.tweens.add({
          targets: ring,
          scaleX: 4,
          scaleY: 4,
          alpha: 0,
          duration: 400 + i * 100,
          delay: i * 80,
          ease: 'Power2',
          onComplete: () => ring.destroy(),
        });
      }
    });

    // Phase 4: Agent reappears
    this.scene.time.delayedCall(1200, () => {
      if (!this.scene) return;
      this.sprite.setScale(0.5);
      this.sprite.setAlpha(0);
      this.scene.tweens.add({
        targets: this.sprite,
        scaleX: 2,
        scaleY: 2,
        alpha: 1,
        duration: 300,
        ease: 'Back.easeOut',
      });
    });

    this.scene.time.delayedCall(2000, () => {
      this.sprite.setAlpha(1);
      this.finishEmote();
    });
  }

  private emoteDizzy() {
    this.showEmoteLabel('@_@');

    // Wobble sprite in circular-ish motion
    this.scene.tweens.add({
      targets: this.sprite,
      x: 4,
      duration: 300,
      yoyo: true,
      repeat: 6,
      ease: 'Sine.easeInOut',
      onYoyo: (_tween: Phaser.Tweens.Tween, target: Phaser.GameObjects.Sprite) => {
        target.x = target.x > 0 ? -4 : 4;
      },
    });

    this.scene.tweens.add({
      targets: this.sprite,
      y: -3,
      duration: 200,
      yoyo: true,
      repeat: 9,
      ease: 'Sine.easeInOut',
      onYoyo: (_tween: Phaser.Tweens.Tween, target: Phaser.GameObjects.Sprite) => {
        target.y = target.y < 0 ? 3 : -3;
      },
    });

    // Angle jitter
    this.scene.tweens.add({
      targets: this.sprite,
      angle: 5,
      duration: 150,
      yoyo: true,
      repeat: 12,
      ease: 'Sine.easeInOut',
      onYoyo: (_tween: Phaser.Tweens.Tween, target: Phaser.GameObjects.Sprite) => {
        target.angle = target.angle > 0 ? -5 : 5;
      },
    });

    // Orbiting stars
    const starColors = ['#ffdd00', '#ffffff', '#00ffff'];
    for (let i = 0; i < 5; i++) {
      this.scene.time.delayedCall(i * 150, () => {
        if (!this.scene) return;
        const star = this.scene.add.text(0, 0, '\u2605', {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: starColors[i % starColors.length],
        }).setOrigin(0.5).setDepth(this.depth + 1);

        const startAngle = (i / 5) * Math.PI * 2;
        const radius = 14;
        const centerX = this.x;
        const centerY = this.y - 28;
        let elapsed = 0;

        this.scene.tweens.add({
          targets: star,
          alpha: { from: 0.9, to: 0 },
          duration: 1500,
          ease: 'Power1',
          onUpdate: (_tween: Phaser.Tweens.Tween) => {
            elapsed += 16; // approx frame time
            const a = startAngle + (elapsed / 300);
            star.x = centerX + Math.cos(a) * radius;
            star.y = centerY + Math.sin(a) * (radius * 0.5);
          },
          onComplete: () => star.destroy(),
        });
      });
    }

    // Small spiral particles
    for (let i = 0; i < 4; i++) {
      this.scene.time.delayedCall(200 + i * 300, () => {
        if (!this.scene) return;
        const p = this.scene.add.circle(
          this.x, this.y - 28,
          2, 0xffdd00, 0.6,
        ).setDepth(this.depth + 1);

        let t = 0;
        const spiralAngle = (i / 4) * Math.PI * 2;
        this.scene.tweens.add({
          targets: p,
          alpha: 0,
          duration: 800,
          onUpdate: () => {
            t += 16;
            const r = 16 - (t / 800) * 14;
            const a = spiralAngle + (t / 200);
            p.x = this.x + Math.cos(a) * r;
            p.y = (this.y - 28) + Math.sin(a) * (r * 0.5);
          },
          onComplete: () => p.destroy(),
        });
      });
    }

    this.scene.time.delayedCall(2000, () => this.finishEmote());
  }

  private emoteFlex() {
    this.showEmoteLabel('SWOLE');

    // Phase 1: Squat down
    this.scene.tweens.add({
      targets: this.sprite,
      scaleY: 1.6,
      scaleX: 2.3,
      duration: 300,
      ease: 'Power2',
      onComplete: () => {
        // Phase 2: Stand tall
        this.scene.tweens.add({
          targets: this.sprite,
          scaleY: 2.4,
          scaleX: 1.8,
          duration: 300,
          ease: 'Back.easeOut',
          onComplete: () => {
            // Reset to normal scale for the flex phase
            this.scene.tweens.add({
              targets: this.sprite,
              scaleX: 2,
              scaleY: 2,
              duration: 150,
            });
          },
        });
      },
    });

    // Phase 3: Spawn flex arms at 600ms
    this.scene.time.delayedCall(600, () => {
      if (!this.scene) return;

      const skinColor = this.sessionData.avatar?.skinTone
        ? parseInt(this.sessionData.avatar.skinTone.replace('#', ''), 16)
        : 0xffcc99;

      // Draw left arm (flex pose)
      const leftArm = this.scene.add.graphics();
      leftArm.lineStyle(4, skinColor, 1);
      // Upper arm: shoulder to elbow (going out and down)
      leftArm.beginPath();
      leftArm.moveTo(0, 0);
      leftArm.lineTo(-8, 6);
      leftArm.strokePath();
      // Forearm: elbow back up (classic flex)
      leftArm.beginPath();
      leftArm.moveTo(-8, 6);
      leftArm.lineTo(-6, -4);
      leftArm.strokePath();
      // Bicep bump
      leftArm.fillStyle(skinColor, 1);
      leftArm.fillCircle(-9, 2, 3);
      leftArm.setPosition(-14, -4);
      leftArm.setScale(0);
      leftArm.setDepth(this.depth + 1);
      this.add(leftArm);

      // Draw right arm (mirrored)
      const rightArm = this.scene.add.graphics();
      rightArm.lineStyle(4, skinColor, 1);
      rightArm.beginPath();
      rightArm.moveTo(0, 0);
      rightArm.lineTo(8, 6);
      rightArm.strokePath();
      rightArm.beginPath();
      rightArm.moveTo(8, 6);
      rightArm.lineTo(6, -4);
      rightArm.strokePath();
      rightArm.fillStyle(skinColor, 1);
      rightArm.fillCircle(9, 2, 3);
      rightArm.setPosition(14, -4);
      rightArm.setScale(0);
      rightArm.setDepth(this.depth + 1);
      this.add(rightArm);

      // Arms appear
      this.scene.tweens.add({
        targets: [leftArm, rightArm],
        scaleX: 1,
        scaleY: 1,
        duration: 200,
        ease: 'Back.easeOut',
      });

      // Phase 4: Flex pump animation
      this.scene.tweens.add({
        targets: [leftArm, rightArm],
        scaleX: 1.15,
        scaleY: 1.15,
        duration: 250,
        yoyo: true,
        repeat: 4,
        delay: 200,
        ease: 'Sine.easeInOut',
      });

      // Sprite bounce synced with pumps
      this.scene.tweens.add({
        targets: this.sprite,
        y: this.sprite.y - 2,
        duration: 250,
        yoyo: true,
        repeat: 4,
        delay: 200,
        ease: 'Sine.easeInOut',
      });

      // Golden sparkles at bicep positions
      for (let i = 0; i < 3; i++) {
        this.scene.time.delayedCall(300 + i * 300, () => {
          if (!this.scene) return;
          for (let j = 0; j < 3; j++) {
            const side = j % 2 === 0 ? -1 : 1;
            const color = j % 2 === 0 ? 0xffd700 : 0xffff00;
            const spark = this.scene.add.circle(
              this.x + side * 18 + Phaser.Math.Between(-3, 3),
              this.y - 6 + Phaser.Math.Between(-3, 3),
              2, color, 0.9,
            ).setDepth(this.depth + 2);

            this.scene.tweens.add({
              targets: spark,
              x: spark.x + Phaser.Math.Between(-10, 10),
              y: spark.y - Phaser.Math.Between(10, 15),
              alpha: 0,
              duration: Phaser.Math.Between(300, 500),
              ease: 'Power2',
              onComplete: () => spark.destroy(),
            });
          }
        });
      }

      // Floating "GAINS" text
      this.scene.time.delayedCall(500, () => {
        if (!this.scene) return;
        const gains = this.scene.add.text(
          this.x, this.y - 35,
          'GAINS',
          {
            fontFamily: 'monospace',
            fontSize: '9px',
            color: '#ffd700',
            fontStyle: 'bold',
          },
        ).setOrigin(0.5).setDepth(this.depth + 1);

        this.scene.tweens.add({
          targets: gains,
          y: gains.y - 20,
          alpha: 0,
          duration: 800,
          ease: 'Power1',
          onComplete: () => gains.destroy(),
        });
      });

      // Phase 5: Arms shrink away
      this.scene.time.delayedCall(1200, () => {
        if (!this.scene) return;
        this.scene.tweens.add({
          targets: [leftArm, rightArm],
          scaleX: 0,
          scaleY: 0,
          duration: 200,
          ease: 'Power2',
          onComplete: () => {
            leftArm.destroy();
            rightArm.destroy();
          },
        });
      });
    });

    this.scene.time.delayedCall(2200, () => this.finishEmote());
  }

  private emoteRage() {
    this.showEmoteLabel('!@#$!');

    const origTint = this.sprite.tintTopLeft;

    // Phase 1: Escalating shake
    // Mild shake (0-500ms)
    for (let i = 0; i < 6; i++) {
      this.scene.time.delayedCall(i * 80, () => {
        if (!this.scene) return;
        this.sprite.x = (i % 2 === 0 ? 2 : -2);
      });
    }
    // Medium shake (500-1000ms)
    for (let i = 0; i < 8; i++) {
      this.scene.time.delayedCall(500 + i * 60, () => {
        if (!this.scene) return;
        this.sprite.x = (i % 2 === 0 ? 4 : -4);
      });
    }
    // Heavy shake (1000-1400ms)
    for (let i = 0; i < 10; i++) {
      this.scene.time.delayedCall(1000 + i * 40, () => {
        if (!this.scene) return;
        this.sprite.x = (i % 2 === 0 ? 6 : -6);
      });
    }

    // Red flash at 400ms and 800ms
    const flashRed = (delay: number) => {
      this.scene.time.delayedCall(delay, () => {
        if (!this.scene) return;
        this.sprite.setTint(0xff0000);
        this.scene.time.delayedCall(100, () => {
          if (!this.scene) return;
          if (origTint && origTint !== 0xffffff) {
            this.sprite.setTint(origTint);
          } else {
            this.sprite.clearTint();
          }
        });
      });
    };
    flashRed(400);
    flashRed(800);

    // Red steam particles
    for (let i = 0; i < 6; i++) {
      this.scene.time.delayedCall(i * 200, () => {
        if (!this.scene) return;
        for (let j = 0; j < 2 + (i % 2); j++) {
          const color = j % 2 === 0 ? 0xff3300 : 0xff6600;
          const steam = this.scene.add.circle(
            this.x + Phaser.Math.Between(-6, 6),
            this.y - 18,
            Phaser.Math.Between(2, 3), color, 0.6,
          ).setDepth(this.depth + 1);

          this.scene.tweens.add({
            targets: steam,
            y: steam.y - Phaser.Math.Between(15, 25),
            x: steam.x + Phaser.Math.Between(-5, 5),
            alpha: 0,
            scaleX: 1.5,
            scaleY: 1.5,
            duration: Phaser.Math.Between(400, 600),
            ease: 'Power1',
            onComplete: () => steam.destroy(),
          });
        }
      });
    }

    // Floating grawlix characters
    const grawlix = ['!', '@', '#', '$', '%'];
    for (let i = 0; i < grawlix.length; i++) {
      this.scene.time.delayedCall(i * 250, () => {
        if (!this.scene) return;
        const g = this.scene.add.text(
          this.x + Phaser.Math.Between(-12, 12),
          this.y - 22,
          grawlix[i],
          {
            fontFamily: 'monospace',
            fontSize: i % 2 === 0 ? '12px' : '10px',
            color: i % 2 === 0 ? '#ff3333' : '#ff6633',
            fontStyle: 'bold',
          },
        ).setOrigin(0.5).setDepth(this.depth + 1);

        this.scene.tweens.add({
          targets: g,
          y: g.y - Phaser.Math.Between(25, 40),
          x: g.x + Phaser.Math.Between(-15, 15),
          alpha: 0,
          duration: Phaser.Math.Between(500, 800),
          ease: 'Power1',
          onComplete: () => g.destroy(),
        });
      });
    }

    // Phase 2: Final stomp at 1400ms
    this.scene.time.delayedCall(1400, () => {
      if (!this.scene) return;
      this.sprite.x = 0; // reset shake position

      // Stomp down
      this.scene.tweens.add({
        targets: this.sprite,
        y: this.sprite.y + 3,
        duration: 60,
        yoyo: true,
        ease: 'Power2',
      });

      // Squash
      this.scene.tweens.add({
        targets: this.sprite,
        scaleY: 1.5,
        scaleX: 2.5,
        duration: 80,
        yoyo: true,
        ease: 'Power1',
      });

      // Dust puffs
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
    });

    this.scene.time.delayedCall(2000, () => this.finishEmote());
  }

  private emoteFart() {
    this.showEmoteLabel('...');

    // Small flinch
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.sprite.y - 2,
      duration: 100,
      yoyo: true,
      ease: 'Power1',
    });

    // Slight lean forward
    this.scene.tweens.add({
      targets: this.sprite,
      angle: -3,
      duration: 150,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });

    // Gas cloud - expanding circles that drift outward and fade
    const gasColors = [0x88aa44, 0x669933, 0x887744, 0x779933, 0x998855];
    for (let i = 0; i < 8; i++) {
      this.scene.time.delayedCall(100 + i * 120, () => {
        if (!this.scene) return;
        const color = gasColors[i % gasColors.length];
        const cloud = this.scene.add.circle(
          this.x + Phaser.Math.Between(-4, 4),
          this.y + Phaser.Math.Between(-2, 4),
          Phaser.Math.Between(2, 4), color, 0.5,
        ).setDepth(this.depth + 1);

        this.scene.tweens.add({
          targets: cloud,
          x: cloud.x + Phaser.Math.Between(-25, 25),
          y: cloud.y + Phaser.Math.Between(-20, 10),
          scaleX: Phaser.Math.FloatBetween(2.5, 4),
          scaleY: Phaser.Math.FloatBetween(2.5, 4),
          alpha: 0,
          duration: Phaser.Math.Between(1000, 1500),
          ease: 'Power1',
          onComplete: () => cloud.destroy(),
        });
      });
    }

    // Wavy stink lines
    for (let i = 0; i < 3; i++) {
      this.scene.time.delayedCall(300 + i * 200, () => {
        if (!this.scene) return;
        const line = this.scene.add.text(
          this.x + Phaser.Math.Between(-8, 8),
          this.y - 2,
          '~',
          { fontFamily: 'monospace', fontSize: '10px', color: '#88aa44' },
        ).setOrigin(0.5).setDepth(this.depth + 1);

        this.scene.tweens.add({
          targets: line,
          y: line.y - Phaser.Math.Between(20, 35),
          x: line.x + Phaser.Math.Between(-10, 10),
          alpha: 0,
          duration: Phaser.Math.Between(800, 1200),
          ease: 'Power1',
          onComplete: () => line.destroy(),
        });
      });
    }

    this.scene.time.delayedCall(2000, () => this.finishEmote());
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

    // Permanent zombie look: dark sickly green tint, toxic glow, zombie nametag
    this.sprite.setTint(0x448833);
    this.neonGlow.setFillStyle(0x33ff00, 0.4);
    this.neonGlow.setScale(1.5, 1);
    this.nametag.setColor('#33ff00');
    this.nametag.setBackgroundColor('rgba(0, 20, 0, 0.9)');
    this.nametag.setText(`☠ ${this.computeLabel(this.sessionData)} ☠`);

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

      // Continuous zombie effects: stagger + glow pulse + green drip particles
      this.zombieStaggerTimer = this.scene.time.addEvent({
        delay: 1500,
        loop: true,
        callback: () => {
          if (!this.scene || !this.sprite) return;

          // Stagger tilt
          this.scene.tweens.add({
            targets: this.sprite,
            angle: Phaser.Math.Between(-6, 6),
            duration: 300,
            yoyo: true,
            ease: 'Sine.easeInOut',
          });

          // Pulsing toxic glow
          this.scene.tweens.add({
            targets: this.neonGlow,
            alpha: 0.6,
            duration: 400,
            yoyo: true,
            ease: 'Sine.easeInOut',
          });

          // Green drip particle
          const drip = this.scene.add.circle(
            this.x + Phaser.Math.Between(-4, 4),
            this.y + Phaser.Math.Between(-8, 0),
            Phaser.Math.Between(1, 2),
            0x33ff00,
            0.7,
          ).setDepth(this.depth + 1);

          this.scene.tweens.add({
            targets: drip,
            y: drip.y + Phaser.Math.Between(8, 16),
            alpha: 0,
            duration: Phaser.Math.Between(500, 900),
            ease: 'Power2',
            onComplete: () => drip.destroy(),
          });
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

    // Handle question bubble for waiting state (permission requests)
    if (activity === 'waiting') {
      this.statusIcon?.setVisible(false);
      this.hideThoughtBubble();
      this.hidePlanningClipboard();
      this.showQuestionBubble();
      this.neonGlow.setAlpha(0.3);
      return;
    } else {
      this.hideQuestionBubble();
    }

    // Handle clipboard for planning state
    if (activity === 'planning') {
      this.statusIcon?.setVisible(false);
      this.hideThoughtBubble();
      this.showPlanningClipboard();
      this.neonGlow.setAlpha(0.35);
      return;
    } else {
      this.hidePlanningClipboard();
    }

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

  private showQuestionBubble() {
    if (this.questionBubble) return;

    this.questionBubble = this.scene.add.container(12, -20);

    // Speech bubble background
    const bubble = this.scene.add.graphics();
    bubble.fillStyle(0xffffff, 0.9);
    bubble.fillRoundedRect(-8, -6, 16, 12, 4);
    this.questionBubble.add(bubble);

    // Big question mark
    const qMark = this.scene.add.text(0, 0, '?', {
      fontSize: '10px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: '#444466',
    }).setOrigin(0.5, 0.5);
    this.questionBubble.add(qMark);

    // Small tail dot
    const tail = this.scene.add.circle(-6, 8, 1.5, 0xffffff, 0.7);
    this.questionBubble.add(tail);

    this.add(this.questionBubble);

    // Gentle pulse on the question mark
    this.scene.tweens.add({
      targets: qMark,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private hideQuestionBubble() {
    if (!this.questionBubble) return;
    this.questionBubble.destroy();
    this.questionBubble = null;
  }

  private showPlanningClipboard() {
    if (this.planningClipboard) return;

    this.planningClipboard = this.scene.add.container(12, -22);

    const gfx = this.scene.add.graphics();

    // Clipboard body
    gfx.fillStyle(0xffffff, 0.92);
    gfx.fillRoundedRect(-7, -3, 14, 16, 2);

    // Clip tab at top
    gfx.fillStyle(0xaaaacc, 1);
    gfx.fillRect(-3, -6, 6, 4);
    gfx.fillStyle(0x8888aa, 1);
    gfx.fillRect(-2, -5, 4, 2);

    this.planningClipboard.add(gfx);

    // Three checklist rows: small dot + line
    const rows = [0, 4, 8];
    const checkDots: Phaser.GameObjects.Circle[] = [];
    const lines: Phaser.GameObjects.Rectangle[] = [];

    for (const rowY of rows) {
      const dot = this.scene.add.circle(-3, rowY, 1.2, 0xcccccc);
      const line = this.scene.add.rectangle(2, rowY, 6, 1.2, 0xdddddd);
      this.planningClipboard.add(dot);
      this.planningClipboard.add(line);
      checkDots.push(dot);
      lines.push(line);
    }

    // Tail dot
    const tail = this.scene.add.circle(-6, 16, 1.5, 0xffffff, 0.7);
    this.planningClipboard.add(tail);

    this.add(this.planningClipboard);

    // Animate rows filling in sequentially, then reset
    const animateRow = (index: number) => {
      if (!this.planningClipboard) return;
      const dot = checkDots[index];
      const line = lines[index];

      // Check dot turns green
      this.scene.tweens.add({
        targets: dot,
        fillColor: { from: 0xcccccc, to: 0x44bb66 },
        duration: 1,
        onComplete: () => {
          dot.setFillStyle(0x44bb66);
        },
      });

      // Line fills in darker
      this.scene.tweens.add({
        targets: line,
        fillColor: { from: 0xdddddd, to: 0x8888aa },
        duration: 1,
        onComplete: () => {
          line.setFillStyle(0x8888aa);
        },
      });
    };

    // Stagger row animations, loop every 3 seconds
    const cycleClipboard = () => {
      if (!this.planningClipboard) return;

      // Reset all rows
      for (let i = 0; i < 3; i++) {
        checkDots[i].setFillStyle(0xcccccc);
        lines[i].setFillStyle(0xdddddd);
      }

      // Fill in one by one
      this.scene.time.delayedCall(400, () => animateRow(0));
      this.scene.time.delayedCall(900, () => animateRow(1));
      this.scene.time.delayedCall(1400, () => animateRow(2));

      // Repeat the cycle
      this.scene.time.delayedCall(2800, () => cycleClipboard());
    };

    cycleClipboard();
  }

  private hidePlanningClipboard() {
    if (!this.planningClipboard) return;
    this.planningClipboard.destroy();
    this.planningClipboard = null;
  }

  private computeLabel(session: AgentSession): string {
    if (session.sessionName) {
      return session.sessionName.length > 16
        ? session.sessionName.slice(0, 14) + '..'
        : session.sessionName;
    }
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

    const taskEl = tooltip.querySelector('.tooltip-task') as HTMLElement;
    const promptEl = tooltip.querySelector('.tooltip-prompt') as HTMLElement;

    if (taskEl) {
      if (this.sessionData.taskDescription) {
        taskEl.textContent = `Task: ${this.sessionData.taskDescription}`;
        taskEl.style.display = 'block';
      } else {
        taskEl.style.display = 'none';
      }
    }

    if (promptEl) {
      promptEl.style.display = 'none';
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
