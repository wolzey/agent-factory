import { randomUUID } from 'node:crypto';
import type {
  AgentSession,
  ChatMessage,
  EffectType,
  EnvironmentType,
  FacingDirection,
  GlobalEffectType,
  HookPayload,
  ManualControlState,
  Position,
  SubagentInfo,
  TimedWorldEvent,
  TombstoneState,
  WorldAgent,
  WorldChange,
  WorldDelta,
  WorldSnapshot,
} from '../shared/types.js';
import { isInShotCorridor } from '../shared/world-geometry.js';
import { positionAt, slotPosition, WORLD_LAYOUTS, zoneForActivity } from '../shared/world-layouts.js';
import {
  DEFAULT_AVATAR,
  MAX_BROADCAST_RATE_MS,
  RESUME_RESPAWN_THRESHOLD_MS,
  STALE_SESSION_TIMEOUT_MS,
  STOPPED_REMOVAL_DELAY_MS,
  TOMBSTONE_DURATION_MS,
  toolToActivity,
} from '../shared/constants.js';
import { scrubLegacyAgentFields } from './hook-payload.js';

export type StateNotification =
  | { type: 'delta'; delta: WorldDelta; immediatePersistence: boolean }
  | { type: 'effect'; sessionId: string; effect: EffectType; effectData?: Record<string, unknown> };

export type StateChangeCallback = (notification: StateNotification) => void;

const WORLD_SCHEMA_VERSION = 1;
const CHAT_HISTORY_LIMIT = 100;
const WORLD_MOVE_SPEED = 80;
const VORTEX_DURATION_MS = 15_000;

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class StateManager {
  private sessions = new Map<string, WorldAgent>();
  private tombstones = new Map<string, TombstoneState>();
  private chat: ChatMessage[] = [];
  private events = new Map<string, TimedWorldEvent>();
  private revision = 0;
  private knownSessions = new Set<string>();
  private pendingRemovals = new Map<string, ReturnType<typeof setTimeout>>();
  private onChange: StateChangeCallback | null = null;
  private sessionNameLookup: ((id: string) => string | undefined) | null = null;
  private sessionAliveCheck: ((id: string) => boolean) | null = null;

  constructor(
    private environment: EnvironmentType = 'arcade',
    private now: () => number = Date.now,
  ) {}

  setSessionNameLookup(fn: (id: string) => string | undefined) {
    this.sessionNameLookup = fn;
  }

  setSessionAliveCheck(fn: (id: string) => boolean) {
    this.sessionAliveCheck = fn;
  }

  onStateChange(cb: StateChangeCallback) {
    this.onChange = cb;
  }

  getAll(): WorldAgent[] {
    return Array.from(this.sessions.values()).filter(session => session.activity !== 'stopped');
  }

  get(sessionId: string): WorldAgent | undefined {
    return this.sessions.get(sessionId);
  }

  getCurrentPosition(sessionId: string, timestamp = this.now()): Position | undefined {
    const session = this.sessions.get(sessionId);
    return session ? this.currentWorldPosition(session, timestamp) : undefined;
  }

  getShotTargets(sessionId: string, facing: FacingDirection): string[] {
    const timestamp = this.now();
    const shooter = this.sessions.get(sessionId);
    if (!shooter || shooter.activity === 'stopped') return [];
    const shooterPosition = this.currentWorldPosition(shooter, timestamp);
    const targets: string[] = [];
    for (const candidate of this.sessions.values()) {
      if (candidate.sessionId === sessionId || candidate.activity === 'stopped') continue;
      if (isInShotCorridor(
        shooterPosition,
        this.currentWorldPosition(candidate, timestamp),
        facing,
      )) {
        targets.push(candidate.sessionId);
      }
    }
    return targets;
  }

  getSnapshot(): WorldSnapshot {
    const timestamp = this.now();
    return clone({
      schemaVersion: WORLD_SCHEMA_VERSION,
      revision: this.revision,
      serverTime: timestamp,
      environment: this.environment,
      agents: Array.from(this.sessions.values()),
      tombstones: Array.from(this.tombstones.values()).filter(tombstone => tombstone.expiresAt > timestamp),
      chat: this.chat,
      events: Array.from(this.events.values()).filter(event => event.expiresAt > timestamp),
    });
  }

  restoreWorld(snapshot: WorldSnapshot): void {
    this.revision = snapshot.revision;
    this.chat = snapshot.chat.slice(-CHAT_HISTORY_LIMIT).map(clone);
    this.tombstones = new Map(snapshot.tombstones.map(tombstone => [tombstone.sessionId, clone(tombstone)]));
    this.events = new Map(snapshot.events.map(event => [event.id, clone(event)]));

    const timestamp = this.now();
    for (const stored of snapshot.agents) {
      const session = scrubLegacyAgentFields(clone(stored));
      this.knownSessions.add(session.sessionId);
      delete session.manualControl;
      if (session.activity === 'stopped') {
        this.createTombstone(session, timestamp);
        continue;
      }
      this.sessions.set(session.sessionId, session);
      this.syncWorld(session, timestamp);
    }
    this.pruneWorld(timestamp, false);
  }

  appendChat(chat: ChatMessage): void {
    this.chat.push(clone(chat));
    if (this.chat.length > CHAT_HISTORY_LIMIT) this.chat.splice(0, this.chat.length - CHAT_HISTORY_LIMIT);
    this.commit([{ kind: 'chat_append', chat: clone(chat) }], true);
  }

  startGlobalEvent(effect: GlobalEffectType, data?: Record<string, unknown>): TimedWorldEvent {
    const startedAt = this.now();
    const event: TimedWorldEvent = {
      id: randomUUID(),
      effect,
      startedAt,
      expiresAt: startedAt + VORTEX_DURATION_MS,
      seed: Math.floor(Math.random() * 0x7fffffff),
      data: data ? clone(data) : undefined,
    };
    this.events.set(event.id, event);
    this.commit([{ kind: 'event_upsert', event: clone(event) }], true);
    return clone(event);
  }

  advanceWorld(timestamp = this.now()): void {
    this.pruneWorld(timestamp, true);
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

        // The hook sends only the name from `/rename <name>`; prompt text never
        // reaches the server, so there is nothing here to parse or log.
        if (payload.session_name) {
          s.sessionName = payload.session_name;
        }

        console.log(`[state] PROMPT_RECEIVED: id=${payload.session_id} user=${s.username}`);
        this.touchAndEmit(payload, 'prompt_received');
        break;
      }
      case 'PostToolUseFailure': {
        const s = this.ensureSession(payload);
        if (!s) break;
        s.activity = 'thinking';
        s.currentTool = null;
        console.log(`[state] TOOL_FAILURE: id=${payload.session_id} tool=${payload.tool_name} reason=${payload.reason}`);
        this.touchAndEmit(payload, 'error', { tool: payload.tool_name, reason: payload.reason });
        break;
      }
      case 'StopFailure': {
        const s = this.ensureSession(payload);
        if (!s) break;
        s.activity = 'idle';
        s.currentTool = null;
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
        s.sessionName = payload.session_name || ((payload as Record<string, unknown>).name as string) || 'worktree';
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
          session.lastEventAt = this.now();
        }
        break;
    }
  }

  findSessionsByUsername(username: string): WorldAgent[] {
    return Array.from(this.sessions.values())
      .filter(session => session.username === username && session.activity !== 'stopped')
      .sort((a, b) => b.lastEventAt - a.lastEventAt);
  }

  findSessionByUsername(username: string): WorldAgent | undefined {
    let best: WorldAgent | undefined;
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
      session.lastEventAt = this.now();
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
        existing.lastEventAt = this.now();
        this.emit('update', { agent: existing });
      }
      return;
    }

    const now = this.now();
    const session: WorldAgent = {
      sessionId,
      username: 'anonymous',
      avatar: DEFAULT_AVATAR,
      cwd,
      activity: 'idle',
      currentTool: null,
      subagents: [],
      startedAt: now,
      lastEventAt: now,
      world: this.initialWorld(sessionId, now),
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
    const timestamp = this.now();
    for (const stored of sessions) {
      if (stored.activity === 'stopped' || this.sessions.has(stored.sessionId)) continue;
      const session: WorldAgent = {
        ...scrubLegacyAgentFields(clone(stored)),
        currentTool: null,
        subagents: [],
        lastEventAt: timestamp,
        world: this.initialWorld(stored.sessionId, timestamp),
      };
      delete session.manualControl;
      this.knownSessions.add(session.sessionId);
      this.sessions.set(session.sessionId, session);
      this.syncWorld(session, timestamp);
    }
  }

  updateContext(sessionId: string, summary: string): WorldAgent | undefined {
    const session = this.sessions.get(sessionId);
    if (!session || session.activity === 'stopped') return undefined;
    session.taskDescription = summary.slice(0, 200);
    session.lastEventAt = this.now();
    this.emit('update', { agent: session }, true);
    return session;
  }

  emitUpdate(session: WorldAgent): void {
    this.emit('update', { agent: session }, true);
  }

  setManualControl(sessionId: string, control: ManualControlState): WorldAgent | undefined {
    const session = this.sessions.get(sessionId);
    if (!session || session.activity === 'stopped') return undefined;
    session.manualControl = { ...control };
    this.emit('update', { agent: session });
    return session;
  }

  updateManualControl(sessionId: string, control: ManualControlState): WorldAgent | undefined {
    const session = this.sessions.get(sessionId);
    if (!session?.manualControl || session.activity === 'stopped') return undefined;
    session.manualControl = { ...control };
    this.emit('update', { agent: session });
    return session;
  }

  clearManualControl(sessionId: string): WorldAgent | undefined {
    const session = this.sessions.get(sessionId);
    if (!session?.manualControl) return session;
    delete session.manualControl;
    this.emit('update', { agent: session });
    return session;
  }

  emitEmote(sessionId: string, emote: string, facing?: FacingDirection): void {
    console.log(`[state] EMOTE: sessionId=${sessionId} emote=${emote}`);
    const resolvedFacing = facing ?? this.sessions.get(sessionId)?.world.facing;
    this.emit('effect', {
      sessionId,
      effect: 'emote' as EffectType,
      effectData: {
        emote,
        ...(resolvedFacing ? { facing: resolvedFacing } : {}),
        ...(emote === 'gun' && resolvedFacing
          ? { targetSessionIds: this.getShotTargets(sessionId, resolvedFacing) }
          : {}),
      },
    });
  }

  emitEffect(sessionId: string, effect: EffectType, effectData?: Record<string, unknown>): void {
    this.emit('effect', { sessionId, effect, effectData });
  }

  reapStale(): string[] {
    const now = this.now();
    const reaped: string[] = [];
    for (const [id, session] of this.sessions) {
      if (now - session.lastEventAt > STALE_SESSION_TIMEOUT_MS) {
        // Don't reap sessions that are still alive in Claude's session registry
        if (this.sessionAliveCheck?.(id)) {
          // Touch to prevent checking every reaper cycle
          session.lastEventAt = now;
          continue;
        }
        // Cancel any pending removal timer so it can't fire later and emit a duplicate remove
        const pendingTimer = this.pendingRemovals.get(id);
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          this.pendingRemovals.delete(id);
        }
        this.sessions.delete(id);
        // Don't clear knownSessions — allow the session to be re-created
        // by ensureSession() if it sends hooks later (e.g. user resumes work)
        reaped.push(id);
        this.emit('remove', { sessionId: id, agent: session }, true);
      }
    }
    return reaped;
  }

  private handleSessionStart(payload: HookPayload): void {
    const now = this.now();

    // Cancel any pending removal from a previous SessionEnd so it doesn't
    // delete the session we're about to (re-)create.
    const pendingTimer = this.pendingRemovals.get(payload.session_id);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.pendingRemovals.delete(payload.session_id);
    }

    this.knownSessions.add(payload.session_id);
    const existing = this.sessions.get(payload.session_id);

    // Force respawn only when the client plausibly lost the sprite:
    // session was ended, had a pending removal, or has been idle long
    // enough that a disconnect/reconnect could have dropped it.
    // A quick resume (brief pause) just updates in place — no flicker.
    const hadPendingRemoval = !!pendingTimer;
    const wasStopped = existing?.activity === 'stopped';
    const longIdle = !!existing && now - existing.lastEventAt > RESUME_RESPAWN_THRESHOLD_MS;

    if (existing && (wasStopped || hadPendingRemoval || longIdle)) {
      console.log(`[state] SESSION_RESUME: id=${payload.session_id} user=${existing.username} was=${existing.activity} idle=${now - existing.lastEventAt}ms — removing for respawn`);
      this.sessions.delete(payload.session_id);
      this.emit('remove', { sessionId: payload.session_id, agent: existing }, true);
      // Fall through to create a fresh session below
    } else if (existing) {
      // Quick resume — update in place, no client-visible flicker
      existing.username = payload.username || existing.username;
      existing.avatar = payload.avatar || existing.avatar;
      existing.cwd = payload.cwd || existing.cwd;
      existing.activity = 'idle';
      existing.currentTool = null;
      existing.lastEventAt = now;
      this.emit('update', { agent: existing });
      return;
    }

    {
      const session: WorldAgent = {
        sessionId: payload.session_id,
        username: payload.username || 'anonymous',
        avatar: payload.avatar || DEFAULT_AVATAR,
        cwd: payload.cwd || '',
        activity: 'idle',
        currentTool: null,
        subagents: [],
        startedAt: now,
        lastEventAt: now,
        world: this.initialWorld(payload.session_id, now),
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
    session.lastEventAt = this.now();
    this.emit('update', { agent: session });
    this.emit('effect', { sessionId: payload.session_id, effect: 'session_end' });

    // Remove after delay for exit animation (cancellable if session resumes)
    const timer = setTimeout(() => {
      this.pendingRemovals.delete(payload.session_id);
      this.sessions.delete(payload.session_id);
      // Don't clear knownSessions — allow the session to be re-created
      // by ensureSession() if the user resumes work later
      console.log(`[state] SESSION_REMOVED: id=${payload.session_id} (after ${STOPPED_REMOVAL_DELAY_MS}ms delay)`);
      this.emit('remove', { sessionId: payload.session_id, agent: session }, true);
    }, STOPPED_REMOVAL_DELAY_MS);
    this.pendingRemovals.set(payload.session_id, timer);
  }

  private handlePreToolUse(payload: HookPayload): void {
    const session = this.ensureSession(payload);
    if (!session) return;
    const toolName = payload.tool_name || 'unknown';

    session.activity = toolToActivity(toolName);
    session.currentTool = toolName;
    session.lastEventAt = this.now();
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
    session.lastEventAt = this.now();
    console.log(`[state] TOOL_COMPLETE: id=${payload.session_id} user=${session.username} tool=${payload.tool_name} activity=${session.activity}`);

    if (toolName === 'EnterWorktree') {
      if (payload.session_name) session.sessionName = payload.session_name;
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

    // The hook classifies the Bash command and sends only the verdict, so the
    // command line itself never leaves the machine that ran it.
    if (payload.git_action === 'commit') {
      this.emit('effect', { sessionId: payload.session_id, effect: 'commit' });
    } else if (payload.git_action === 'pr_merge') {
      this.emit('effect', { sessionId: payload.session_id, effect: 'pr_merge' });
    }
  }

  private handleSubagentStart(payload: HookPayload): void {
    const session = this.ensureSession(payload);
    if (!session) return;
    const now = this.now();
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

    session.lastEventAt = this.now();
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
    session.lastEventAt = this.now();
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
    session.lastEventAt = this.now();
    console.log(`[state] STOP: id=${payload.session_id} user=${session.username} activity=${session.activity} preserved=${session.activity === 'waiting'}`);
    this.emit('update', { agent: session });
  }

  /** Ensure a session exists (creates one if a hook fires before SessionStart).
   *  Returns null for session_ids that never had a SessionStart — these are
   *  subagent-owned hooks and should not create phantom top-level sessions. */
  private ensureSession(payload: HookPayload): WorldAgent | null {
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
        subagents: [],
        startedAt: this.now(),
        lastEventAt: this.now(),
        world: this.initialWorld(payload.session_id, this.now()),
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
    session.lastEventAt = this.now();
    console.log(`[state] EFFECT: id=${payload.session_id} effect=${effect}${data ? ' data=' + JSON.stringify(data) : ''}`);
    this.emit('update', { agent: session });
    this.emit('effect', { sessionId: payload.session_id, effect, effectData: data });
  }

  private initialWorld(sessionId: string, _timestamp: number): WorldAgent['world'] {
    const tombstone = this.tombstones.get(sessionId);
    const position = tombstone?.position ?? WORLD_LAYOUTS[this.environment].entrance;
    return {
      zone: 'entrance',
      position: { ...position },
      facing: 'down',
    };
  }

  private currentWorldPosition(session: WorldAgent, timestamp = this.now()): Position {
    return session.world.movement
      ? positionAt(session.world.movement, timestamp)
      : { ...session.world.position };
  }

  private syncWorld(session: WorldAgent, timestamp = this.now()): void {
    const current = this.currentWorldPosition(session, timestamp);
    if (session.manualControl) {
      const target = { x: session.manualControl.x, y: session.manualControl.y };
      const distance = Math.hypot(target.x - current.x, target.y - current.y);
      session.world = {
        zone: 'manual',
        position: current,
        facing: session.manualControl.facing,
        movement: distance < 1
          ? undefined
          : {
              from: current,
              to: target,
              startedAt: timestamp,
              arrivesAt: timestamp + MAX_BROADCAST_RATE_MS,
            },
      };
      return;
    }
    if (session.activity === 'stopped') {
      session.world = {
        ...session.world,
        position: current,
        movement: undefined,
      };
      return;
    }

    const zone = zoneForActivity(session.activity);
    const slotIndex = this.allocateSlot(session.sessionId, zone, session.world.zone === zone ? session.world.slotIndex : undefined);
    const target = slotPosition(this.environment, zone, slotIndex);
    const existingMovement = session.world.movement;
    if (existingMovement
      && session.world.zone === zone
      && session.world.slotIndex === slotIndex
      && existingMovement.to.x === target.x
      && existingMovement.to.y === target.y
      && timestamp < existingMovement.arrivesAt) {
      session.world.position = current;
      return;
    }

    const dx = target.x - current.x;
    const dy = target.y - current.y;
    const distance = Math.hypot(dx, dy);
    const facing: FacingDirection = Math.abs(dx) > Math.abs(dy)
      ? dx >= 0 ? 'right' : 'left'
      : dy >= 0 ? 'down' : 'up';
    session.world = {
      zone,
      slotIndex,
      position: current,
      facing: distance < 1 ? session.world.facing : facing,
      movement: distance < 1
        ? undefined
        : {
            from: current,
            to: target,
            startedAt: timestamp,
            arrivesAt: timestamp + Math.ceil(distance / WORLD_MOVE_SPEED * 1_000),
          },
    };
  }

  private allocateSlot(
    sessionId: string,
    zone: 'work' | 'waiting' | 'idle',
    preferred?: number,
  ): number {
    const occupied = new Set<number>();
    for (const session of this.sessions.values()) {
      if (session.sessionId !== sessionId && session.world.zone === zone && session.world.slotIndex !== undefined) {
        occupied.add(session.world.slotIndex);
      }
    }
    if (zone === 'work') {
      for (const tombstone of this.tombstones.values()) {
        if (tombstone.sessionId !== sessionId && tombstone.slotIndex !== undefined) {
          occupied.add(tombstone.slotIndex);
        }
      }
    }
    if (preferred !== undefined && !occupied.has(preferred)) return preferred;
    let index = 0;
    while (occupied.has(index)) index++;
    return index;
  }

  private createTombstone(session: WorldAgent, timestamp: number): TombstoneState {
    const tombstone: TombstoneState = {
      sessionId: session.sessionId,
      username: session.username,
      avatar: clone(session.avatar),
      position: this.currentWorldPosition(session, timestamp),
      slotIndex: session.world.zone === 'work' ? session.world.slotIndex : undefined,
      createdAt: timestamp,
      expiresAt: timestamp + TOMBSTONE_DURATION_MS,
    };
    this.tombstones.set(session.sessionId, tombstone);
    return tombstone;
  }

  private pruneWorld(timestamp: number, notify: boolean): void {
    const changes: WorldChange[] = [];
    for (const [sessionId, tombstone] of this.tombstones) {
      if (tombstone.expiresAt <= timestamp) {
        this.tombstones.delete(sessionId);
        changes.push({ kind: 'tombstone_remove', sessionId });
      }
    }
    for (const [eventId, event] of this.events) {
      if (event.expiresAt <= timestamp) {
        this.events.delete(eventId);
        changes.push({ kind: 'event_remove', eventId });
      }
    }
    if (notify && changes.length > 0) this.commit(changes, true, timestamp);
  }

  private commit(changes: WorldChange[], immediatePersistence: boolean, timestamp = this.now()): void {
    if (changes.length === 0) return;
    const previousRevision = this.revision;
    this.revision++;
    this.onChange?.({
      type: 'delta',
      immediatePersistence,
      delta: clone({
        previousRevision,
        revision: this.revision,
        serverTime: timestamp,
        changes,
      }),
    });
  }

  private emit(
    type: 'update' | 'remove' | 'effect',
    data: { agent?: WorldAgent; sessionId?: string; effect?: EffectType; effectData?: Record<string, unknown> },
    immediatePersistence = false,
  ): void {
    if (type === 'effect') {
      if (data.sessionId && data.effect) {
        this.onChange?.({
          type: 'effect',
          sessionId: data.sessionId,
          effect: data.effect,
          effectData: data.effectData ? clone(data.effectData) : undefined,
        });
      }
      return;
    }

    if (type === 'update' && data.agent) {
      const changes: WorldChange[] = [];
      if (this.tombstones.delete(data.agent.sessionId)) {
        changes.push({ kind: 'tombstone_remove', sessionId: data.agent.sessionId });
      }
      this.syncWorld(data.agent);
      changes.push({ kind: 'agent_upsert', agent: clone(data.agent) });
      this.commit(changes, immediatePersistence);
      return;
    }

    if (type === 'remove' && data.sessionId) {
      const changes: WorldChange[] = [{ kind: 'agent_remove', sessionId: data.sessionId }];
      if (data.agent) {
        const tombstone = this.createTombstone(data.agent, this.now());
        changes.push({ kind: 'tombstone_upsert', tombstone: clone(tombstone) });
      }
      this.commit(changes, true);
    }
  }
}
