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
    }
  }

  update(time: number, delta: number) {
    for (const agent of this.agents.values()) {
      agent.update(time, delta);
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
        this.layout.releaseTombstone(session.sessionId);

        // Send flower visitors home — tombstone is gone
        this.cancelFlowerVisitors(session.sessionId);

        // Prevent routing until rise animation finishes (~3s)
        this.zombieRising.add(session.sessionId);
        this.scene.time.delayedCall(3000, () => {
          this.zombieRising.delete(session.sessionId);
        });
      } else {
        // New agent - spawn at entrance
        const entrance = this.layout.entrance;
        agent.setPosition(entrance.x, entrance.y);
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
      agent.moveTo(pos.x, pos.y + 24); // Stand in front of cabinet
      this.activateMachineFor(session.sessionId);
    } else if (session.activity === 'waiting') {
      // Waiting for user prompt -> front counter
      this.deactivateMachineFor(session.sessionId);
      this.layout.release(session.sessionId);
      const pos = this.layout.assignToCounter(session.sessionId);
      agent.moveTo(pos.x, pos.y);
    } else {
      // idle / fallback -> lounge
      this.layout.release(session.sessionId);
      this.deactivateMachineFor(session.sessionId);
      const pos = this.layout.assignToLounge(session.sessionId);
      agent.moveTo(pos.x, pos.y);
    }

    // Sync subagents
    this.syncSubagents(session);
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

    // Find idle/waiting agents not already visiting, not working, and haven't placed a flower here yet
    const candidates: string[] = [];
    for (const [id, agent] of this.agents) {
      const activity = agent.sessionData.activity;
      const notBusy = activity === 'idle' || activity === 'waiting';
      if (notBusy && !this.flowerVisitors.has(id) && !done.has(id)) {
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
