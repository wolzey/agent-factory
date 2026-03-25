// === Agent Activity States ===
export type AgentActivity =
  | 'idle'
  | 'waiting'
  | 'thinking'
  | 'reading'
  | 'writing'
  | 'running'
  | 'searching'
  | 'chatting'
  | 'planning'
  | 'stopped';

// === Avatar Configuration ===
export interface AvatarConfig {
  spriteIndex: number;
  color: string;
  hat: string | null;
  trail: string | null;
}

// === Subagent Info ===
export interface SubagentInfo {
  agentId: string;
  agentType: string;
  activity: AgentActivity;
  startedAt: number;
}

// === Agent Session (Server State) ===
export interface AgentSession {
  sessionId: string;
  username: string;
  avatar: AvatarConfig;
  cwd: string;
  activity: AgentActivity;
  currentTool: string | null;
  currentToolInput: Record<string, unknown> | null;
  subagents: SubagentInfo[];
  startedAt: number;
  lastEventAt: number;
}

// === Hook Payload (from Claude Code hooks via HTTP POST) ===
export interface HookPayload {
  hook_event_name: string;
  session_id: string;
  cwd: string;
  username: string;
  avatar: AvatarConfig;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  agent_id?: string;
  agent_type?: string;
  source?: string;
  reason?: string;
  [key: string]: unknown;
}

// === WebSocket Messages: Server -> Browser ===
export type WSMessageToClient =
  | { type: 'full_state'; agents: AgentSession[] }
  | { type: 'agent_update'; agent: AgentSession }
  | { type: 'agent_remove'; sessionId: string }
  | { type: 'effect'; sessionId: string; effect: EffectType; data?: Record<string, unknown> };

// === WebSocket Messages: Browser -> Server ===
export type WSMessageToServer =
  | { type: 'identify'; username: string; avatar: AvatarConfig }
  | { type: 'request_state' };

// === Effect Types ===
export type EffectType =
  | 'tool_start'
  | 'tool_complete'
  | 'error'
  | 'subagent_spawn'
  | 'subagent_despawn'
  | 'session_start'
  | 'session_end';

// === User Config File Format ===
export interface UserConfig {
  username: string;
  serverUrl: string;
  avatar: AvatarConfig;
}
