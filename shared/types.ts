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
  | 'compacting'
  | 'stopped';

// === Avatar Configuration ===
export interface AvatarConfig {
  spriteIndex: number;
  color: string;
  hat: string | null;
  trail: string | null;
  graphicDeath?: boolean;
  hairStyle?: number;       // 0-7 index into HAIR_STYLES
  hairColor?: string;       // hex color
  skinTone?: string;        // hex color
  shirtColor?: string;      // hex color
  pantsColor?: string;      // hex color
  shoeColor?: string;       // hex color
  facialHair?: number;      // 0-5 index (0=none)
  mouthStyle?: number;      // 0-5 index (0=default)
  faceAccessory?: number;   // 0-5 index (0=none)
  headAccessory?: number;   // 0-6 index (0=none)
  shirtDesign?: number;     // 0-6 index (0=solid)
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
  sessionName?: string;
  avatar: AvatarConfig;
  cwd: string;
  activity: AgentActivity;
  currentTool: string | null;
  currentToolInput: Record<string, unknown> | null;
  subagents: SubagentInfo[];
  startedAt: number;
  lastEventAt: number;
  lastPrompt?: string;
  taskDescription?: string;
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
  user_prompt?: string;
  prompt?: string;
  transcript_path?: string;
  [key: string]: unknown;
}

// === Chat Message ===
export interface ChatMessage {
  username: string;
  message: string;
  timestamp: number;
}

// === WebSocket Messages: Server -> Browser ===
export type WSMessageToClient =
  | { type: 'full_state'; agents: AgentSession[] }
  | { type: 'agent_update'; agent: AgentSession }
  | { type: 'agent_remove'; sessionId: string }
  | { type: 'effect'; sessionId: string; effect: EffectType; data?: Record<string, unknown> }
  | { type: 'chat_message'; chat: ChatMessage }
  | { type: 'auth_result'; success: boolean; username?: string; error?: string };

// === WebSocket Messages: Browser -> Server ===
export type WSMessageToServer =
  | { type: 'identify'; username: string; avatar: AvatarConfig }
  | { type: 'request_state' }
  | { type: 'auth'; token: string }
  | { type: 'emote'; emote: string }
  | { type: 'chat'; message: string };

// === Emote Types ===
export type EmoteType = 'dance' | 'jump' | 'guitar' | 'gun' | 'laugh' | 'wave' | 'sleep' | 'explode' | 'dizzy' | 'flex' | 'rage' | 'fart';

// === Effect Types ===
export type EffectType =
  | 'tool_start'
  | 'tool_complete'
  | 'error'
  | 'subagent_spawn'
  | 'subagent_despawn'
  | 'session_start'
  | 'session_end'
  | 'emote'
  | 'prompt_received'
  | 'task_completed'
  | 'notification'
  | 'info_flash'
  | 'compact'
  | 'worktree_create'
  | 'worktree_remove'
  | 'elicitation';

// === User Config File Format ===
export interface UserConfig {
  username: string;
  serverUrl: string;
  avatar: AvatarConfig;
}

// === Environment Types ===
export type EnvironmentType = 'arcade' | 'farm' | 'office';

// === Server Config ===
export interface ServerConfig {
  title: string;
  environment?: EnvironmentType;
  graphicDeath?: boolean;
}
