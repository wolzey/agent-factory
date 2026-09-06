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
    if (this.pending && !this.owned().some(agent => agent.sessionId === this.pending)) this.reset();
  }
  claim(sessionId: string) {
    if (!this.owned().some(agent => agent.sessionId === sessionId)) return false;
    this.release(); this.error = '';
    if (!this.send({ type: 'control_claim', sessionId })) { this.error = 'Connection lost. Try again when the factory reconnects.'; return false; }
    this.pending = sessionId; return true;
  }
  handle(message: WSMessageToClient) {
    if (message.type === 'control_result') {
      if (message.action === 'claim' && message.sessionId && message.sessionId !== this.pending) return;
      // A late release acknowledgement must not cancel a newer claim.
      if (message.action === 'release') {
        if (message.success && (!message.sessionId || message.sessionId === this.active)) this.active = undefined;
        return;
      }
      if (message.action === 'claim' && message.success && message.sessionId === this.pending) this.active = message.sessionId;
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

export type FactoryControlPhase = 'watching' | 'connecting' | 'empty' | 'ready' | 'claiming' | 'controlling' | 'reconnecting' | 'error';

/** One visible step at a time, driven by connection, identity and server grants. */
export function factoryControlPhase(state: FactoryControlState, connected: boolean, connecting = false, error = ''): FactoryControlPhase {
  if (!connected) return 'reconnecting';
  if (error || state.error) return 'error';
  if (!state.ownerId) return connecting ? 'connecting' : 'watching';
  if (!state.owned().length) return 'empty';
  if (state.pending) return 'claiming';
  return state.active ? 'controlling' : 'ready';
}
