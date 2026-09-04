import type Phaser from 'phaser';
import type { AgentSession, ControlInputState, WSMessageToClient } from '@shared/types';
import type { AuthManager } from '../auth/AuthManager';
import type { SocketClient } from '../network/socket';
import type { AgentManager } from '../systems/AgentManager';
import { AgentControlOverlay } from '../ui/AgentControlOverlay';
import { EmoteWheel } from '../ui/EmoteWheel';
import { isEditableTarget } from './input';

const STORAGE_KEY_SESSION = 'af_controlled_session';
const HEARTBEAT_MS = 500;

const EMPTY_INPUT: ControlInputState = {
  up: false,
  down: false,
  left: false,
  right: false,
};

export class ControlManager {
  private overlay: AgentControlOverlay;
  private wheel: EmoteWheel;
  private ownerId: string | null = null;
  private activeSessionId: string | null = null;
  private preferredSessionId = localStorage.getItem(STORAGE_KEY_SESSION);
  private input: ControlInputState = { ...EMPTY_INPUT };
  private reclaimAttempted = false;
  private ownedAgentsSignature = '';
  private heartbeat: ReturnType<typeof setInterval>;
  private keyDownHandler = (event: KeyboardEvent) => this.onKeyDown(event);
  private keyUpHandler = (event: KeyboardEvent) => this.onKeyUp(event);
  private blurHandler = () => this.stopMovement();

  constructor(
    scene: Phaser.Scene,
    private auth: AuthManager,
    private socket: SocketClient,
    private agents: AgentManager,
  ) {
    this.wheel = new EmoteWheel(scene);
    this.overlay = new AgentControlOverlay(
      sessionId => this.claim(sessionId),
      () => this.release(),
    );
    document.addEventListener('keydown', this.keyDownHandler);
    document.addEventListener('keyup', this.keyUpHandler);
    window.addEventListener('blur', this.blurHandler);
    this.heartbeat = setInterval(() => {
      if (this.activeSessionId) this.sendInput();
    }, HEARTBEAT_MS);
  }

  get selectedSessionId(): string | null {
    return this.activeSessionId;
  }

  handleAuthenticated(username: string, ownerId: string): void {
    this.ownerId = ownerId;
    this.reclaimAttempted = false;
    this.ownedAgentsSignature = '';
    this.activeSessionId = null;
    this.agents.setLocallyControlledSession(null);
    this.overlay.setAuthenticated(username);
    this.overlay.setControlled(null);
    this.refreshOwnedAgents();
  }

  handleLoggedOut(): void {
    this.stopMovement();
    this.wheel.hide();
    this.ownerId = null;
    this.activeSessionId = null;
    this.reclaimAttempted = false;
    this.ownedAgentsSignature = '';
    this.agents.setLocallyControlledSession(null);
    this.overlay.setAuthenticated(null);
  }

  handleStateChanged(): void {
    if (!this.ownerId) return;
    const owned = this.ownedAgents();
    if (this.activeSessionId && !owned.some(agent => agent.sessionId === this.activeSessionId)) {
      this.clearActiveSession(false);
    }
    const signature = owned
      .map(agent => [agent.sessionId, agent.sessionName, agent.cwd, agent.activity].join('|'))
      .sort()
      .join('::');
    if (signature !== this.ownedAgentsSignature) {
      this.ownedAgentsSignature = signature;
      this.overlay.updateAgents(owned, this.activeSessionId || this.preferredSessionId);
    }

    if (!this.reclaimAttempted) {
      this.reclaimAttempted = true;
      const preferred = this.preferredSessionId;
      if (preferred && owned.some(agent => agent.sessionId === preferred)) {
        this.claim(preferred);
      }
    }
  }

  handleMessage(message: WSMessageToClient): void {
    if (message.type === 'control_result') {
      if (message.success && message.action === 'claim' && message.sessionId) {
        this.activeSessionId = message.sessionId;
        this.preferredSessionId = message.sessionId;
        localStorage.setItem(STORAGE_KEY_SESSION, message.sessionId);
        this.agents.setLocallyControlledSession(message.sessionId);
        this.overlay.setControlled(message.sessionId);
      } else if (message.success && message.action === 'release') {
        if (!message.sessionId || message.sessionId === this.activeSessionId) {
          this.clearActiveSession(true);
        }
      } else if (!message.success) {
        this.overlay.showError(message.error || 'Unable to control that agent.');
      }
    } else if (message.type === 'control_revoked') {
      if (message.sessionId === this.activeSessionId) {
        this.clearActiveSession(true);
        this.overlay.showError(message.reason);
      }
    }
  }

  release(): void {
    if (!this.activeSessionId) return;
    const sessionId = this.activeSessionId;
    this.stopMovement();
    this.socket.send({ type: 'control_release', sessionId });
    this.clearActiveSession(true);
  }

  destroy(): void {
    clearInterval(this.heartbeat);
    document.removeEventListener('keydown', this.keyDownHandler);
    document.removeEventListener('keyup', this.keyUpHandler);
    window.removeEventListener('blur', this.blurHandler);
    this.wheel.hide();
  }

  private claim(sessionId: string): void {
    if (!this.auth.isLoggedIn || !this.ownerId) return;
    if (sessionId === this.activeSessionId) return;
    this.stopMovement();
    this.socket.send({ type: 'control_claim', sessionId });
  }

  private refreshOwnedAgents(): void {
    this.ownedAgentsSignature = '';
    this.handleStateChanged();
  }

  private ownedAgents(): AgentSession[] {
    if (!this.ownerId) return [];
    return this.agents.getSessions().filter(
      agent => agent.ownerId === this.ownerId && agent.activity !== 'stopped',
    );
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.wheel.isOpen) {
      if (this.wheel.handleKey(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (!this.activeSessionId || isEditableTarget(event.target)) return;

    if (event.code === 'KeyB' && !event.repeat) {
      event.preventDefault();
      this.stopMovement();
      const sessionId = this.activeSessionId;
      this.wheel.show(emote => {
        if (this.activeSessionId === sessionId) {
          this.socket.send({ type: 'emote', emote, sessionId });
        }
      });
      return;
    }
    if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      this.socket.send({ type: 'shoot', sessionId: this.activeSessionId });
      return;
    }
    if (event.code === 'Escape' && !event.repeat) {
      event.preventDefault();
      this.release();
      return;
    }

    const changed = this.setMovementKey(event.code, true);
    if (changed) {
      event.preventDefault();
      this.sendInput();
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (!this.activeSessionId) return;
    const changed = this.setMovementKey(event.code, false);
    if (changed) {
      event.preventDefault();
      this.sendInput();
    }
  }

  private setMovementKey(code: string, pressed: boolean): boolean {
    const key = ({
      KeyW: 'up',
      KeyS: 'down',
      KeyA: 'left',
      KeyD: 'right',
    } as const)[code as 'KeyW' | 'KeyS' | 'KeyA' | 'KeyD'];
    if (!key || this.input[key] === pressed) return false;
    this.input[key] = pressed;
    return true;
  }

  private sendInput(): void {
    if (!this.activeSessionId) return;
    this.socket.send({
      type: 'control_input',
      sessionId: this.activeSessionId,
      input: { ...this.input },
    });
  }

  private stopMovement(): void {
    const wasMoving = Object.values(this.input).some(Boolean);
    this.input = { ...EMPTY_INPUT };
    if (wasMoving && this.activeSessionId) this.sendInput();
  }

  private clearActiveSession(clearPreference: boolean): void {
    this.stopMovement();
    this.wheel.hide();
    this.activeSessionId = null;
    this.agents.setLocallyControlledSession(null);
    this.overlay.setControlled(null);
    if (clearPreference) {
      this.preferredSessionId = null;
      localStorage.removeItem(STORAGE_KEY_SESSION);
    }
  }
}
