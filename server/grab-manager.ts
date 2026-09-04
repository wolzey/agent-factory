import type { WebSocket } from '@fastify/websocket';
import type { AgentSession, GrabState, GrabTarget } from '../shared/types.js';
import {
  CONTROL_TICK_INTERVAL_MS,
  GRAB_POINTER_BOUNDS,
  GRAB_INPUT_TIMEOUT_MS,
  MAX_BROADCAST_RATE_MS,
} from '../shared/constants.js';
import type { StateManager } from './state.js';
import type { BroadcastManager } from './ws/broadcast.js';

interface GrabLease extends GrabTarget {
  socket: WebSocket;
  username: string;
  x: number;
  y: number;
  lastInputAt: number;
  lastBroadcastAt: number;
  dirty: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** One lease per full-size agent avatar, keyed by session id. */
export function grabKey(target: GrabTarget): string {
  return target.sessionId;
}

/** Coerce an untrusted WebSocket payload into a GrabTarget. */
export function parseGrabTarget(msg: { sessionId?: unknown; agentId?: unknown }): GrabTarget {
  // Older clients could target subagents. Reject those requests instead of
  // accidentally interpreting them as a request to grab the parent.
  return { sessionId: msg.agentId ? '' : String(msg.sessionId || '') };
}

/**
 * Server-mediated grab leases. Any authenticated viewer may lift any active avatar,
 * but only one viewer holds a given avatar at a time and each socket holds at most one.
 * Pointer positions are mirrored to every client (rate-limited) so the whole room sees
 * the same dangling avatar. The lift is ephemeral; a drop on a free workstation may update
 * the agent's authoritative world assignment.
 */
export class GrabManager {
  private bySocket = new Map<WebSocket, GrabLease>();
  private byTarget = new Map<string, GrabLease>();
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
      this.releaseSocket(socket, 'Server stopped');
    }
  }

  begin(socket: WebSocket, username: string | undefined, target: GrabTarget, x: number, y: number): boolean {
    if (!username) return this.reject(socket, 'start', 'Log in to grab avatars', target);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return this.reject(socket, 'start', 'Invalid grab position', target);
    }

    const session = this.state.get(target.sessionId);
    const invalid = session ? this.invalidReason(target, session) : 'Agent is no longer active';
    if (invalid) return this.reject(socket, 'start', invalid, target);

    const key = grabKey(target);
    const currentForSocket = this.bySocket.get(socket);
    if (currentForSocket && grabKey(currentForSocket) === key) {
      this.broadcast.sendTo(socket, { type: 'grab_result', success: true, action: 'start', ...target });
      return true;
    }

    const currentForTarget = this.byTarget.get(key);
    if (currentForTarget && currentForTarget.socket !== socket) {
      return this.reject(socket, 'start', `Already grabbed by ${currentForTarget.username}`, target);
    }

    // A pointer can only hold one thing: drop whatever this socket held before.
    if (currentForSocket) this.releaseLease(currentForSocket, 'Switched avatar', false);

    const timestamp = this.now();
    const lease: GrabLease = {
      socket,
      username,
      sessionId: target.sessionId,
      x: clamp(x, GRAB_POINTER_BOUNDS.minX, GRAB_POINTER_BOUNDS.maxX),
      y: clamp(y, GRAB_POINTER_BOUNDS.minY, GRAB_POINTER_BOUNDS.maxY),
      lastInputAt: timestamp,
      lastBroadcastAt: timestamp,
      dirty: false,
    };
    this.bySocket.set(socket, lease);
    this.byTarget.set(key, lease);
    this.broadcast.sendTo(socket, { type: 'grab_result', success: true, action: 'start', ...target });
    this.broadcast.broadcastGrab(this.toState(lease));
    return true;
  }

  move(socket: WebSocket, username: string | undefined, target: GrabTarget, x: number, y: number): boolean {
    const lease = this.authorizedLease(socket, username, target);
    if (!lease) return false;

    const timestamp = this.now();
    lease.lastInputAt = timestamp;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return true; // heartbeat only

    lease.x = clamp(x, GRAB_POINTER_BOUNDS.minX, GRAB_POINTER_BOUNDS.maxX);
    lease.y = clamp(y, GRAB_POINTER_BOUNDS.minY, GRAB_POINTER_BOUNDS.maxY);
    lease.dirty = true;
    if (timestamp - lease.lastBroadcastAt >= MAX_BROADCAST_RATE_MS) this.flush(lease, timestamp);
    return true;
  }

  end(
    socket: WebSocket,
    username: string | undefined,
    target: GrabTarget,
    x: number,
    y: number,
    workstationSlot?: number,
  ): boolean {
    const lease = this.authorizedLease(socket, username, target);
    if (!lease) return this.reject(socket, 'end', 'You are not holding that avatar', target);

    if (Number.isFinite(x) && Number.isFinite(y)) {
      lease.x = clamp(x, GRAB_POINTER_BOUNDS.minX, GRAB_POINTER_BOUNDS.maxX);
      lease.y = clamp(y, GRAB_POINTER_BOUNDS.minY, GRAB_POINTER_BOUNDS.maxY);
    }
    const drop = { x: lease.x, y: lease.y };
    const workstationAccepted = workstationSlot === undefined
      || this.state.assignNearbyWorkstation(target.sessionId, workstationSlot, drop);
    const opponent = workstationSlot === undefined
      ? this.state.findRockPaperScissorsOpponent(target.sessionId, drop)
      : undefined;
    this.releaseLease(lease, 'Released', false);
    if (!workstationAccepted) {
      return this.reject(socket, 'end', 'Drop that agent closer to a free workstation', target);
    }
    this.broadcast.sendTo(socket, {
      type: 'grab_result', success: true, action: 'end', ...target,
    });
    if (opponent) {
      this.state.startRockPaperScissors(target.sessionId, opponent.sessionId, this.now(), true);
    }
    return true;
  }

  releaseSocket(socket: WebSocket, reason: string): void {
    const lease = this.bySocket.get(socket);
    if (lease) this.releaseLease(lease, reason, false);
  }

  /** Drop every lease on a session, including its subagents (session ended or removed). */
  releaseSession(sessionId: string, reason: string): void {
    for (const lease of Array.from(this.byTarget.values())) {
      if (lease.sessionId === sessionId) this.releaseLease(lease, reason, true);
    }
  }

  /** Re-validate leases against a session that just changed (stopped, controlled, subagent gone). */
  syncSession(session: AgentSession): void {
    for (const lease of Array.from(this.byTarget.values())) {
      if (lease.sessionId !== session.sessionId) continue;
      const reason = this.invalidReason(lease, session);
      if (reason) this.releaseLease(lease, reason, true);
    }
  }

  tick(timestamp = this.now()): void {
    for (const lease of Array.from(this.byTarget.values())) {
      const session = this.state.get(lease.sessionId);
      const reason = session ? this.invalidReason(lease, session) : 'Agent is no longer active';
      if (reason) {
        this.releaseLease(lease, reason, true);
        continue;
      }
      if (timestamp - lease.lastInputAt > GRAB_INPUT_TIMEOUT_MS) {
        this.releaseLease(lease, 'Grab timed out', true);
        continue;
      }
      if (lease.dirty && timestamp - lease.lastBroadcastAt >= MAX_BROADCAST_RATE_MS) {
        this.flush(lease, timestamp);
      }
    }
  }

  activeGrabs(): GrabState[] {
    return Array.from(this.byTarget.values()).map(lease => this.toState(lease));
  }

  /** Late joiners need to see avatars that are already in the air. */
  sendActive(socket: WebSocket): void {
    for (const grab of this.activeGrabs()) {
      this.broadcast.sendTo(socket, { type: 'grab_update', grab });
    }
  }

  private invalidReason(target: GrabTarget, session: AgentSession): string | null {
    if (session.activity === 'stopped') return 'Agent is no longer active';
    if (session.manualControl) return 'Agent is under manual control';
    return null;
  }

  private authorizedLease(
    socket: WebSocket,
    username: string | undefined,
    target: GrabTarget,
  ): GrabLease | undefined {
    if (!username) return undefined;
    const lease = this.bySocket.get(socket);
    if (!lease || lease.username !== username || grabKey(lease) !== grabKey(target)) return undefined;

    const session = this.state.get(lease.sessionId);
    const reason = session ? this.invalidReason(lease, session) : 'Agent is no longer active';
    if (reason) {
      this.releaseLease(lease, reason, true);
      return undefined;
    }
    return lease;
  }

  private flush(lease: GrabLease, timestamp: number): void {
    lease.dirty = false;
    lease.lastBroadcastAt = timestamp;
    this.broadcast.broadcastGrab(this.toState(lease));
  }

  private releaseLease(lease: GrabLease, reason: string, notifySocket: boolean): void {
    this.bySocket.delete(lease.socket);
    this.byTarget.delete(grabKey(lease));
    this.broadcast.broadcastGrabRelease(this.toTarget(lease), lease.x, lease.y, reason);
    if (notifySocket) {
      this.broadcast.sendTo(lease.socket, { type: 'grab_result', success: true, action: 'end', ...this.toTarget(lease) });
    }
  }

  private reject(socket: WebSocket, action: 'start' | 'end', error: string, target: GrabTarget): false {
    this.broadcast.sendTo(socket, { type: 'grab_result', success: false, action, error, ...target });
    return false;
  }

  private toTarget(lease: GrabLease): GrabTarget {
    return { sessionId: lease.sessionId };
  }

  private toState(lease: GrabLease): GrabState {
    return { ...this.toTarget(lease), username: lease.username, x: lease.x, y: lease.y };
  }
}
