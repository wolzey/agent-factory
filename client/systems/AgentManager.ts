import Phaser from 'phaser';
import type { AgentSession, EffectType, EnvironmentType } from '@shared/types';
import { TOMBSTONE_DURATION_MS } from '@shared/constants';
import { AgentSprite } from '../entities/AgentSprite';
import { SubagentSprite } from '../entities/SubagentSprite';
import { Machine } from '../entities/Machine';
import { LayoutManager } from './LayoutManager';
import { getTheme } from '../environments';
import type { EnvironmentTheme } from '../environments';

export class AgentManager {
  private scene: Phaser.Scene;
  private agents = new Map<string, AgentSprite>();
  private subagents = new Map<string, SubagentSprite>();
  private machines: Machine[] = [];
  private layout: LayoutManager;
  private serverGraphicDeath = false;
  private theme: EnvironmentTheme;
  private tombstones = new Map<string, { container: Phaser.GameObjects.Container; x: number; y: number }>();
  private flowerVisitors = new Map<string, string>(); // agentId → deadSessionId they're visiting
  private flowersDone = new Map<string, Set<string>>(); // deadSessionId → set of agentIds who already placed flowers
  private zombieRising = new Set<string>(); // agents currently rising from grave (skip routing)
  private lastFlowerCheck = 0; // timestamp of last periodic flower check
  private vortexActive = false;
  private vortexCenter = { x: 400, y: 240 };
  private vortexStartTime = 0;
  private vortexDuration = 15000;
  private vortexVisuals: Phaser.GameObjects.GameObject[] = [];
  private preVortexPositions = new Map<string, { x: number; y: number }>();

  constructor(scene: Phaser.Scene, envType: EnvironmentType = 'arcade') {
    this.scene = scene;
    this.theme = getTheme(envType);
    this.layout = new LayoutManager();
    this.createMachines();
  }

  private createMachines() {
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 6; col++) {
        const x = 80 + col * 120;
        const slotY = 110 + row * 110;
        const machine = new Machine(this.scene, x, slotY - 24, row * 6 + col, this.theme.workstation);
        this.machines.push(machine);
      }
    }
  }

  setServerGraphicDeath(enabled: boolean) {
    this.serverGraphicDeath = enabled;
  }

  handleFullState(agents: AgentSession[]) {
    // Remove agents not in new state
    const newIds = new Set(agents.map(a => a.sessionId));
    for (const [id, sprite] of this.agents) {
      if (!newIds.has(id)) {
        this.removeAgent(id);
      }
    }

    // Add or update agents
    for (const session of agents) {
      this.upsertAgent(session);
    }

    this.updateHud();
  }

  handleAgentUpdate(session: AgentSession) {
    this.upsertAgent(session);
    this.updateHud();
  }

  handleAgentRemove(sessionId: string) {
    this.removeAgent(sessionId);
    this.updateHud();
  }

  handleEffect(sessionId: string, effect: EffectType, data?: Record<string, unknown>) {
    const agent = this.agents.get(sessionId);
    if (!agent) return;

    switch (effect) {
      case 'tool_start':
        this.emitSparks(agent.x, agent.y, 0xff00ff);
        this.animateCoin(sessionId, agent);
        break;
      case 'tool_complete':
        this.emitSparks(agent.x, agent.y, 0x00ff66);
        break;
      case 'session_start':
        this.emitSparks(agent.x, agent.y, 0x00ffff, 12);
        break;
      case 'session_end':
        this.emitSparks(agent.x, agent.y, 0xff0044, 8);
        break;
      case 'subagent_spawn':
        this.emitSparks(agent.x, agent.y, 0xaa00ff, 10);
        break;
      case 'subagent_despawn':
        this.emitSparks(agent.x, agent.y, 0xaa88ff, 6);
        break;
      case 'error':
        this.emitSparks(agent.x, agent.y, 0xff0000, 8);
        agent.recoil();
        this.triggerMachineError(sessionId);
        break;
      case 'prompt_received':
        this.emitSparks(agent.x, agent.y, 0x00ffff, 10);
        break;
      case 'task_completed':
        this.emitSparks(agent.x, agent.y, 0x00ff66, 15);
        agent.showFloatingLabel('DONE!', '#00ff66');
        break;
      case 'notification':
        this.emitSparks(agent.x, agent.y, 0xffdd00, 6);
        if (data?.message) agent.showFloatingLabel(String(data.message).slice(0, 20), '#ffdd00');
        break;
      case 'info_flash': {
        const colorMap: Record<string, number> = {
          instructions: 0x8888ff, config: 0xffaa44,
          cwd: 0x44ffaa, file_changed: 0xaaaaaa,
        };
        const countMap: Record<string, number> = {
          instructions: 4, config: 3, cwd: 4, file_changed: 3,
        };
        const t = String(data?.type || 'default');
        this.emitSparks(agent.x, agent.y, colorMap[t] || 0xaaaaaa, countMap[t] || 3);
        break;
      }
      case 'compact':
        this.emitSparks(agent.x, agent.y, data?.phase === 'post' ? 0xaa44ff : 0xcc66ff, data?.phase === 'post' ? 6 : 8);
        break;
      case 'worktree_create':
        this.emitSparks(agent.x, agent.y, 0x00ccff, 10);
        break;
      case 'worktree_remove':
        this.emitSparks(agent.x, agent.y, 0xff8844, 6);
        break;
      case 'elicitation':
        this.emitSparks(agent.x, agent.y, 0xffaa00, 6);
        break;
      case 'emote':
        if (data?.emote) {
          agent.playEmote(data.emote as string);
          if (data.emote === 'gun') {
            for (const [otherId, other] of this.agents) {
              if (otherId === sessionId) continue;
              if (other.x > agent.x && other.x - agent.x < 200) {
                this.scene.time.delayedCall(300, () => other.playGunDeath());
              }
            }
          }
          if (data.emote === 'fart') {
            for (const [otherId, other] of this.agents) {
              if (otherId === sessionId) continue;
              const dx = agent.x - other.x;
              const dy = agent.y - other.y;
              if (Math.sqrt(dx * dx + dy * dy) < 150) {
                this.scene.time.delayedCall(500, () => other.playEmote('dizzy'));
              }
            }
          }
        }
        break;
      case 'commit':
        this.emitConfetti(agent.x, agent.y, 35);
        agent.showFloatingLabel('COMMIT!', '#ffcc00');
        break;
      case 'pr_merge':
        this.emitConfetti(agent.x, agent.y, 60);
        this.showTrophy(agent);
        agent.showFloatingLabel('MERGED!', '#ffcc00');
        agent.playEmote('dance');
        break;
    }
  }

  update(time: number, delta: number) {
    // Vortex swirl physics
    if (this.vortexActive) {
      const elapsed = time - this.vortexStartTime;
      if (elapsed > this.vortexDuration) {
        this.endVortex();
      } else {
        this.updateVortexSwirl(time, elapsed);
      }
    }

    for (const agent of this.agents.values()) {
      if (!this.vortexActive) {
        agent.update(time, delta);
      }
      // Y-based depth: entities further down screen render on top
      agent.setDepth(7 + agent.y * 0.001);
    }
    for (const sub of this.subagents.values()) {
      const parent = this.agents.get(sub.parentSessionId);
      if (parent) {
        sub.setParentPosition(parent.x, parent.y);
      }
      sub.update(time, delta);
      sub.setDepth(7 + sub.y * 0.001);
    }
    // Machines also need Y-based depth
    for (const machine of this.machines) {
      machine.setDepth(6 + machine.y * 0.001);
    }

    // Periodically check if idle agents should visit tombstones (every 8s)
    if (this.tombstones.size > 0 && time - this.lastFlowerCheck > 8000) {
      this.lastFlowerCheck = time;
      this.checkFlowerVisits();
    }
  }

  private upsertAgent(session: AgentSession) {
    // Clear flower visitor status — agent got a real update, stop mourning
    this.flowerVisitors.delete(session.sessionId);

    let agent = this.agents.get(session.sessionId);

    if (!agent) {
      agent = new AgentSprite(this.scene, session);
      const tomb = this.tombstones.get(session.sessionId);
      if (tomb) {
        // Zombie resurrection from tombstone
        agent.riseFromGrave(tomb.x, tomb.y, tomb.container);
        this.tombstones.delete(session.sessionId);
        this.flowersDone.delete(session.sessionId);
        // Claim the tombstone's arcade slot so the zombie keeps its original position
        this.layout.claimTombstoneSlot(session.sessionId);

        // Send flower visitors home — tombstone is gone
        this.cancelFlowerVisitors(session.sessionId);

        // Prevent routing until rise animation finishes (~3s)
        this.zombieRising.add(session.sessionId);
        this.scene.time.delayedCall(3000, () => {
          this.zombieRising.delete(session.sessionId);
        });
      } else {
        // New agent - spawn at entrance with a random animation
        const entrance = this.layout.entrance;
        agent.setPosition(entrance.x, entrance.y);
        agent.playSpawnAnimation();
      }
      this.agents.set(session.sessionId, agent);
    }

    agent.updateSession(session);

    // Skip routing while zombie is rising from grave
    if (this.zombieRising.has(session.sessionId)) {
      this.syncSubagents(session);
      return;
    }

    // Route agent to the right area based on activity:
    //   working (reading/writing/running/searching/chatting/planning) -> arcade cabinet
    //   thinking (between tool calls) -> stay at arcade cabinet (thought bubble shown by AgentSprite)
    //   waiting (waiting for user prompt) -> front counter
    //   idle (session started, no activity yet) -> lounge
    //   stopped -> die in place (slot kept for tombstone, removeAgent handles release)

    const workingStates = ['reading', 'writing', 'running', 'searching', 'chatting', 'planning', 'compacting'];
    const isWorking = workingStates.includes(session.activity);
    const isThinking = session.activity === 'thinking';

    if (session.activity === 'stopped') {
      // Don't release the arcade slot here — removeAgent will reserve it for the tombstone
      this.deactivateMachineFor(session.sessionId);
      // Die in place — no walking to exit
    } else if (isWorking || isThinking) {
      // Working or thinking -> arcade cabinet
      const pos = this.layout.assignToArcade(session.sessionId);
      const target = { x: pos.x, y: pos.y + 24 };
      // Non-zombie agents must not work at a tombstone-occupied slot
      if (!agent.isZombie && this.isNearTombstone(target.x, target.y)) {
        // Release and reassign to a different slot
        this.layout.release(session.sessionId);
        const altPos = this.layout.assignToArcade(session.sessionId);
        agent.moveTo(altPos.x, altPos.y + 24);
      } else {
        agent.moveTo(target.x, target.y);
      }
      this.activateMachineFor(session.sessionId);
      this.updateHeatFor(session.sessionId, session.toolUseCount ?? 0);
    } else if (session.activity === 'waiting') {
      // Waiting for user prompt -> front counter
      this.resetHeatFor(session.sessionId);
      this.deactivateMachineFor(session.sessionId);
      this.layout.release(session.sessionId);
      const pos = this.layout.assignToCounter(session.sessionId);
      // If position overlaps a tombstone, offset away
      if (!agent.isZombie && this.isNearTombstone(pos.x, pos.y)) {
        agent.moveTo(pos.x + 30, pos.y);
      } else {
        agent.moveTo(pos.x, pos.y);
      }
    } else {
      // idle / fallback -> lounge
      this.layout.release(session.sessionId);
      this.resetHeatFor(session.sessionId);
      this.deactivateMachineFor(session.sessionId);
      const pos = this.layout.assignToLounge(session.sessionId);
      // If position overlaps a tombstone, offset away
      if (!agent.isZombie && this.isNearTombstone(pos.x, pos.y)) {
        agent.moveTo(pos.x + 30, pos.y);
      } else {
        agent.moveTo(pos.x, pos.y);
      }
    }

    // Sync subagents
    this.syncSubagents(session);
  }

  /** Check if a position is within proximity of any active tombstone. */
  private isNearTombstone(x: number, y: number, threshold = 40): boolean {
    for (const tomb of this.tombstones.values()) {
      const dx = x - tomb.x;
      const dy = y - tomb.y;
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
        return true;
      }
    }
    return false;
  }

  private removeAgent(sessionId: string) {
    const agent = this.agents.get(sessionId);
    if (agent) {
      // Deactivate machine while slot still has the agent's sessionId
      this.deactivateMachineFor(sessionId);
      // Reserve the workstation slot for the tombstone (changes occupant to __tomb__ prefix)
      this.layout.reserveForTombstone(sessionId);
      // Release any non-arcade slots (counter/lounge) the agent may hold
      this.layout.release(sessionId);

      agent.die(() => {
        const tombData = agent.spawnTombstone();
        this.tombstones.set(sessionId, tombData);

        // The periodic checkFlowerVisits() in update() will send idle agents over

        // Remove tombstone + free workstation slot after it expires
        this.scene.time.delayedCall(TOMBSTONE_DURATION_MS, () => {
          this.tombstones.delete(sessionId);
          this.flowersDone.delete(sessionId);
          this.layout.releaseTombstone(sessionId);
        });
      }, this.serverGraphicDeath);
      this.agents.delete(sessionId);
    } else {
      this.layout.release(sessionId);
      this.deactivateMachineFor(sessionId);
    }

    // Remove associated subagents
    for (const [key, sub] of this.subagents) {
      if (sub.parentSessionId === sessionId) {
        sub.despawn();
        this.subagents.delete(key);
      }
    }
  }

  private syncSubagents(session: AgentSession) {
    const existing = new Set<string>();
    const totalSiblings = session.subagents.length;
    const parentAgent = this.agents.get(session.sessionId);
    const parentIsZombie = parentAgent?.isZombie ?? false;

    // Add new subagents
    for (let i = 0; i < session.subagents.length; i++) {
      const info = session.subagents[i];
      const key = `${session.sessionId}:${info.agentId}`;
      existing.add(key);

      if (!this.subagents.has(key)) {
        const sub = new SubagentSprite(
          this.scene,
          info,
          session.sessionId,
          session.avatar?.spriteIndex ?? 0,
          i,
          totalSiblings,
          parentIsZombie,
        );
        const agent = this.agents.get(session.sessionId);
        if (agent) {
          sub.setParentPosition(agent.x, agent.y);
        }
        this.subagents.set(key, sub);
      }
    }

    // Remove old subagents
    for (const [key, sub] of this.subagents) {
      if (sub.parentSessionId === session.sessionId && !existing.has(key)) {
        sub.despawn();
        this.subagents.delete(key);
      }
    }
  }

  private activateMachineFor(sessionId: string) {
    const slot = this.layout.getArcadeSlotFor(sessionId);
    if (slot) {
      const machine = this.machines.find(
        m => Math.abs(m.x - slot.pos.x) < 15 && Math.abs(m.y - (slot.pos.y - 24)) < 15,
      );
      machine?.setActive(true);
    }
  }

  private deactivateMachineFor(sessionId: string) {
    const slot = this.layout.getArcadeSlotFor(sessionId);
    if (slot) {
      const machine = this.machines.find(
        m => Math.abs(m.x - slot.pos.x) < 15 && Math.abs(m.y - (slot.pos.y - 24)) < 15,
      );
      machine?.setActive(false);
    }
  }

  // ── Deeper Claude Integrations ──────────────────────────────────

  /** Find the machine an agent is assigned to */
  private getMachineFor(sessionId: string): Machine | undefined {
    const slot = this.layout.getArcadeSlotFor(sessionId);
    if (!slot) return undefined;
    return this.machines.find(
      m => Math.abs(m.x - slot.pos.x) < 15 && Math.abs(m.y - (slot.pos.y - 24)) < 15,
    );
  }

  /** Trigger sparkAndSmoke on the agent's machine */
  private triggerMachineError(sessionId: string) {
    this.getMachineFor(sessionId)?.sparkAndSmoke();
  }

  /** Animate a coin arcing from agent into their machine */
  private animateCoin(sessionId: string, agent: AgentSprite) {
    const machine = this.getMachineFor(sessionId);
    if (!machine) return;

    const coin = this.scene.add.image(agent.x, agent.y - 20, 'coin')
      .setScale(1.2).setDepth(11);

    const targetX = machine.x;
    const targetY = machine.y - 15;
    const midY = Math.min(agent.y - 20, targetY) - 25;

    // Arc upward
    this.scene.tweens.add({
      targets: coin,
      x: (agent.x + targetX) / 2,
      y: midY,
      angle: 180,
      duration: 300,
      ease: 'Sine.easeOut',
      onComplete: () => {
        // Arc downward into machine
        this.scene.tweens.add({
          targets: coin,
          x: targetX,
          y: targetY,
          angle: 360,
          scaleX: 0.6,
          scaleY: 0.6,
          duration: 300,
          ease: 'Sine.easeIn',
          onComplete: () => {
            coin.destroy();
            // Small yellow flash at machine
            const flash = this.scene.add.circle(targetX, targetY, 6, 0xffcc00, 0.6).setDepth(10);
            this.scene.tweens.add({
              targets: flash,
              alpha: 0, scaleX: 2.5, scaleY: 2.5,
              duration: 250, onComplete: () => flash.destroy(),
            });
          },
        });
      },
    });
  }

  /** Burst confetti particles from a position */
  private emitConfetti(x: number, y: number, count: number) {
    const colors = [0xffcc00, 0x00ff66, 0x4488ff, 0xff00ff, 0x00ffff, 0xffffff, 0xff4444, 0xffaa00];

    for (let i = 0; i < count; i++) {
      const piece = this.scene.add.image(
        x + Phaser.Math.Between(-8, 8),
        y - 10,
        'confetti',
      ).setTint(colors[Phaser.Math.Between(0, colors.length - 1)])
        .setScale(Phaser.Math.FloatBetween(0.8, 1.5))
        .setAngle(Phaser.Math.Between(0, 360))
        .setDepth(11);

      const targetX = x + Phaser.Math.Between(-60, 60);
      const peakY = y - Phaser.Math.Between(40, 80);
      const landY = y + Phaser.Math.Between(10, 40);

      // Rise
      this.scene.tweens.add({
        targets: piece,
        x: (x + targetX) / 2 + Phaser.Math.Between(-15, 15),
        y: peakY,
        angle: piece.angle + Phaser.Math.Between(-180, 180),
        duration: Phaser.Math.Between(300, 500),
        ease: 'Sine.easeOut',
        onComplete: () => {
          // Fall with gravity
          this.scene.tweens.add({
            targets: piece,
            x: targetX,
            y: landY,
            angle: piece.angle + Phaser.Math.Between(-360, 360),
            alpha: 0,
            duration: Phaser.Math.Between(800, 1400),
            ease: 'Sine.easeIn',
            onComplete: () => piece.destroy(),
          });
        },
      });
    }
  }

  /** Show a trophy above agent that bobs and fades */
  private showTrophy(agent: AgentSprite) {
    const trophy = this.scene.add.image(agent.x, agent.y - 40, 'trophy')
      .setScale(1.8).setAlpha(0).setDepth(11);

    // Golden glow under agent
    const glow = this.scene.add.circle(agent.x, agent.y + 5, 20, 0xffcc00, 0)
      .setDepth(7);
    this.scene.tweens.add({
      targets: glow,
      alpha: { from: 0, to: 0.3 },
      scaleX: { from: 0.5, to: 1.5 },
      scaleY: { from: 0.5, to: 0.8 },
      duration: 600,
      yoyo: true,
      hold: 1500,
      onComplete: () => glow.destroy(),
    });

    // Trophy appears and bobs
    this.scene.tweens.add({
      targets: trophy,
      alpha: 1,
      y: agent.y - 50,
      duration: 400,
      ease: 'Back.easeOut',
      onComplete: () => {
        // Bob up and down
        this.scene.tweens.add({
          targets: trophy,
          y: trophy.y - 5,
          duration: 400,
          yoyo: true,
          repeat: 3,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            // Fade out
            this.scene.tweens.add({
              targets: trophy,
              alpha: 0, y: trophy.y - 15,
              duration: 500,
              onComplete: () => trophy.destroy(),
            });
          },
        });
      },
    });
  }

  /** Update heat overlay on the machine for a given session */
  private updateHeatFor(sessionId: string, toolUseCount: number) {
    const machine = this.getMachineFor(sessionId);
    if (!machine) return;
    const intensity = Math.min(toolUseCount / 20, 1.0);
    machine.setHeat(intensity);
  }

  /** Reset heat overlay when agent leaves machine */
  private resetHeatFor(sessionId: string) {
    const machine = this.getMachineFor(sessionId);
    if (machine) machine.setHeat(0);
  }

  // ── Vortex ──────────────────────────────────────────────────────

  triggerVortex() {
    if (this.vortexActive) return;
    this.vortexActive = true;
    this.vortexStartTime = this.scene.time.now;
    this.vortexCenter = { x: 400, y: 240 };

    for (const [id, agent] of this.agents) {
      this.preVortexPositions.set(id, { x: agent.x, y: agent.y });
    }

    this.createVortexVisuals();
  }

  private createVortexVisuals() {
    const cx = this.vortexCenter.x;
    const cy = this.vortexCenter.y;

    // Dark overlay
    const overlay = this.scene.add.rectangle(400, 240, 800, 480, 0x000000, 0.0).setDepth(900);
    this.scene.tweens.add({ targets: overlay, alpha: 0.5, duration: 3000, ease: 'Power2' });
    this.vortexVisuals.push(overlay);

    // 8 spinning ring layers
    const ringColors = [0x8844ff, 0x4488ff, 0xff44aa, 0x00ffff, 0xff00ff, 0xffaa00, 0xff0044, 0x44ff88];
    for (let i = 0; i < 8; i++) {
      const radius = 20 + i * 25;
      const ring = this.scene.add.circle(cx, cy, radius, ringColors[i], 0.0)
        .setStrokeStyle(4 - i * 0.3, ringColors[i], 0.85)
        .setDepth(901);
      this.vortexVisuals.push(ring);

      this.scene.tweens.add({
        targets: ring,
        scaleX: { from: 0, to: 1.2 },
        scaleY: { from: 0, to: 1.2 },
        duration: 600 + i * 100,
        ease: 'Back.easeOut',
        delay: i * 80,
      });

      this.scene.tweens.add({
        targets: ring,
        angle: i % 2 === 0 ? 360 : -360,
        duration: 4000 - i * 400,
        repeat: -1,
        ease: 'Linear',
      });

      this.scene.time.delayedCall(5000, () => {
        if (!this.vortexActive || !this.scene) return;
        this.scene.tweens.add({
          targets: ring,
          scaleX: 0.6 + i * 0.05,
          scaleY: 0.6 + i * 0.05,
          duration: 5000,
          ease: 'Power2',
        });
      });

      this.scene.tweens.add({
        targets: ring,
        alpha: { from: 0.2, to: 0.6 },
        duration: 600 + i * 100,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Central core
    const core = this.scene.add.circle(cx, cy, 20, 0xffffff, 0.0).setDepth(902);
    this.vortexVisuals.push(core);
    this.scene.tweens.add({
      targets: core,
      alpha: { from: 0, to: 1 },
      scaleX: { from: 0, to: 2 },
      scaleY: { from: 0, to: 2 },
      duration: 800,
      ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: core,
      scaleX: { from: 1.5, to: 2.5 },
      scaleY: { from: 1.5, to: 2.5 },
      alpha: { from: 0.7, to: 1.0 },
      duration: 400,
      yoyo: true,
      repeat: -1,
      delay: 800,
      ease: 'Sine.easeInOut',
    });

    // Multi-layered core glow
    for (const [color, size, alpha] of [
      [0x8844ff, 60, 0.2], [0xff00ff, 45, 0.15], [0x4488ff, 80, 0.1],
    ] as [number, number, number][]) {
      const glow = this.scene.add.circle(cx, cy, size, color, 0.0).setDepth(901);
      this.vortexVisuals.push(glow);
      this.scene.tweens.add({
        targets: glow,
        alpha: { from: 0, to: alpha },
        scaleX: { from: 0, to: 2.5 },
        scaleY: { from: 0, to: 2.5 },
        duration: 1000,
        ease: 'Power2',
      });
      this.scene.tweens.add({
        targets: glow,
        scaleX: { from: 2, to: 3.5 },
        scaleY: { from: 2, to: 3.5 },
        alpha: { from: alpha * 0.7, to: alpha * 1.3 },
        duration: 800,
        yoyo: true,
        repeat: -1,
        delay: 1000,
      });
    }

    // 6-arm spiral particle stream
    const spiralColors = [0x00ffff, 0xff00ff, 0x8844ff, 0x4488ff, 0xffff00, 0xff4488, 0xffffff, 0xffaa00];
    const spiralEvent = this.scene.time.addEvent({
      delay: 40,
      repeat: -1,
      callback: () => {
        if (!this.vortexActive || !this.scene) { spiralEvent.destroy(); return; }
        const elapsed = this.scene.time.now - this.vortexStartTime;
        const intensity = Math.min(elapsed / 4000, 1);
        const armCount = 3 + Math.floor(intensity * 3);

        for (let arm = 0; arm < armCount; arm++) {
          const baseAngle = (this.scene.time.now / (400 - intensity * 200)) + (arm * Math.PI * 2 / armCount);
          const r = Phaser.Math.Between(40, 250 + Math.floor(intensity * 100));
          const px = cx + Math.cos(baseAngle + r * 0.02) * r;
          const py = cy + Math.sin(baseAngle + r * 0.02) * r;
          const size = Phaser.Math.Between(1, 3 + Math.floor(intensity * 4));
          const p = this.scene.add.circle(px, py, size,
            spiralColors[Phaser.Math.Between(0, spiralColors.length - 1)], 0.9,
          ).setDepth(902);

          this.scene.tweens.add({
            targets: p,
            x: cx + Phaser.Math.Between(-5, 5),
            y: cy + Phaser.Math.Between(-5, 5),
            alpha: 0,
            scaleX: 0.1,
            scaleY: 0.1,
            duration: Phaser.Math.Between(400, 800),
            ease: 'Power3',
            onComplete: () => p.destroy(),
          });
        }
      },
    });

    // Branching lightning
    const boltEvent = this.scene.time.addEvent({
      delay: 200,
      repeat: -1,
      callback: () => {
        if (!this.vortexActive || !this.scene) { boltEvent.destroy(); return; }
        const elapsed = this.scene.time.now - this.vortexStartTime;
        const fury = Math.min(elapsed / 8000, 1);
        const boltCount = 1 + Math.floor(fury * 3);

        for (let b = 0; b < boltCount; b++) {
          const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
          const dist = Phaser.Math.Between(50, 220 + Math.floor(fury * 80));
          const bx = cx + Math.cos(angle) * dist;
          const by = cy + Math.sin(angle) * dist;

          const boltLen = Math.sqrt((bx - cx) ** 2 + (by - cy) ** 2);
          const bolt = this.scene.add.rectangle(
            (cx + bx) / 2, (cy + by) / 2,
            boltLen, 2 + fury * 3, 0xffffff, 0.95,
          ).setDepth(903).setAngle(Phaser.Math.RadToDeg(Math.atan2(by - cy, bx - cx)));

          this.scene.tweens.add({
            targets: bolt, alpha: 0, scaleY: 0.1,
            duration: 120, onComplete: () => bolt.destroy(),
          });

          if (fury > 0.3) {
            const branchAngle = angle + Phaser.Math.FloatBetween(-0.5, 0.5);
            const branchDist = dist * 0.5;
            const bbx = bx + Math.cos(branchAngle) * branchDist;
            const bby = by + Math.sin(branchAngle) * branchDist;
            const branch = this.scene.add.rectangle(
              (bx + bbx) / 2, (by + bby) / 2,
              branchDist, 1 + fury * 2, 0xaaddff, 0.8,
            ).setDepth(903).setAngle(Phaser.Math.RadToDeg(Math.atan2(bby - by, bbx - bx)));
            this.scene.tweens.add({
              targets: branch, alpha: 0, duration: 100,
              onComplete: () => branch.destroy(),
            });
          }

          const impact = this.scene.add.circle(bx, by, 6 + fury * 8, 0xffffff, 0.8).setDepth(903);
          this.scene.tweens.add({
            targets: impact, alpha: 0, scaleX: 4, scaleY: 4,
            duration: 200, onComplete: () => impact.destroy(),
          });
        }
      },
    });

    // Debris from screen edges
    const debrisEvent = this.scene.time.addEvent({
      delay: 150,
      repeat: -1,
      callback: () => {
        if (!this.vortexActive || !this.scene) { debrisEvent.destroy(); return; }
        const elapsed = this.scene.time.now - this.vortexStartTime;
        if (elapsed < 2000) return;

        const edge = Phaser.Math.Between(0, 3);
        let dx: number, dy: number;
        switch (edge) {
          case 0: dx = Phaser.Math.Between(0, 800); dy = 0; break;
          case 1: dx = 800; dy = Phaser.Math.Between(0, 480); break;
          case 2: dx = Phaser.Math.Between(0, 800); dy = 480; break;
          default: dx = 0; dy = Phaser.Math.Between(0, 480); break;
        }
        const chunk = this.scene.add.rectangle(dx, dy,
          Phaser.Math.Between(4, 12), Phaser.Math.Between(3, 8),
          spiralColors[Phaser.Math.Between(0, spiralColors.length - 1)], 0.7,
        ).setDepth(901).setAngle(Phaser.Math.Between(0, 360));

        this.scene.tweens.add({
          targets: chunk,
          x: cx + Phaser.Math.Between(-15, 15),
          y: cy + Phaser.Math.Between(-15, 15),
          angle: chunk.angle + Phaser.Math.Between(-360, 360),
          alpha: 0,
          scaleX: 0.1,
          scaleY: 0.1,
          duration: Phaser.Math.Between(800, 1500),
          ease: 'Power3',
          onComplete: () => chunk.destroy(),
        });
      },
    });

    // Escalating screen shake
    const shakeEvent = this.scene.time.addEvent({
      delay: 3000,
      repeat: -1,
      callback: () => {
        if (!this.vortexActive || !this.scene) { shakeEvent.destroy(); return; }
        const elapsed = this.scene.time.now - this.vortexStartTime;
        const intensity = 0.003 + (elapsed / this.vortexDuration) * 0.012;
        this.scene.cameras.main.shake(800, intensity);
      },
    });

    this.scene.cameras.main.shake(2000, 0.008);

    // Phase flashes at milestones
    for (const [delay, flashColor] of [
      [4000, 0xff00ff], [7000, 0x00ffff], [10000, 0xff4400], [13000, 0xffffff],
    ] as [number, number][]) {
      this.scene.time.delayedCall(delay, () => {
        if (!this.vortexActive || !this.scene) return;
        const phaseFlash = this.scene.add.rectangle(400, 240, 800, 480, flashColor, 0.4).setDepth(904);
        this.scene.tweens.add({
          targets: phaseFlash, alpha: 0, duration: 600,
          onComplete: () => phaseFlash.destroy(),
        });
        this.scene.cameras.main.shake(600, 0.015);
      });
    }

    // "VORTEX" text with glow
    const vortexText = this.scene.add.text(cx, cy - 130, 'V O R T E X', {
      fontFamily: 'monospace', fontSize: '36px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0).setDepth(904);
    this.vortexVisuals.push(vortexText);

    const textGlow = this.scene.add.text(cx, cy - 130, 'V O R T E X', {
      fontFamily: 'monospace', fontSize: '36px', color: '#8844ff', fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0).setDepth(903);
    this.vortexVisuals.push(textGlow);

    this.scene.tweens.add({
      targets: [vortexText, textGlow], alpha: 1, y: cy - 150,
      duration: 600, ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: textGlow,
      alpha: { from: 0.4, to: 0.8 },
      scaleX: { from: 1.0, to: 1.08 },
      scaleY: { from: 1.0, to: 1.08 },
      duration: 400, yoyo: true, repeat: -1, delay: 600,
    });
    this.scene.tweens.add({
      targets: vortexText,
      scaleX: { from: 0.97, to: 1.03 },
      scaleY: { from: 0.97, to: 1.03 },
      duration: 300, yoyo: true, repeat: -1, delay: 600,
    });

    // Countdown in final 5 seconds
    this.scene.time.delayedCall(this.vortexDuration - 5000, () => {
      if (!this.vortexActive || !this.scene) return;
      for (let s = 5; s >= 1; s--) {
        this.scene.time.delayedCall((5 - s) * 1000, () => {
          if (!this.vortexActive || !this.scene) return;
          const num = this.scene.add.text(cx, cy + 60, String(s), {
            fontFamily: 'monospace', fontSize: '48px', color: '#ff4444', fontStyle: 'bold',
          }).setOrigin(0.5).setAlpha(1).setDepth(905);
          this.scene.tweens.add({
            targets: num, alpha: 0, scaleX: 3, scaleY: 3,
            duration: 800, ease: 'Power2', onComplete: () => num.destroy(),
          });
          this.scene.cameras.main.shake(200, 0.008 + (5 - s) * 0.004);
        });
      }
    });
  }

  private updateVortexSwirl(time: number, elapsed: number) {
    const cx = this.vortexCenter.x;
    const cy = this.vortexCenter.y;

    // Progressive acceleration (15s)
    let speedMult: number;
    if (elapsed < 1500) {
      speedMult = (elapsed / 1500) * 0.5;
    } else if (elapsed < 4000) {
      speedMult = 0.5 + ((elapsed - 1500) / 2500) * 1.0;
    } else if (elapsed < 9000) {
      speedMult = 1.5 + ((elapsed - 4000) / 5000) * 1.5;
    } else if (elapsed < 13000) {
      speedMult = 3.0 + ((elapsed - 9000) / 4000) * 2.5;
    } else {
      speedMult = 5.5 - ((elapsed - 13000) / 2000) * 5.0;
    }

    const radiusShrink = Math.max(0.3, 1.0 - (speedMult / 5.0) * 0.7);

    const agentArray = [...this.agents.entries()];
    const count = agentArray.length;
    if (count === 0) return;

    for (let i = 0; i < count; i++) {
      const [, agent] = agentArray[i];
      const angleOffset = (i / count) * Math.PI * 2;
      const baseAngle = (time / (800 / Math.max(speedMult, 0.1))) + angleOffset;

      const layer = i % 4;
      const radiusBase = 50 + layer * 35;
      const radiusOsc = 30 * Math.sin(time / 1500 + i * 1.7);
      const chaos = speedMult > 2.5 ? Math.sin(time / 300 + i * 3) * 15 : 0;
      const radius = (radiusBase + radiusOsc + chaos) * radiusShrink;

      const vertBob = Math.sin(time / 800 + i * 2) * 8 * speedMult;

      const tx = cx + Math.cos(baseAngle) * radius;
      const ty = cy + Math.sin(baseAngle) * radius * 0.55 + vertBob;

      const lerp = Math.min(0.05 + speedMult * 0.03, 0.25);
      agent.setPosition(
        agent.x + (tx - agent.x) * lerp,
        agent.y + (ty - agent.y) * lerp,
      );
    }
  }

  private endVortex() {
    this.vortexActive = false;
    const cx = this.vortexCenter.x;
    const cy = this.vortexCenter.y;

    // White-out flash
    const whiteout = this.scene.add.rectangle(400, 240, 800, 480, 0xffffff, 0.9).setDepth(910);
    this.scene.tweens.add({
      targets: whiteout, alpha: 0, duration: 1200, ease: 'Power2',
      onComplete: () => whiteout.destroy(),
    });

    // Implosion then explosion
    const implode = this.scene.add.circle(cx, cy, 300, 0x8844ff, 0.5).setDepth(906);
    this.scene.tweens.add({
      targets: implode,
      scaleX: 0.02, scaleY: 0.02, alpha: 1,
      duration: 300, ease: 'Power3',
      onComplete: () => {
        implode.destroy();
        const ring = this.scene.add.circle(cx, cy, 10, 0xffffff, 0.0)
          .setStrokeStyle(6, 0xffffff, 0.9).setDepth(907);
        this.scene.tweens.add({
          targets: ring, scaleX: 30, scaleY: 20, alpha: 0,
          duration: 800, ease: 'Power2', onComplete: () => ring.destroy(),
        });
      },
    });

    // Multi-ring particle explosion
    const burstColors = [0x00ffff, 0xff00ff, 0x8844ff, 0xffff00, 0xffffff, 0xff4488, 0x44ff88, 0xffaa00];
    for (let ring = 0; ring < 3; ring++) {
      this.scene.time.delayedCall(ring * 100, () => {
        if (!this.scene) return;
        const particleCount = 20 + ring * 10;
        for (let i = 0; i < particleCount; i++) {
          const angle = (i / particleCount) * Math.PI * 2;
          const dist = Phaser.Math.Between(120 + ring * 60, 300 + ring * 80);
          const size = Phaser.Math.Between(2, 6 + ring * 2);
          const p = this.scene.add.circle(cx, cy, size,
            burstColors[Phaser.Math.Between(0, burstColors.length - 1)], 1.0,
          ).setDepth(906);
          this.scene.tweens.add({
            targets: p,
            x: cx + Math.cos(angle) * dist + Phaser.Math.Between(-30, 30),
            y: cy + Math.sin(angle) * dist * 0.7 + Phaser.Math.Between(-20, 20),
            alpha: 0, scaleX: 0.1, scaleY: 0.1,
            duration: Phaser.Math.Between(500, 1200), ease: 'Power2',
            onComplete: () => p.destroy(),
          });
        }
      });
    }

    // Shockwave ripples
    for (let i = 0; i < 4; i++) {
      this.scene.time.delayedCall(i * 150, () => {
        if (!this.scene) return;
        const wave = this.scene.add.circle(cx, cy, 20, 0xffffff, 0.0)
          .setStrokeStyle(3 - i * 0.5, [0xffffff, 0x00ffff, 0xff00ff, 0xffff00][i], 0.7)
          .setDepth(906);
        this.scene.tweens.add({
          targets: wave, scaleX: 15 + i * 3, scaleY: 10 + i * 2, alpha: 0,
          duration: 600, ease: 'Power2', onComplete: () => wave.destroy(),
        });
      });
    }

    this.scene.cameras.main.shake(1000, 0.025);

    // Clean up visuals
    for (const obj of this.vortexVisuals) {
      this.scene.tweens.add({
        targets: obj, alpha: 0, duration: 400,
        onComplete: () => obj.destroy(),
      });
    }
    this.vortexVisuals = [];

    // Fling agents outward, then walk home
    for (const [id, agent] of this.agents) {
      const saved = this.preVortexPositions.get(id);
      if (!saved) continue;

      const angle = Math.atan2(agent.y - cy, agent.x - cx);
      const flingDist = Phaser.Math.Between(80, 150);
      agent.setPosition(
        Phaser.Math.Clamp(agent.x + Math.cos(angle) * flingDist, 20, 780),
        Phaser.Math.Clamp(agent.y + Math.sin(angle) * flingDist, 50, 460),
      );

      this.scene.time.delayedCall(Phaser.Math.Between(800, 1500), () => {
        agent.moveTo(saved.x, saved.y);
      });
    }
    this.preVortexPositions.clear();
  }

  private emitSparks(x: number, y: number, color: number, count = 5) {
    // Flash pop at origin
    const flash = this.scene.add.circle(x, y, 10, color, 0.25).setDepth(9);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scaleX: 2,
      scaleY: 2,
      duration: 200,
      ease: 'Power2',
      onComplete: () => flash.destroy(),
    });

    // Cross-shaped particles
    for (let i = 0; i < count; i++) {
      const particle = this.scene.add.image(
        x + Phaser.Math.Between(-6, 6),
        y + Phaser.Math.Between(-6, 6),
        'particle',
      ).setTint(color).setScale(Phaser.Math.FloatBetween(0.5, 1.5)).setDepth(9);

      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist = Phaser.Math.Between(15, 35);

      this.scene.tweens.add({
        targets: particle,
        x: particle.x + Math.cos(angle) * dist,
        y: particle.y + Math.sin(angle) * dist - Phaser.Math.Between(5, 15),
        alpha: 0,
        angle: Phaser.Math.Between(-180, 180),
        scaleX: 0.1,
        scaleY: 0.1,
        duration: Phaser.Math.Between(400, 800),
        ease: 'Power2',
        onComplete: () => particle.destroy(),
      });
    }
  }

  private updateHud() {
    const el = document.getElementById('hud-agents');
    if (el) el.textContent = String(this.agents.size);
  }

  /**
   * Periodic check: pick a random idle/waiting agent and send them to visit a random tombstone.
   * Each agent places at most 1 flower per tombstone.
   */
  private checkFlowerVisits() {
    if (this.tombstones.size === 0) return;

    // Pick a random tombstone
    const tombIds = [...this.tombstones.keys()];
    const deadSessionId = tombIds[Phaser.Math.Between(0, tombIds.length - 1)];

    // Who already placed a flower at this tombstone?
    const done = this.flowersDone.get(deadSessionId) ?? new Set();

    // Find idle/waiting agents not already visiting, not working, not zombies, and haven't placed a flower here yet
    const candidates: string[] = [];
    for (const [id, agent] of this.agents) {
      const activity = agent.sessionData.activity;
      const notBusy = activity === 'idle' || activity === 'waiting';
      if (notBusy && !agent.isZombie && !this.flowerVisitors.has(id) && !done.has(id)) {
        candidates.push(id);
      }
    }

    if (candidates.length === 0) return;

    // Send one random agent
    const agentId = candidates[Phaser.Math.Between(0, candidates.length - 1)];
    this.sendFlowerVisitor(agentId, deadSessionId);
  }

  /**
   * Send a single agent to place flowers at a tombstone.
   * Agent moves at 2x speed to ensure they arrive before the tombstone expires.
   */
  private sendFlowerVisitor(agentId: string, deadSessionId: string) {
    const tomb = this.tombstones.get(deadSessionId);
    const agent = this.agents.get(agentId);
    if (!tomb || !agent) return;

    this.flowerVisitors.set(agentId, deadSessionId);

    // Save original position and speed to restore later
    const returnX = agent.x;
    const returnY = agent.y;
    const originalSpeed = agent.getMoveSpeed();

    // Double speed to reach tombstone quickly
    agent.setMoveSpeed(originalSpeed * 2);

    // Walk to tombstone (offset slightly so they stand beside it)
    const offsetX = Phaser.Math.Between(-16, 16);
    const destX = tomb.x + offsetX;
    const destY = tomb.y + 14;
    agent.moveTo(destX, destY);

    // Calculate walk time based on boosted speed + buffer
    const boostedSpeed = originalSpeed * 2;
    const dx = destX - agent.x;
    const dy = destY - agent.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const walkTime = (dist / boostedSpeed) * 1000 + 500;

    // Place flower after agent actually arrives
    this.scene.time.delayedCall(walkTime, () => {
      const stillVisiting = this.flowerVisitors.get(agentId) === deadSessionId;
      const tombGone = !this.tombstones.has(deadSessionId);
      const agentGone = !this.agents.has(agentId);

      // If tombstone disappeared or agent is gone, abort and go home
      if (agentGone || !stillVisiting || tombGone) {
        this.flowerVisitors.delete(agentId);
        if (!agentGone) {
          const a = this.agents.get(agentId)!;
          a.setMoveSpeed(originalSpeed);
          a.moveTo(returnX, returnY);
        }
        return;
      }

      const tombNow = this.tombstones.get(deadSessionId)!;

      // Restore normal speed now that we've arrived
      agent.setMoveSpeed(originalSpeed);

      // Mark this agent as having placed a flower at this tombstone (max 1 per agent)
      if (!this.flowersDone.has(deadSessionId)) {
        this.flowersDone.set(deadSessionId, new Set());
      }
      this.flowersDone.get(deadSessionId)!.add(agentId);

      // Place flower at tombstone base
      const flower = this.scene.add.image(
        Phaser.Math.Between(-8, 8),
        Phaser.Math.Between(10, 16),
        'flower',
      );
      flower.setScale(1.5);
      flower.setAlpha(0);
      flower.setTint([0xff4466, 0xffaa00, 0xff66cc, 0x66aaff, 0xffff44][Phaser.Math.Between(0, 4)]);
      tombNow.container.add(flower);

      // Flower fade in
      this.scene.tweens.add({
        targets: flower,
        alpha: 1,
        y: flower.y - 2,
        duration: 400,
        ease: 'Power2',
      });

      // Sad pause, then walk back at normal speed
      this.scene.time.delayedCall(1500, () => {
        this.flowerVisitors.delete(agentId);
        if (this.agents.has(agentId)) {
          const a = this.agents.get(agentId)!;
          a.setMoveSpeed(originalSpeed);
          a.moveTo(returnX, returnY);
        }
      });
    });
  }

  /**
   * Cancel all flower visitors headed to a specific tombstone and send them back.
   */
  private cancelFlowerVisitors(deadSessionId: string) {
    for (const [agentId, tombId] of this.flowerVisitors) {
      if (tombId === deadSessionId) {
        this.flowerVisitors.delete(agentId);
        const agent = this.agents.get(agentId);
        if (agent) {
          // Restore normal speed and send them back to lounge
          agent.setMoveSpeed(80);
          const pos = this.layout.assignToLounge(agentId);
          agent.moveTo(pos.x, pos.y);
        }
      }
    }
  }
}
