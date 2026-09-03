import type Phaser from 'phaser';
import type { GrabTarget, WSMessageToClient } from '@shared/types';
import { GRAB_HEARTBEAT_MS, GRAB_INPUT_TIMEOUT_MS } from '@shared/constants';
import type { AuthManager } from '../auth/AuthManager';
import type { SocketClient } from '../network/socket';
import { GRAB_DRAG_THRESHOLD } from './physics';
import type { Point } from './physics';

const MOVE_SEND_INTERVAL_MS = 50; // pointer updates to the server, at most 20/s
const GRABBING_CLASS = 'is-grabbing';

interface PointerLike {
  id: number;
  worldX: number;
  worldY: number;
}

interface Press {
  target: GrabTarget;
  pointerId: number;
  start: Point;
}

interface ActiveGrab {
  target: GrabTarget;
  pointerId: number;
  pointer: Point;
  /** The server has granted the lease; until then we only track the pointer. */
  confirmed: boolean;
}

/** The slice of the Phaser scene this manager touches, so it can run without a canvas in tests. */
export interface GrabScene {
  input: {
    on(event: string, fn: (...args: never[]) => void): unknown;
    off(event: string, fn: (...args: never[]) => void): unknown;
  };
}

/** The slice of AgentManager this manager drives. */
export interface GrabAgents {
  readonly isVortexActive: boolean;
  resolveGrabTarget(gameObject: Phaser.GameObjects.GameObject): GrabTarget | null;
  hasGrabTarget(target: GrabTarget): boolean;
  beginGrab(target: GrabTarget, pointer: Point): boolean;
  applyRemoteGrab(target: GrabTarget, pointer: Point): void;
  moveGrab(target: GrabTarget, pointer: Point): void;
  releaseGrab(target: GrabTarget, pointer: Point): void;
  workstationDropSlot(target: GrabTarget): number | undefined;
  showGrabHint(target: GrabTarget, text: string): void;
}

export function sameGrabTarget(a: GrabTarget, b: GrabTarget): boolean {
  return a.sessionId === b.sessionId;
}

function grabKeyOf(target: GrabTarget): string {
  return target.sessionId;
}

function targetOf(msg: { sessionId: string }): GrabTarget {
  return { sessionId: msg.sessionId };
}

/**
 * Turns pointer gestures on avatars into grab leases. A press becomes a grab once the pointer
 * travels a few pixels; the server confirms the lease before the avatar lifts; every release path
 * (pointer up, pointer cancel, window blur, tab hidden, logout, reconnect, vortex) lets go.
 * Remote grabs arrive as grab_update/grab_release and are mirrored onto the same sprites.
 *
 * The server keeps
 * flushing our own pointer for up to one broadcast interval after we send grab_end, so a
 * released target stays on a short "ours" list until its grab_release arrives. Any
 * grab_update for it in that window is our own echo, not a second viewer, and is dropped.
 */
export class GrabManager {
  private press: Press | null = null;
  private active: ActiveGrab | null = null;
  /** Targets we released whose grab_release has not come back yet, with the release time. */
  private releasedPending = new Map<string, number>();
  private lastMoveSentAt = 0;
  private heartbeat: ReturnType<typeof setInterval>;
  private onGameObjectDown = (pointer: PointerLike, gameObject: Phaser.GameObjects.GameObject) => this.handlePress(pointer, gameObject);
  private onPointerMove = (pointer: PointerLike) => this.handleMove(pointer);
  private onPointerUp = (pointer: PointerLike) => this.handleUp(pointer);
  private onWindowCancel = () => this.release();
  private onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') this.release();
  };

  constructor(
    private scene: GrabScene,
    private auth: Pick<AuthManager, 'isLoggedIn'>,
    private socket: Pick<SocketClient, 'send'>,
    private agents: GrabAgents,
    private now: () => number = () => Date.now(),
  ) {
    scene.input.on('gameobjectdown', this.onGameObjectDown as (...args: never[]) => void);
    scene.input.on('pointermove', this.onPointerMove as (...args: never[]) => void);
    scene.input.on('pointerup', this.onPointerUp as (...args: never[]) => void);
    scene.input.on('pointerupoutside', this.onPointerUp as (...args: never[]) => void);
    window.addEventListener('blur', this.onWindowCancel);
    window.addEventListener('pointercancel', this.onWindowCancel);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.heartbeat = setInterval(() => this.sendMove(true), GRAB_HEARTBEAT_MS);
  }

  /** The avatar this browser is currently lifting, if any. */
  get holding(): GrabTarget | null {
    return this.active?.target ?? null;
  }

  handleMessage(message: WSMessageToClient): void {
    if (message.type === 'grab_result') {
      const target = targetOf(message);
      if (message.action !== 'start') {
        if (!message.success && message.error && this.isOwnEcho(target)) this.agents.showGrabHint(target, message.error);
        return;
      }
      if (!this.active || this.active.confirmed || !sameGrabTarget(this.active.target, target)) return;
      if (message.success) {
        this.active.confirmed = true;
        document.body.classList.add(GRABBING_CLASS);
        this.agents.beginGrab(target, this.active.pointer);
        this.sendMove(true);
      } else {
        this.active = null;
        this.agents.showGrabHint(target, message.error || 'Unable to grab');
      }
    } else if (message.type === 'grab_update') {
      const target = targetOf(message.grab);
      // Our own lease echoes back; the local pointer stays authoritative for zero latency.
      if (this.active?.confirmed && sameGrabTarget(this.active.target, target)) return;
      // A late echo of the pointer we just let go of must not re-lift the avatar under a claw.
      if (this.isOwnEcho(target)) return;
      this.agents.applyRemoteGrab(target, { x: message.grab.x, y: message.grab.y });
    } else if (message.type === 'grab_release') {
      const target = targetOf(message);
      this.releasedPending.delete(grabKeyOf(target));
      if (this.active && sameGrabTarget(this.active.target, target)) this.clearActive();
      this.agents.releaseGrab(target, { x: message.x, y: message.y });
    }
  }

  /** The socket (re)connected: whatever lease we held died with the old connection. */
  handleConnected(): void {
    this.releasedPending.clear(); // the new socket cannot receive echoes of the old lease
    if (!this.active) return;
    const active = this.active;
    this.clearActive();
    if (active.confirmed) this.agents.releaseGrab(active.target, active.pointer);
  }

  handleLoggedOut(): void {
    this.release();
  }

  /** Per-frame hygiene: let go if the room went into a vortex or the avatar vanished. */
  update(): void {
    this.pruneReleased();
    if (!this.active) return;
    if (this.agents.isVortexActive || !this.agents.hasGrabTarget(this.active.target)) this.release();
  }

  release(point?: Point): void {
    if (!this.active) return;
    const active = this.active;
    this.clearActive();
    const pointer = point ?? active.pointer;
    this.releasedPending.set(grabKeyOf(active.target), this.now());
    const workstationSlot = active.confirmed
      ? this.agents.workstationDropSlot(active.target)
      : undefined;
    // An unconfirmed grab still sends grab_end so a late server accept is released right away.
    this.socket.send({
      type: 'grab_end',
      ...active.target,
      x: pointer.x,
      y: pointer.y,
      ...(workstationSlot === undefined ? {} : { workstationSlot }),
    });
    if (active.confirmed) this.agents.releaseGrab(active.target, pointer);
  }

  destroy(): void {
    this.release();
    clearInterval(this.heartbeat);
    this.scene.input.off('gameobjectdown', this.onGameObjectDown as (...args: never[]) => void);
    this.scene.input.off('pointermove', this.onPointerMove as (...args: never[]) => void);
    this.scene.input.off('pointerup', this.onPointerUp as (...args: never[]) => void);
    this.scene.input.off('pointerupoutside', this.onPointerUp as (...args: never[]) => void);
    window.removeEventListener('blur', this.onWindowCancel);
    window.removeEventListener('pointercancel', this.onWindowCancel);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private handlePress(pointer: PointerLike, gameObject: Phaser.GameObjects.GameObject): void {
    if (this.active || this.press || this.agents.isVortexActive) return;
    const target = this.agents.resolveGrabTarget(gameObject);
    if (!target) return;
    this.press = { target, pointerId: pointer.id, start: { x: pointer.worldX, y: pointer.worldY } };
  }

  private handleMove(pointer: PointerLike): void {
    const point = { x: pointer.worldX, y: pointer.worldY };
    if (this.press && this.press.pointerId === pointer.id) {
      const travelled = Math.hypot(point.x - this.press.start.x, point.y - this.press.start.y);
      if (travelled >= GRAB_DRAG_THRESHOLD) this.startGrab(point);
    }
    if (this.active && this.active.pointerId === pointer.id) {
      this.active.pointer = point;
      if (this.active.confirmed) {
        this.agents.moveGrab(this.active.target, point);
        this.sendMove(false);
      }
    }
  }

  private handleUp(pointer: PointerLike): void {
    if (this.press && this.press.pointerId === pointer.id) this.press = null;
    if (this.active && this.active.pointerId === pointer.id) {
      this.release({ x: pointer.worldX, y: pointer.worldY });
    }
  }

  private startGrab(point: Point): void {
    const press = this.press;
    this.press = null;
    if (!press) return;
    if (!this.auth.isLoggedIn) {
      this.agents.showGrabHint(press.target, 'LOG IN TO GRAB');
      return;
    }
    this.active = { target: press.target, pointerId: press.pointerId, pointer: point, confirmed: false };
    this.socket.send({ type: 'grab_start', ...press.target, x: point.x, y: point.y });
  }

  private sendMove(force: boolean): void {
    if (!this.active?.confirmed) return;
    const now = this.now();
    if (!force && now - this.lastMoveSentAt < MOVE_SEND_INTERVAL_MS) return;
    this.lastMoveSentAt = now;
    this.socket.send({
      type: 'grab_move',
      ...this.active.target,
      x: this.active.pointer.x,
      y: this.active.pointer.y,
    });
  }

  private clearActive(): void {
    this.active = null;
    document.body.classList.remove(GRABBING_CLASS);
  }

  private isOwnEcho(target: GrabTarget): boolean {
    this.pruneReleased();
    return this.releasedPending.has(grabKeyOf(target));
  }

  /** The server drops a silent lease after GRAB_INPUT_TIMEOUT_MS, so nothing older can be our echo. */
  private pruneReleased(): void {
    if (this.releasedPending.size === 0) return;
    const now = this.now();
    for (const [key, releasedAt] of this.releasedPending) {
      if (now - releasedAt > GRAB_INPUT_TIMEOUT_MS) this.releasedPending.delete(key);
    }
  }
}
