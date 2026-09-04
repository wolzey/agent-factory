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
  shirtDesign?: number;     // 0-11 index (0=solid)
}

// === Subagent Info ===
export interface SubagentInfo {
  agentId: string;
  agentType: string;
  activity: AgentActivity;
  startedAt: number;
}

// === Shared World State ===
export interface Position {
  x: number;
  y: number;
}

export type FacingDirection = 'up' | 'down' | 'left' | 'right';
export type RpsChoice = 'rock' | 'paper' | 'scissors';
export type RpsOutcome = 'win' | 'lose' | 'draw';
export type WorldZone = 'entrance' | 'work' | 'waiting' | 'idle' | 'manual';

export interface WorldMovement {
  from: Position;
  to: Position;
  /** Server-authored intermediate points used to route around physical props. */
  waypoints?: Position[];
  startedAt: number;
  arrivesAt: number;
}

export interface AgentWorldState {
  zone: WorldZone;
  slotIndex?: number;
  position: Position;
  movement?: WorldMovement;
  facing: FacingDirection;
}

// === Manual Avatar Control ===
export interface ManualControlState {
  x: number;
  y: number;
  facing: FacingDirection;
  moving: boolean;
}

export interface ControlInputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

// === Tactile Avatar Grab ===
// A viewer can lift one avatar at a time. The server hands out a short lease so two
// viewers never fight over one sprite, and mirrors the holder's pointer to the room.
// Grab state is ephemeral: it never lands on AgentSession or on disk.
export interface GrabTarget {
  sessionId: string;
}

export interface GrabState extends GrabTarget {
  username: string; // viewer holding the lease
  x: number; // holder's pointer, world space
  y: number;
}

// === Agent Session (Server State) ===
export interface AgentSession {
  sessionId: string;
  username: string;
  ownerId?: string;
  sessionName?: string;
  avatar: AvatarConfig;
  cwd: string;
  activity: AgentActivity;
  currentTool: string | null;
  subagents: SubagentInfo[];
  startedAt: number;
  lastEventAt: number;
  taskDescription?: string;
  toolUseCount?: number;
  manualControl?: ManualControlState;
}

export interface WorldAgent extends AgentSession {
  world: AgentWorldState;
}

export interface TombstoneState {
  sessionId: string;
  username: string;
  avatar: AvatarConfig;
  position: Position;
  slotIndex?: number;
  createdAt: number;
  expiresAt: number;
}

export interface TimedWorldEvent {
  id: string;
  effect: GlobalEffectType;
  startedAt: number;
  expiresAt: number;
  seed: number;
  data?: Record<string, unknown>;
}

export interface WorldSnapshot {
  schemaVersion: number;
  revision: number;
  serverTime: number;
  environment: EnvironmentType;
  agents: WorldAgent[];
  tombstones: TombstoneState[];
  chat: ChatMessage[];
  events: TimedWorldEvent[];
}

export type WorldChange =
  | { kind: 'agent_upsert'; agent: WorldAgent }
  | { kind: 'agent_remove'; sessionId: string }
  | { kind: 'tombstone_upsert'; tombstone: TombstoneState }
  | { kind: 'tombstone_remove'; sessionId: string }
  | { kind: 'chat_append'; chat: ChatMessage }
  | { kind: 'event_upsert'; event: TimedWorldEvent }
  | { kind: 'event_remove'; eventId: string };

export interface WorldDelta {
  previousRevision: number;
  revision: number;
  serverTime: number;
  changes: WorldChange[];
}

// === Hook Payload (from Claude Code hooks via HTTP POST) ===
export interface HookPayload {
  hook_event_name: string;
  session_id: string;
  cwd: string;
  username: string;
  avatar: AvatarConfig;
  /** Assigned by the server after device authentication; never trusted from request JSON. */
  ownerId?: string;
  tool_name?: string;
  agent_id?: string;
  agent_type?: string;
  source?: string;
  reason?: string;
  // Derived by the hook script rather than sent raw. `session_name` carries the
  // name from `/rename <name>` or a worktree event; `git_action` says which
  // celebration effect to play. Prompt text and tool_input are deliberately
  // absent -- see cli/internal/hooks/agent-factory-hook.sh.
  message?: string;
  session_name?: string;
  git_action?: 'commit' | 'pr_merge';
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
  /** `buildId` identifies the running server build; a client that sees it change reloads once. */
  | { type: 'world_snapshot'; snapshot: WorldSnapshot; buildId?: string }
  | { type: 'world_delta'; delta: WorldDelta }
  | { type: 'full_state'; agents: AgentSession[] }
  | { type: 'agent_update'; agent: AgentSession }
  | { type: 'agent_remove'; sessionId: string }
  | { type: 'effect'; sessionId: string; effect: EffectType; data?: Record<string, unknown> }
  | { type: 'chat_message'; chat: ChatMessage }
  | { type: 'auth_result'; success: boolean; username?: string; ownerId?: string; error?: string }
  | { type: 'control_result'; success: boolean; sessionId?: string; action: 'claim' | 'release'; error?: string }
  | { type: 'control_revoked'; sessionId: string; reason: string }
  | { type: 'grab_result'; success: boolean; action: 'start' | 'end'; sessionId: string; error?: string }
  | { type: 'grab_update'; grab: GrabState }
  | { type: 'grab_release'; sessionId: string; x: number; y: number; reason: string }
  | { type: 'global_effect'; effect: GlobalEffectType; data?: Record<string, unknown> };

// === Global Effect Types ===
export type GlobalEffectType = 'vortex';

// === WebSocket Messages: Browser -> Server ===
export type WSMessageToServer =
  | { type: 'identify'; username: string; avatar: AvatarConfig }
  | { type: 'request_state' }
  | { type: 'logout' }
  | { type: 'control_claim'; sessionId: string }
  | { type: 'control_input'; sessionId: string; input: ControlInputState }
  | { type: 'control_release'; sessionId: string }
  | { type: 'shoot'; sessionId: string }
  | { type: 'grab_start'; sessionId: string; x: number; y: number }
  | { type: 'grab_move'; sessionId: string; x: number; y: number }
  | { type: 'grab_end'; sessionId: string; x: number; y: number; workstationSlot?: number }
  | { type: 'emote'; emote: string; sessionId?: string }
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
  | 'shoot'
  | 'prompt_received'
  | 'task_completed'
  | 'notification'
  | 'info_flash'
  | 'compact'
  | 'worktree_create'
  | 'worktree_remove'
  | 'elicitation'
  | 'commit'
  | 'pr_merge'
  | 'rps';

// === User Config File Format ===
export interface UserConfig {
  username: string;
  serverUrl: string;
  avatar: AvatarConfig;
}

// === Environment Types ===
export type EnvironmentType = 'arcade' | 'farm' | 'office' | 'mining';

// === Server Config ===
export interface ServerConfig {
  title: string;
  environment?: EnvironmentType;
  graphicDeath?: boolean;
}
