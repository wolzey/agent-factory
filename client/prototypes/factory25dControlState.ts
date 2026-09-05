import type { ControlInputState, WorldAgent, WSMessageToClient, WSMessageToServer } from '@shared/types';

export class FactoryControlState {
  ownerId: string | undefined;
  active: string | undefined;
  pending: string | undefined;
  error = '';
  agents: WorldAgent[] = [];
  input: ControlInputState = { up: false, down: false, left: false, right: false };
  constructor(private send: (message: WSMessageToServer) => boolean) {}
  owned() { return this.agents.filter(agent => agent.ownerId === this.ownerId && this.ownerId && agent.activity !== 'stopped'); }
  sync(agents: WorldAgent[], ownerId?: string) {
    if (this.ownerId !== ownerId) this.reset();
    this.ownerId = ownerId; this.agents = agents;
    if (this.active && !this.owned().some(agent => agent.sessionId === this.active)) this.reset();
  }
  claim(sessionId: string) {
    if (!this.owned().some(agent => agent.sessionId === sessionId)) return false;
    this.stop(); this.error = '';
    if (!this.send({ type: 'control_claim', sessionId })) return false;
    this.pending = sessionId; return true;
  }
  handle(message: WSMessageToClient) {
    if (message.type === 'control_result') {
      if (message.action === 'claim' && message.sessionId && message.sessionId !== this.pending) return;
      if (message.action === 'claim' && message.success && message.sessionId === this.pending) this.active = message.sessionId;
      if (message.action === 'release' && message.success && (!message.sessionId || message.sessionId === this.active)) this.active = undefined;
      if (!message.success) this.error = message.error || 'That agent is unavailable.';
      this.pending = undefined;
    } else if (message.type === 'control_revoked' && message.sessionId === this.active) { this.reset(); this.error = message.reason; }
  }
  move(key: keyof ControlInputState, pressed: boolean) {
    if (!this.active || this.input[key] === pressed) return;
    this.input[key] = pressed; this.heartbeat();
  }
  heartbeat() { if (this.active) this.send({ type: 'control_input', sessionId: this.active, input: { ...this.input } }); }
  stop() {
    const moving = Object.values(this.input).some(Boolean);
    this.input = { up: false, down: false, left: false, right: false };
    if (moving) this.heartbeat();
  }
  release() {
    this.stop();
    const sessionId = this.active ?? this.pending;
    if (sessionId) this.send({ type: 'control_release', sessionId });
    this.active = this.pending = undefined;
  }
  reset() { this.stop(); this.active = this.pending = undefined; }
  shoot() { return this.active ? this.send({ type: 'shoot', sessionId: this.active }) : false; }
  emote(emote: string) { return this.active ? this.send({ type: 'emote', sessionId: this.active, emote }) : false; }
}
