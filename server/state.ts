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
  private knownSessions = new Set<string>();
  private pendingRemovals = new Map<string, ReturnType<typeof setTimeout>>();
  private onChange: StateChangeCallback | null = null;
  private sessionNameLookup: ((id: string) => string | undefined) | null = null;
  private sessionAliveCheck: ((id: string) => boolean) | null = null;

  setSessionNameLookup(fn: (id: string) => string | undefined) {
    this.sessionNameLookup = fn;
  }

  setSessionAliveCheck(fn: (id: string) => boolean) {
    this.sessionAliveCheck = fn;
  }

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
      case 'PermissionRequest':
        this.handlePermissionRequest(payload);
        break;
      case 'Stop':
        this.handleStop(payload);
        break;
      case 'UserPromptSubmit': {
        const s = this.ensureSession(payload);
        if (!s) break;
        s.activity = 'thinking';
        s.currentTool = null;
        s.currentToolInput = null;

        const userPrompt = (payload.user_prompt ?? payload.prompt) as string | undefined;
        if (userPrompt) {
          const renameMatch = userPrompt.match(/^\/rename\s+(.+)/);
          if (renameMatch) {
            s.sessionName = renameMatch[1].trim();
          } else if (!userPrompt.startsWith('/')) {
            s.lastPrompt = userPrompt.slice(0, 200);
          }
        }

        console.log(`[state] PROMPT_RECEIVED: id=${payload.session_id} user=${s.username} prompt="${(userPrompt || '').slice(0, 50)}"`);
        this.touchAndEmit(payload, 'prompt_received');
        break;
      }
      case 'PostToolUseFailure': {
        const s = this.ensureSession(payload);
        if (!s) break;
        s.activity = 'thinking';
        s.currentTool = null;
        s.currentToolInput = null;
        console.log(`[state] TOOL_FAILURE: id=${payload.session_id} tool=${payload.tool_name} reason=${payload.reason}`);
        this.touchAndEmit(payload, 'error', { tool: payload.tool_name, reason: payload.reason });
        break;
      }
      case 'StopFailure': {
        const s = this.ensureSession(payload);
        if (!s) break;
        s.activity = 'idle';
        s.currentTool = null;
        s.currentToolInput = null;
        console.log(`[state] STOP_FAILURE: id=${payload.session_id} reason=${payload.reason || 'API error'}`);
        this.touchAndEmit(payload, 'error', { reason: payload.reason || 'API error' });
        break;
      }
      case 'Notification':
        this.touchAndEmit(payload, 'notification', { message: (payload as Record<string, unknown>).message });
        break;
      case 'TaskCompleted':
        this.touchAndEmit(payload, 'task_completed');
        break;
      case 'InstructionsLoaded':
        this.touchAndEmit(payload, 'info_flash', { type: 'instructions' });
        break;
      case 'ConfigChange':
        this.touchAndEmit(payload, 'info_flash', { type: 'config' });
        break;
      case 'CwdChanged': {
        const s = this.ensureSession(payload);
        if (!s) break;
        s.cwd = payload.cwd;
        this.touchAndEmit(payload, 'info_flash', { type: 'cwd', cwd: payload.cwd });
        break;
      }
      case 'FileChanged':
        this.touchAndEmit(payload, 'info_flash', { type: 'file_changed' });
        break;
      case 'WorktreeCreate': {
        const s = this.ensureSession(payload);
        if (!s) break;
        s.sessionName = (payload.tool_input?.name as string) || (payload as Record<string, unknown>).name as string || 'worktree';
        this.touchAndEmit(payload, 'worktree_create');
        break;
      }
      case 'WorktreeRemove': {
        const s = this.ensureSession(payload);
        if (!s) break;
        s.sessionName = undefined;
        this.touchAndEmit(payload, 'worktree_remove');
        break;
      }
      case 'PreCompact': {
        const s = this.ensureSession(payload);
        if (!s) break;
        s.activity = 'compacting';
        console.log(`[state] COMPACT_START: id=${payload.session_id} user=${s.username}`);
        this.touchAndEmit(payload, 'compact', { phase: 'pre' });
        break;
      }
      case 'PostCompact': {
        const s = this.ensureSession(payload);
        if (!s) break;
        s.activity = 'thinking';
        console.log(`[state] COMPACT_END: id=${payload.session_id} user=${s.username}`);
        this.touchAndEmit(payload, 'compact', { phase: 'post' });
        break;
      }
      case 'TeammateIdle':
        this.touchAndEmit(payload, 'notification', { message: 'teammate idle', type: 'teammate_idle' });
        break;
      case 'Elicitation': {
        const s = this.ensureSession(payload);
        if (!s) break;
        s.activity = 'waiting';
        s.currentTool = null;
        s.currentToolInput = null;
        console.log(`[state] ELICITATION: id=${payload.session_id} user=${s.username} activity=waiting`);
        this.touchAndEmit(payload, 'elicitation', { type: 'mcp_input' });
        break;
      }
      case 'ElicitationResult': {
        const s = this.ensureSession(payload);
        if (!s) break;
        s.activity = 'thinking';
        console.log(`[state] ELICITATION_RESULT: id=${payload.session_id} user=${s.username} activity=thinking`);
        this.touchAndEmit(payload, 'prompt_received');
        break;
      }
      default:
        // Unknown event - update lastEventAt if session exists
        if (this.sessions.has(session_id)) {
          const session = this.sessions.get(session_id)!;
          session.lastEventAt = Date.now();
        }
        break;
    }
  }

  findSessionByUsername(username: string): AgentSession | undefined {
    let best: AgentSession | undefined;
    for (const session of this.sessions.values()) {
      if (session.username === username && session.activity !== 'stopped') {
        if (!best || session.lastEventAt > best.lastEventAt) {
          best = session;
        }
      }
    }
    return best;
  }

  updateSessionName(sessionId: string, name: string): void {
    const session = this.sessions.get(sessionId);
    if (session && session.sessionName !== name) {
      session.sessionName = name;
      // Use registry name as task description if none was explicitly set
      if (!session.taskDescription) {
        session.taskDescription = name.replace(/-/g, ' ');
      }
      session.lastEventAt = Date.now();
      this.emit('update', { agent: session });
    }
  }

  /** Recover or create a session from the Claude session registry.
   *  Called when the registry watcher discovers a session file that
   *  doesn't correspond to any session in the state manager. */
  recoverSessionFromRegistry(sessionId: string, cwd: string, name?: string): void {
    this.knownSessions.add(sessionId);
    const existing = this.sessions.get(sessionId);
    if (existing) {
      // Session already exists — just update name if provided
      if (name && existing.sessionName !== name) {
        existing.sessionName = name;
        if (!existing.taskDescription) {
          existing.taskDescription = name.replace(/-/g, ' ');
        }
        existing.lastEventAt = Date.now();
        this.emit('update', { agent: existing });
      }
      return;
    }

    const now = Date.now();
    const session: AgentSession = {
      sessionId,
      username: 'anonymous',
      avatar: DEFAULT_AVATAR,
      cwd,
      activity: 'idle',
      currentTool: null,
      currentToolInput: null,
      subagents: [],
      startedAt: now,
      lastEventAt: now,
    };
    if (name) {
      session.sessionName = name;
      session.taskDescription = name.replace(/-/g, ' ');
    }

    console.log(`[state] RECOVERED session from registry: id=${sessionId} name=${name || '(none)'}`);
    this.sessions.set(sessionId, session);
    this.emit('update', { agent: session });
  }

  /** Restore sessions from persisted state (e.g. after server restart). */
  restoreSessions(sessions: AgentSession[]): void {
    let restored = 0;
    for (const session of sessions) {
      if (session.activity === 'stopped') continue;
      if (this.sessions.has(session.sessionId)) continue;

      // Reset transient state
      session.lastEventAt = Date.now();
      session.currentTool = null;
      session.currentToolInput = null;
      session.activity = 'idle';
      session.subagents = [];

      this.knownSessions.add(session.sessionId);
      this.sessions.set(session.sessionId, session);
      restored++;
    }
    if (restored > 0) {
      console.log(`[state] Restored ${restored} session(s) from disk`);
    }
  }

  emitUpdate(session: AgentSession): void {
    this.emit('update', { agent: session });
  }

  emitEmote(sessionId: string, emote: string): void {
    console.log(`[state] EMOTE: sessionId=${sessionId} emote=${emote}`);
    this.emit('effect', {
      sessionId,
      effect: 'emote' as EffectType,
      effectData: { emote },
    });
  }

  reapStale(): string[] {
    const now = Date.now();
    const reaped: string[] = [];
    for (const [id, session] of this.sessions) {
      if (now - session.lastEventAt > STALE_SESSION_TIMEOUT_MS) {
        // Don't reap sessions that are still alive in Claude's session registry
        if (this.sessionAliveCheck?.(id)) {
          // Touch to prevent checking every reaper cycle
          session.lastEventAt = now;
          continue;
        }
        this.sessions.delete(id);
        // Don't clear knownSessions — allow the session to be re-created
        // by ensureSession() if it sends hooks later (e.g. user resumes work)
        reaped.push(id);
        this.emit('remove', { sessionId: id });
      }
    }
    return reaped;
  }

  private handleSessionStart(payload: HookPayload): void {
    const now = Date.now();

    // Cancel any pending removal from a previous SessionEnd so it doesn't
    // delete the session we're about to (re-)create.
    const pendingTimer = this.pendingRemovals.get(payload.session_id);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.pendingRemovals.delete(payload.session_id);
    }

    this.knownSessions.add(payload.session_id);
    const existing = this.sessions.get(payload.session_id);

    if (existing && existing.activity === 'stopped') {
      // Session is resuming after a SessionEnd — remove first so the client
      // goes through the tombstone → zombie resurrection path.
      this.sessions.delete(payload.session_id);
      this.emit('remove', { sessionId: payload.session_id });
      // Fall through to create a fresh session below
    } else if (existing) {
      // Session resumed (wasn't stopped) — update in place
      const prevActivity = existing.activity;
      existing.username = payload.username || existing.username;
      existing.avatar = payload.avatar || existing.avatar;
      existing.cwd = payload.cwd || existing.cwd;
      existing.activity = 'idle';
      existing.currentTool = null;
      existing.currentToolInput = null;
      existing.lastEventAt = now;
      console.log(`[state] SESSION_RESUME: id=${payload.session_id} user=${existing.username} activity=idle (was=${prevActivity})`);
      this.emit('update', { agent: existing });
      return;
    }

    {
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
      // Seed session name from Claude's session registry
      const registryName = this.sessionNameLookup?.(payload.session_id);
      if (registryName) {
        session.sessionName = registryName;
        if (!session.taskDescription) {
          session.taskDescription = registryName.replace(/-/g, ' ');
        }
      }

      console.log(`[state] NEW session via SessionStart: id=${payload.session_id} user=${payload.username}`);
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
    console.log(`[state] SESSION_END: id=${payload.session_id} user=${session.username} was=${session.activity}`);

    session.activity = 'stopped';
    session.currentTool = null;
    session.currentToolInput = null;
    session.lastEventAt = Date.now();
    this.emit('update', { agent: session });
    this.emit('effect', { sessionId: payload.session_id, effect: 'session_end' });

    // Remove after delay for exit animation (cancellable if session resumes)
    const timer = setTimeout(() => {
      this.pendingRemovals.delete(payload.session_id);
      this.sessions.delete(payload.session_id);
      // Don't clear knownSessions — allow the session to be re-created
      // by ensureSession() if the user resumes work later
      console.log(`[state] SESSION_REMOVED: id=${payload.session_id} (after ${STOPPED_REMOVAL_DELAY_MS}ms delay)`);
      this.emit('remove', { sessionId: payload.session_id });
    }, STOPPED_REMOVAL_DELAY_MS);
    this.pendingRemovals.set(payload.session_id, timer);
  }

  private handlePreToolUse(payload: HookPayload): void {
    const session = this.ensureSession(payload);
    if (!session) return;
    const toolName = payload.tool_name || 'unknown';

    session.activity = toolToActivity(toolName);
    session.currentTool = toolName;
    session.currentToolInput = payload.tool_input || null;
    session.lastEventAt = Date.now();
    session.toolUseCount = (session.toolUseCount ?? 0) + 1;
    console.log(`[state] TOOL_START: id=${payload.session_id} user=${session.username} tool=${toolName} activity=${session.activity}`);

    if (toolName === 'EnterPlanMode') {
      session.sessionName = 'Planning';
    }

    this.emit('update', { agent: session });
    this.emit('effect', {
      sessionId: payload.session_id,
      effect: 'tool_start',
      effectData: { tool: toolName },
    });
  }

  private handlePostToolUse(payload: HookPayload): void {
    const session = this.ensureSession(payload);
    if (!session) return;
    const toolName = payload.tool_name;

    session.activity = 'thinking';
    session.currentTool = null;
    session.currentToolInput = null;
    session.lastEventAt = Date.now();
    console.log(`[state] TOOL_COMPLETE: id=${payload.session_id} user=${session.username} tool=${payload.tool_name} activity=${session.activity}`);

    if (toolName === 'EnterWorktree') {
      const name = payload.tool_input?.name;
      if (typeof name === 'string') session.sessionName = name;
    } else if (toolName === 'ExitPlanMode') {
      session.sessionName = undefined;
      session.activity = 'waiting';
    }

    this.emit('update', { agent: session });
    this.emit('effect', {
      sessionId: payload.session_id,
      effect: 'tool_complete',
      effectData: { tool: payload.tool_name },
    });

    // Detect git commit / PR merge from Bash commands
    if (toolName === 'Bash') {
      const cmd = String(payload.tool_input?.command ?? '');
      if (/git\s+commit\b/.test(cmd)) {
        this.emit('effect', { sessionId: payload.session_id, effect: 'commit' });
      } else if (/gh\s+pr\s+merge\b|git\s+merge\b/.test(cmd)) {
        this.emit('effect', { sessionId: payload.session_id, effect: 'pr_merge' });
      }
    }
  }

  private handleSubagentStart(payload: HookPayload): void {
    const session = this.ensureSession(payload);
    if (!session) return;
    const now = Date.now();
    const subagent: SubagentInfo = {
      agentId: payload.agent_id || `sub-${now}`,
      agentType: payload.agent_type || 'unknown',
      activity: 'thinking',
      startedAt: now,
    };

    session.subagents.push(subagent);
    session.lastEventAt = now;
    console.log(`[state] SUBAGENT_START: parent=${payload.session_id} agentId=${subagent.agentId} type=${subagent.agentType} total=${session.subagents.length}`);

    this.emit('update', { agent: session });
    this.emit('effect', {
      sessionId: payload.session_id,
      effect: 'subagent_spawn',
      effectData: { agentId: subagent.agentId, agentType: subagent.agentType },
    });
  }

  private handleSubagentStop(payload: HookPayload): void {
    const session = this.ensureSession(payload);
    if (!session) return;
    const agentId = payload.agent_id;

    if (agentId) {
      session.subagents = session.subagents.filter(s => s.agentId !== agentId);
    } else {
      // No agent_id - remove the oldest subagent
      session.subagents.shift();
    }

    session.lastEventAt = Date.now();
    console.log(`[state] SUBAGENT_STOP: parent=${payload.session_id} agentId=${agentId} remaining=${session.subagents.length}`);
    this.emit('update', { agent: session });
    this.emit('effect', {
      sessionId: payload.session_id,
      effect: 'subagent_despawn',
      effectData: { agentId },
    });
  }

  private handlePermissionRequest(payload: HookPayload): void {
    const session = this.ensureSession(payload);
    if (!session) return;
    const prevActivity = session.activity;
    session.activity = 'waiting';
    session.currentTool = null;
    session.currentToolInput = null;
    session.lastEventAt = Date.now();
    console.log(`[state] PERMISSION_REQUEST: id=${payload.session_id} user=${session.username} was=${prevActivity}`);
    this.emit('update', { agent: session });
    this.emit('effect', { sessionId: payload.session_id, effect: 'elicitation', effectData: { type: 'permission' } });
  }

  private handleStop(payload: HookPayload): void {
    const session = this.ensureSession(payload);
    if (!session) return;
    // Preserve 'waiting' — agent is at the help desk waiting for user input
    if (session.activity !== 'waiting') {
      session.activity = 'idle';
    }
    session.currentTool = null;
    session.currentToolInput = null;
    session.lastEventAt = Date.now();
    console.log(`[state] STOP: id=${payload.session_id} user=${session.username} activity=${session.activity} preserved=${session.activity === 'waiting'}`);
    this.emit('update', { agent: session });
  }

  /** Ensure a session exists (creates one if a hook fires before SessionStart).
   *  Returns null for session_ids that never had a SessionStart — these are
   *  subagent-owned hooks and should not create phantom top-level sessions. */
  private ensureSession(payload: HookPayload): AgentSession | null {
    // Cancel any pending removal — this session is clearly still alive
    const pendingTimer = this.pendingRemovals.get(payload.session_id);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.pendingRemovals.delete(payload.session_id);
    }

    let session = this.sessions.get(payload.session_id);
    if (!session) {
      if (!this.knownSessions.has(payload.session_id)) {
        // Fallback: check if session is still alive in Claude's registry
        if (this.sessionAliveCheck?.(payload.session_id)) {
          this.knownSessions.add(payload.session_id);
          console.log(`[state] RECOVERED session from registry: id=${payload.session_id} event=${payload.hook_event_name}`);
        } else {
          console.log(`[state] REJECTED phantom session: id=${payload.session_id} event=${payload.hook_event_name}`);
          return null;
        }
      }
      console.log(`[state] NEW session via ensureSession: id=${payload.session_id} event=${payload.hook_event_name}`);
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

  /** Update lastEventAt, broadcast state + effect in one call. */
  private touchAndEmit(payload: HookPayload, effect: EffectType, data?: Record<string, unknown>): void {
    const session = this.ensureSession(payload);
    if (!session) return;
    session.lastEventAt = Date.now();
    console.log(`[state] EFFECT: id=${payload.session_id} effect=${effect}${data ? ' data=' + JSON.stringify(data) : ''}`);
    this.emit('update', { agent: session });
    this.emit('effect', { sessionId: payload.session_id, effect, effectData: data });
  }

  private emit(
    type: 'update' | 'remove' | 'effect',
    data: { agent?: AgentSession; sessionId?: string; effect?: EffectType; effectData?: Record<string, unknown> },
  ) {
    this.onChange?.(type, data);
  }
}
