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
  /** A server-authored idle excursion, cleared as soon as work or manual control resumes. */
  idleVisit?: 'garage-mini';
  /** The car is reserved while approaching; the short parked-car animation starts on arrival. */
  carVisit?: { car: import('./factory25d-garage.js').GarageCarId; startedAt: number };
  /** Real work at Jonathan's portable Mini laptop; animation begins when its route arrives. */
  miniWork?: { startedAt: number; packingAt?: number };
  zone: WorldZone;
  slotIndex?: number;
  position: Position;
  movement?: WorldMovement;
  facing: FacingDirection;
}

// === Manual Avatar Control ===
export interface ManualElevatorTrip {
  departure: Position;
  arrival: Position;
  startedAt: number;
  arrivesAt: number;
}

export interface ManualControlState {
  x: number;
  y: number;
  facing: FacingDirection;
  moving: boolean;
  /** Server-authored lift ride; its endpoints remain on the two walkable floors. */
  elevatorTrip?: ManualElevatorTrip;
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
/** Evidence from an agent hook, independent of movement or an idle timeout. */
export interface AgentAttention {
  kind: 'input' | 'permission' | 'ready' | 'error';
  /** Server timestamp when this uninterrupted attention state began. */
  since: number;
}

export interface AgentSession {
  sessionId: string;
  username: string;
  ownerId?: string;
  sessionName?: string;
  avatar: AvatarConfig;
  cwd: string;
  activity: AgentActivity;
  /** Absent on older hosts and when no hook has established an attention state. */
  attention?: AgentAttention;
  currentTool: string | null;
  subagents: SubagentInfo[];
  startedAt: number;
  lastEventAt: number;
  taskDescription?: string;
  toolUseCount?: number;
  manualControl?: ManualControlState;
}

export interface StationTicketWallet {
  key: string;
  username: string;
  balance: number;
  /** Fractional active minutes carry across stations and sessions. */
  remainderMs: number;
}
export interface StationTicketVisit {
  sessionId: string;
  ownerKey: string;
  username: string;
  slotIndex: number;
  activeMs: number;
}
export interface StationTicketState {
  wallets: StationTicketWallet[];
  visits: StationTicketVisit[];
}
export interface StationTicketPayout {
  id: string;
  slotIndex: number;
  count: number;
  startedAt: number;
  collectAt: number;
}
export interface WorldAgent extends AgentSession {
  /** Last real work hook, kept separate from process-liveness refreshes. */
  ticketHookAt?: number;
  /** Earned server-side; the collection pose never delays real activity/attention. */
  ticketPayout?: StationTicketPayout;
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
  stationTickets?: StationTicketState;
  /** Optional for compatibility with older factory hosts. */
  workstationCount?: number;
  /** Advertised only by hosts that support authenticated parked-car visits. */
  garageCars?: true;
  /** Public, server-simulated free driving on the garage floor. */
  garageDriving?: true;
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
  | { kind: 'station_tickets'; tickets: StationTicketState }
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
  tool_use_id?: string;
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
  | import('./pickup-motion.js').PickupMessage
  | import('./room-props.js').RoomPropsState
  | import('./room-props.js').RoomPropResult
  | import('./lounge-radio.js').RadioState
  | import('./lounge-radio.js').RadioScratch
  | import('./lounge-radio.js').RadioResult
  | import('./factory25d-driving.js').GarageDriveState
  | import('./factory25d-driving.js').GarageDriveResult
  | import('./visitor-basketball.js').VisitorBallUpdate
  | import('./basketball-challenge.js').ChallengeState
  | import('./basketball-challenge.js').ChallengeResult
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
  | { type: 'garage_car_result'; sessionId: string; success: boolean; error?: string }
  | { type: 'grab_result'; success: boolean; action: 'start' | 'end'; sessionId: string; error?: string }
  | { type: 'grab_update'; grab: GrabState }
  | { type: 'grab_release'; sessionId: string; x: number; y: number; reason: string }
  | { type: 'global_effect'; effect: GlobalEffectType; data?: Record<string, unknown> };

// === Global Effect Types ===
export type GlobalEffectType = 'vortex';

// === WebSocket Messages: Browser -> Server ===
export type WSMessageToServer =
  | import('./pickup-motion.js').PickupRequest
  | import('./room-props.js').RoomPropRequest
  | import('./lounge-radio.js').RadioRequest
  | import('./factory25d-driving.js').GarageDriveRequest
  | import('./visitor-basketball.js').VisitorBallInput
  | import('./basketball-challenge.js').ChallengeRequest
  | { type: 'identify'; username: string; avatar: AvatarConfig }
  | { type: 'request_state' }
  | { type: 'logout' }
  | { type: 'control_claim'; sessionId: string }
  | { type: 'control_input'; sessionId: string; input: ControlInputState }
  | { type: 'control_release'; sessionId: string }
  | { type: 'shoot'; sessionId: string }
  | { type: 'garage_car'; sessionId: string; car: import('./factory25d-garage.js').GarageCarId }
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
export type EnvironmentType = 'arcade' | 'farm' | 'office' | 'mining' | 'factory25d';

// === Server Config ===
export interface ServerConfig {
  title: string;
  environment?: EnvironmentType;
  graphicDeath?: boolean;
}
