import Phaser from 'phaser';
import type { AgentSession, EffectType } from '@shared/types';
import { AgentSprite } from '../entities/AgentSprite';
import { SubagentSprite } from '../entities/SubagentSprite';
import { Machine } from '../entities/Machine';
import { LayoutManager } from './LayoutManager';

export class AgentManager {
  private scene: Phaser.Scene;
  private agents = new Map<string, AgentSprite>();
  private subagents = new Map<string, SubagentSprite>();
  private machines: Machine[] = [];
  private layout: LayoutManager;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.layout = new LayoutManager();
    this.createMachines();
  }

  private createMachines() {
    // Create arcade cabinets at machine slot positions (matching LayoutManager)
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 6; col++) {
        const x = 80 + col * 110;
        const y = 70 + row * 90; // Cabinets sit above the agent standing position
        const machine = new Machine(this.scene, x, y, row * 6 + col);
        this.machines.push(machine);
      }
    }
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
    }
  }

  update(time: number, delta: number) {
    for (const agent of this.agents.values()) {
      agent.update(time, delta);
    }
    for (const sub of this.subagents.values()) {
      // Update parent position for orbit
      const parent = this.agents.get(sub.parentSessionId);
      if (parent) {
        sub.setParentPosition(parent.x, parent.y);
      }
      sub.update(time, delta);
    }
  }

  private upsertAgent(session: AgentSession) {
    let agent = this.agents.get(session.sessionId);

    if (!agent) {
      // New agent - spawn at entrance
      agent = new AgentSprite(this.scene, session);
      const entrance = this.layout.entrance;
      agent.setPosition(entrance.x, entrance.y);
      this.agents.set(session.sessionId, agent);
    }

    agent.updateSession(session);

    // Route agent to the right area based on activity:
    //   working (reading/writing/running/searching/chatting/planning) -> arcade cabinet
    //   thinking (between tool calls) -> stay at arcade cabinet (thought bubble shown by AgentSprite)
    //   idle (waiting for user input) -> front counter
    //   stopped -> walk to exit

    const workingStates = ['reading', 'writing', 'running', 'searching', 'chatting', 'planning'];
    const isWorking = workingStates.includes(session.activity);
    const isThinking = session.activity === 'thinking';

    if (session.activity === 'stopped') {
      const entrance = this.layout.entrance;
      this.layout.release(session.sessionId);
      this.deactivateMachineFor(session.sessionId);
      agent.moveTo(entrance.x, entrance.y);
    } else if (isWorking || isThinking) {
      // Working or thinking -> arcade cabinet
      const pos = this.layout.assignToArcade(session.sessionId);
      agent.moveTo(pos.x, pos.y + 30); // Stand in front of cabinet
      this.activateMachineFor(session.sessionId);
    } else if (session.activity === 'idle') {
      // Waiting for user input -> front counter
      this.deactivateMachineFor(session.sessionId);
      this.layout.release(session.sessionId);
      const pos = this.layout.assignToCounter(session.sessionId);
      agent.moveTo(pos.x, pos.y);
    } else {
      // Fallback -> lounge
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
      agent.fadeOut();
      this.agents.delete(sessionId);
    }
    this.layout.release(sessionId);
    this.deactivateMachineFor(sessionId);

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

    // Add new subagents
    for (const info of session.subagents) {
      const key = `${session.sessionId}:${info.agentId}`;
      existing.add(key);

      if (!this.subagents.has(key)) {
        const sub = new SubagentSprite(
          this.scene,
          info,
          session.sessionId,
          session.avatar?.spriteIndex ?? 0,
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
        m => Math.abs(m.x - slot.pos.x) < 10 && Math.abs(m.y - slot.pos.y + 30) < 10,
      );
      machine?.setActive(true);
    }
  }

  private deactivateMachineFor(sessionId: string) {
    const slot = this.layout.getArcadeSlotFor(sessionId);
    if (slot) {
      const machine = this.machines.find(
        m => Math.abs(m.x - slot.pos.x) < 10 && Math.abs(m.y - slot.pos.y + 30) < 10,
      );
      machine?.setActive(false);
    }
  }

  private emitSparks(x: number, y: number, color: number, count = 5) {
    for (let i = 0; i < count; i++) {
      const particle = this.scene.add.rectangle(
        x + Phaser.Math.Between(-8, 8),
        y + Phaser.Math.Between(-8, 8),
        3, 3,
        color,
      );
      particle.setAlpha(1);

      this.scene.tweens.add({
        targets: particle,
        x: particle.x + Phaser.Math.Between(-20, 20),
        y: particle.y + Phaser.Math.Between(-30, -5),
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
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
}
