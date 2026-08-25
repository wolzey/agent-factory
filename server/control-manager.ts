import type { WebSocket } from '@fastify/websocket';
import type { ControlInputState, FacingDirection, ManualControlState } from '../shared/types.js';
import {
  CONTROL_INPUT_TIMEOUT_MS,
  CONTROL_MOVE_SPEED,
  CONTROL_SHOOT_COOLDOWN_MS,
  CONTROL_TICK_INTERVAL_MS,
  CONTROL_WORLD_BOUNDS,
  MAX_BROADCAST_RATE_MS,
} from '../shared/constants.js';
import type { StateManager } from './state.js';
import type { BroadcastManager } from './ws/broadcast.js';

interface ControlLease {
  socket: WebSocket;
  username: string;
  sessionId: string;
  input: ControlInputState;
  x: number;
  y: number;
  facing: FacingDirection;
  moving: boolean;
  lastInputAt: number;
  lastTickAt: number;
  lastBroadcastAt: number;
  lastShotAt: number;
}

const STOPPED_INPUT: ControlInputState = {
  up: false,
  down: false,
  left: false,
  right: false,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeCoordinate(value: number, fallback: number, min: number, max: number): number {
  return Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

export class ControlManager {
  private bySocket = new Map<WebSocket, ControlLease>();
  private bySession = new Map<string, ControlLease>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private state: StateManager,
    private broadcast: BroadcastManager,
    private now: () => number = Date.now,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), CONTROL_TICK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const socket of Array.from(this.bySocket.keys())) {
      this.releaseSocket(socket, 'server-stopped', false);
    }
  }

  claim(socket: WebSocket, username: string | undefined, sessionId: string, x: number, y: number): boolean {
    if (!username) return this.reject(socket, 'claim', 'Authentication required');

    const session = this.state.get(sessionId);
    if (!session || session.activity === 'stopped') {
      return this.reject(socket, 'claim', 'Agent is no longer active', sessionId);
    }
    if (session.username !== username) {
      return this.reject(socket, 'claim', 'You can only control agents attributed to you', sessionId);
    }

    const currentForSocket = this.bySocket.get(socket);
    if (currentForSocket?.sessionId === sessionId) {
      this.broadcast.sendTo(socket, { type: 'control_result', success: true, action: 'claim', sessionId });
      return true;
    }
    if (currentForSocket) {
      this.releaseLease(currentForSocket, 'switched-agent', false);
    }

    const currentForSession = this.bySession.get(sessionId);
    if (currentForSession && currentForSession.socket !== socket) {
      this.broadcast.sendTo(currentForSession.socket, {
        type: 'control_revoked',
        sessionId,
        reason: 'Control was taken over in another browser',
      });
      this.releaseLease(currentForSession, 'taken-over', false, true);
    }

    const timestamp = this.now();
    const lease: ControlLease = {
      socket,
      username,
      sessionId,
      input: { ...STOPPED_INPUT },
      x: safeCoordinate(x, 400, CONTROL_WORLD_BOUNDS.minX, CONTROL_WORLD_BOUNDS.maxX),
      y: safeCoordinate(y, 240, CONTROL_WORLD_BOUNDS.minY, CONTROL_WORLD_BOUNDS.maxY),
      facing: 'down',
      moving: false,
      lastInputAt: timestamp,
      lastTickAt: timestamp,
      lastBroadcastAt: timestamp,
      lastShotAt: 0,
    };

    this.bySocket.set(socket, lease);
    this.bySession.set(sessionId, lease);
    this.state.setManualControl(sessionId, this.toState(lease));
    this.broadcast.sendTo(socket, { type: 'control_result', success: true, action: 'claim', sessionId });
    return true;
  }

  updateInput(
    socket: WebSocket,
    username: string | undefined,
    sessionId: string,
    input: ControlInputState,
  ): boolean {
    const lease = this.authorizedLease(socket, username, sessionId);
    if (!lease) return false;

    lease.input = {
      up: input?.up === true,
      down: input?.down === true,
      left: input?.left === true,
      right: input?.right === true,
    };
    const dx = Number(lease.input.right) - Number(lease.input.left);
    const dy = Number(lease.input.down) - Number(lease.input.up);
    lease.facing = this.resolveFacing(lease.facing, dx, dy);
    lease.lastInputAt = this.now();
    return true;
  }

  release(socket: WebSocket, username: string | undefined, sessionId: string): boolean {
    const lease = this.authorizedLease(socket, username, sessionId);
    if (!lease) {
      return this.reject(socket, 'release', 'You do not control that agent', sessionId);
    }
    this.releaseLease(lease, 'released', true);
    return true;
  }

  releaseSocket(socket: WebSocket, reason: string, notifySocket = false): void {
    const lease = this.bySocket.get(socket);
    if (lease) this.releaseLease(lease, reason, notifySocket);
  }

  releaseSession(sessionId: string, reason: string): void {
    const lease = this.bySession.get(sessionId);
    if (!lease) return;
    this.broadcast.sendTo(lease.socket, { type: 'control_revoked', sessionId, reason });
    this.releaseLease(lease, reason, false);
  }

  shoot(socket: WebSocket, username: string | undefined, sessionId: string): boolean {
    const lease = this.authorizedLease(socket, username, sessionId);
    if (!lease) return false;

    const timestamp = this.now();
    if (timestamp - lease.lastShotAt < CONTROL_SHOOT_COOLDOWN_MS) return false;
    lease.lastShotAt = timestamp;
    this.state.emitEffect(sessionId, 'shoot', { facing: lease.facing });
    return true;
  }

  tick(timestamp = this.now()): void {
    for (const lease of Array.from(this.bySession.values())) {
      const session = this.state.get(lease.sessionId);
      if (!session || session.activity === 'stopped') {
        this.releaseSession(lease.sessionId, 'Agent session ended');
        continue;
      }
      if (session.username !== lease.username) {
        this.releaseSession(lease.sessionId, 'Agent attribution changed');
        continue;
      }

      if (timestamp - lease.lastInputAt > CONTROL_INPUT_TIMEOUT_MS) {
        lease.input = { ...STOPPED_INPUT };
      }

      const dt = Math.min(Math.max(timestamp - lease.lastTickAt, 0), 250) / 1000;
      lease.lastTickAt = timestamp;

      let dx = Number(lease.input.right) - Number(lease.input.left);
      let dy = Number(lease.input.down) - Number(lease.input.up);
      const moving = dx !== 0 || dy !== 0;

      if (moving) {
        const magnitude = Math.hypot(dx, dy);
        dx /= magnitude;
        dy /= magnitude;
        lease.x = clamp(
          lease.x + dx * CONTROL_MOVE_SPEED * dt,
          CONTROL_WORLD_BOUNDS.minX,
          CONTROL_WORLD_BOUNDS.maxX,
        );
        lease.y = clamp(
          lease.y + dy * CONTROL_MOVE_SPEED * dt,
          CONTROL_WORLD_BOUNDS.minY,
          CONTROL_WORLD_BOUNDS.maxY,
        );
        lease.facing = this.resolveFacing(lease.facing, dx, dy);
      }

      const movementChanged = lease.moving !== moving;
      lease.moving = moving;
      if (movementChanged || (moving && timestamp - lease.lastBroadcastAt >= MAX_BROADCAST_RATE_MS)) {
        lease.lastBroadcastAt = timestamp;
        this.state.updateManualControl(lease.sessionId, this.toState(lease));
      }
    }
  }

  private authorizedLease(
    socket: WebSocket,
    username: string | undefined,
    sessionId: string,
  ): ControlLease | undefined {
    if (!username) return undefined;
    const lease = this.bySocket.get(socket);
    if (!lease || lease.sessionId !== sessionId || lease.username !== username) return undefined;
    const session = this.state.get(sessionId);
    if (!session || session.activity === 'stopped' || session.username !== lease.username) {
      const reason = session && session.username !== lease.username
        ? 'Agent attribution changed'
        : 'Agent session ended';
      this.releaseSession(sessionId, reason);
      return undefined;
    }
    return lease;
  }

  private releaseLease(
    lease: ControlLease,
    _reason: string,
    notifySocket: boolean,
    preserveControlState = false,
  ): void {
    this.bySocket.delete(lease.socket);
    this.bySession.delete(lease.sessionId);
    if (!preserveControlState) this.state.clearManualControl(lease.sessionId);
    if (notifySocket) {
      this.broadcast.sendTo(lease.socket, {
        type: 'control_result',
        success: true,
        action: 'release',
        sessionId: lease.sessionId,
      });
    }
  }

  private reject(
    socket: WebSocket,
    action: 'claim' | 'release',
    error: string,
    sessionId?: string,
  ): false {
    this.broadcast.sendTo(socket, { type: 'control_result', success: false, action, sessionId, error });
    return false;
  }

  private toState(lease: ControlLease): ManualControlState {
    return {
      x: lease.x,
      y: lease.y,
      facing: lease.facing,
      moving: lease.moving,
    };
  }

  private resolveFacing(current: FacingDirection, dx: number, dy: number): FacingDirection {
    if (dx !== 0 && dy !== 0) {
      if (current === 'left' || current === 'right') return dx > 0 ? 'right' : 'left';
      return dy > 0 ? 'down' : 'up';
    }
    if (dx !== 0) return dx > 0 ? 'right' : 'left';
    if (dy !== 0) return dy > 0 ? 'down' : 'up';
    return current;
  }
}
