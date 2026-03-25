import type { AgentSession, HookPayload, SubagentInfo, EffectType } from '../shared/types.js';
import {
  DEFAULT_AVATAR,
  STALE_SESSION_TIMEOUT_MS,
  STOPPED_REMOVAL_DELAY_MS,
  toolToActivity,
} from '../shared/constants.js';

export type StateChangeCallback = (
  type: 'update' | 'remove' | 'effect',
  data: { agent?: AgentSession; sessionId?: string; effect?: EffectType; effectData?: Record<string, unknown> },
) => void;

export class StateManager {
  private sessions = new Map<string, AgentSession>();
  private onChange: StateChangeCallback | null = null;

  onStateChange(cb: StateChangeCallback) {
    this.onChange = cb;
  }

  getAll(): AgentSession[] {
    return Array.from(this.sessions.values()).filter(s => s.activity !== 'stopped');
  }

  get(sessionId: string): AgentSession | undefined {
    return this.sessions.get(sessionId);
  }

  handleHookEvent(payload: HookPayload): void {
    const { hook_event_name, session_id } = payload;

    switch (hook_event_name) {
      case 'SessionStart':
        this.handleSessionStart(payload);
        break;
      case 'SessionEnd':
        this.handleSessionEnd(payload);
        break;
      case 'PreToolUse':
        this.handlePreToolUse(payload);
        break;
      case 'PostToolUse':
        this.handlePostToolUse(payload);
        break;
      case 'SubagentStart':
        this.handleSubagentStart(payload);
        break;
      case 'SubagentStop':
        this.handleSubagentStop(payload);
        break;
      case 'Stop':
        this.handleStop(payload);
        break;
      default:
        // Unknown event - update lastEventAt if session exists
        if (this.sessions.has(session_id)) {
          const session = this.sessions.get(session_id)!;
          session.lastEventAt = Date.now();
        }
        break;
    }
  }

  reapStale(): string[] {
    const now = Date.now();
    const reaped: string[] = [];
    for (const [id, session] of this.sessions) {
      if (now - session.lastEventAt > STALE_SESSION_TIMEOUT_MS) {
        this.sessions.delete(id);
        reaped.push(id);
        this.emit('remove', { sessionId: id });
      }
    }
    return reaped;
  }

  private handleSessionStart(payload: HookPayload): void {
    const now = Date.now();
    const existing = this.sessions.get(payload.session_id);

    if (existing) {
      // Session resumed - update identity and reset activity
      existing.username = payload.username || existing.username;
      existing.avatar = payload.avatar || existing.avatar;
      existing.cwd = payload.cwd || existing.cwd;
      existing.activity = 'idle';
      existing.currentTool = null;
      existing.currentToolInput = null;
      existing.lastEventAt = now;
      this.emit('update', { agent: existing });
    } else {
      const session: AgentSession = {
        sessionId: payload.session_id,
        username: payload.username || 'anonymous',
        avatar: payload.avatar || DEFAULT_AVATAR,
        cwd: payload.cwd || '',
        activity: 'idle',
        currentTool: null,
        currentToolInput: null,
        subagents: [],
        startedAt: now,
        lastEventAt: now,
      };
      this.sessions.set(payload.session_id, session);
      this.emit('update', { agent: session });
      this.emit('effect', {
        sessionId: payload.session_id,
        effect: 'session_start',
      });
    }
  }

  private handleSessionEnd(payload: HookPayload): void {
    const session = this.sessions.get(payload.session_id);
    if (!session) return;

    session.activity = 'stopped';
    session.currentTool = null;
    session.currentToolInput = null;
    session.lastEventAt = Date.now();
    this.emit('update', { agent: session });
    this.emit('effect', { sessionId: payload.session_id, effect: 'session_end' });

    // Remove after delay for exit animation
    setTimeout(() => {
      this.sessions.delete(payload.session_id);
      this.emit('remove', { sessionId: payload.session_id });
    }, STOPPED_REMOVAL_DELAY_MS);
  }

  private handlePreToolUse(payload: HookPayload): void {
    const session = this.ensureSession(payload);
    const toolName = payload.tool_name || 'unknown';

    session.activity = toolToActivity(toolName);
    session.currentTool = toolName;
    session.currentToolInput = payload.tool_input || null;
    session.lastEventAt = Date.now();

    this.emit('update', { agent: session });
    this.emit('effect', {
      sessionId: payload.session_id,
      effect: 'tool_start',
      effectData: { tool: toolName },
    });
  }

  private handlePostToolUse(payload: HookPayload): void {
    const session = this.ensureSession(payload);

    session.activity = 'thinking';
    session.currentTool = null;
    session.currentToolInput = null;
    session.lastEventAt = Date.now();

    this.emit('update', { agent: session });
    this.emit('effect', {
      sessionId: payload.session_id,
      effect: 'tool_complete',
      effectData: { tool: payload.tool_name },
    });
  }

  private handleSubagentStart(payload: HookPayload): void {
    const session = this.ensureSession(payload);
    const now = Date.now();

    const subagent: SubagentInfo = {
      agentId: payload.agent_id || `sub-${now}`,
      agentType: payload.agent_type || 'unknown',
      activity: 'thinking',
      startedAt: now,
    };

    session.subagents.push(subagent);
    session.lastEventAt = now;

    this.emit('update', { agent: session });
    this.emit('effect', {
      sessionId: payload.session_id,
      effect: 'subagent_spawn',
      effectData: { agentId: subagent.agentId, agentType: subagent.agentType },
    });
  }

  private handleSubagentStop(payload: HookPayload): void {
    const session = this.ensureSession(payload);
    const agentId = payload.agent_id;

    if (agentId) {
      session.subagents = session.subagents.filter(s => s.agentId !== agentId);
    } else {
      // No agent_id - remove the oldest subagent
      session.subagents.shift();
    }

    session.lastEventAt = Date.now();
    this.emit('update', { agent: session });
    this.emit('effect', {
      sessionId: payload.session_id,
      effect: 'subagent_despawn',
      effectData: { agentId },
    });
  }

  private handleStop(payload: HookPayload): void {
    const session = this.ensureSession(payload);
    session.activity = 'idle';
    session.currentTool = null;
    session.currentToolInput = null;
    session.lastEventAt = Date.now();
    this.emit('update', { agent: session });
  }

  /** Ensure a session exists (creates one if a hook fires before SessionStart) */
  private ensureSession(payload: HookPayload): AgentSession {
    let session = this.sessions.get(payload.session_id);
    if (!session) {
      session = {
        sessionId: payload.session_id,
        username: payload.username || 'anonymous',
        avatar: payload.avatar || DEFAULT_AVATAR,
        cwd: payload.cwd || '',
        activity: 'idle',
        currentTool: null,
        currentToolInput: null,
        subagents: [],
        startedAt: Date.now(),
        lastEventAt: Date.now(),
      };
      this.sessions.set(payload.session_id, session);
    }
    // Always update identity from payload
    if (payload.username) session.username = payload.username;
    if (payload.avatar) session.avatar = payload.avatar;
    if (payload.cwd) session.cwd = payload.cwd;
    return session;
  }

  private emit(
    type: 'update' | 'remove' | 'effect',
    data: { agent?: AgentSession; sessionId?: string; effect?: EffectType; effectData?: Record<string, unknown> },
  ) {
    this.onChange?.(type, data);
  }
}
