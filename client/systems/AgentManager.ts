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
  private zombieRising = new Set<string>(); // agents currently rising from grave (skip routing)

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
      case 'emote':
        if (data?.emote) {
          agent.playEmote(data.emote as string);
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

    const workingStates = ['reading', 'writing', 'running', 'searching', 'chatting', 'planning'];
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

        // Trigger flower-bringing from other idle agents
        this.triggerFlowerVisits(sessionId);

        // Remove tombstone + free workstation slot after it expires
        this.scene.time.delayedCall(TOMBSTONE_DURATION_MS, () => {
          this.tombstones.delete(sessionId);
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
   * Send all idle/waiting agents to walk over and place flowers at a tombstone.
   */
  private triggerFlowerVisits(deadSessionId: string) {
    const tomb = this.tombstones.get(deadSessionId);
    if (!tomb) return;

    // Find agents that are idle or waiting (not busy working) and not already visiting
    const candidates: { id: string; agent: AgentSprite }[] = [];
    for (const [id, agent] of this.agents) {
      const activity = agent.sessionData.activity;
      if ((activity === 'idle' || activity === 'waiting') && !this.flowerVisitors.has(id)) {
        candidates.push({ id, agent });
      }
    }

    if (candidates.length === 0) return;

    for (let i = 0; i < candidates.length; i++) {
      const { id } = candidates[i];
      this.flowerVisitors.set(id, deadSessionId);

      // Stagger visits so they don't all arrive at once
      const delay = Phaser.Math.Between(1500, 4000) + i * 2000;

      this.scene.time.delayedCall(delay, () => {
        // Check the tombstone still exists and the agent is still alive and still a visitor
        const currentTomb = this.tombstones.get(deadSessionId);
        const currentAgent = this.agents.get(id);
        if (!currentTomb || !currentAgent || this.flowerVisitors.get(id) !== deadSessionId) {
          this.flowerVisitors.delete(id);
          return;
        }

        // Save original position to return to
        const returnX = currentAgent.x;
        const returnY = currentAgent.y;

        // Walk to tombstone (offset slightly so they stand beside it)
        const offsetX = Phaser.Math.Between(-16, 16);
        const destX = currentTomb.x + offsetX;
        const destY = currentTomb.y + 14;
        currentAgent.moveTo(destX, destY);

        // Calculate walk time from distance (agent speed is 80px/s) + buffer
        const dx = destX - currentAgent.x;
        const dy = destY - currentAgent.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const walkTime = (dist / 80) * 1000 + 500;

        // Place flower after agent actually arrives
        this.scene.time.delayedCall(walkTime, () => {
          if (!this.agents.has(id) || !this.tombstones.has(deadSessionId) || this.flowerVisitors.get(id) !== deadSessionId) {
            this.flowerVisitors.delete(id);
            return;
          }

          const tombNow = this.tombstones.get(deadSessionId)!;

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

          // Sad pause, then walk back
          this.scene.time.delayedCall(1500, () => {
            this.flowerVisitors.delete(id);
            if (this.agents.has(id)) {
              const a = this.agents.get(id)!;
              a.moveTo(returnX, returnY);
            }
          });
        });
      });
    }
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
          // Send them to their normal routing position (lounge for idle)
          const pos = this.layout.assignToLounge(agentId);
          agent.moveTo(pos.x, pos.y);
        }
      }
    }
  }
}
