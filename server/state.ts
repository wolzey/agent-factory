import { StationTickets } from './station-tickets.js';
import { FACTORY25D_BOUNDS, constrainFactoryStep, toFactoryWorld, factory25dWaypoints, factoryMovementIsClear, recoverFactoryPosition, factoryElevatorTripAt, fromFactoryWorld, clearFactorySegment, GARAGE_MINI_LOOKOUTS, WORKSTATIONS, MINI_WORKSTATION_SLOT, MINI_WORKSTATION_USERNAME, MINI_WORK_PACK_MS, MINI_WORK_RETRIEVAL_MS, factoryRoomAt } from '../shared/factory25d-layout.js';
import { GARAGE_CAR_VISIT_MS, garageCarLookout, isGarageCarId, type GarageCarId } from '../shared/factory25d-garage.js';
import { manualElevatorEntry, manualElevatorLanding } from '../shared/factory25d-manual-travel.js';
import { CONTROL_WORLD_BOUNDS, GRAB_POINTER_BOUNDS } from '../shared/constants.js';
import { randomUUID } from 'node:crypto';
import type {
  AgentAttention,
  AgentActivity,
  AgentSession,
  AvatarConfig,
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
  WorldMovement,
} from '../shared/types.js';
import { isInShotCorridor } from '../shared/world-geometry.js';
import {
  ARCADE_WINDOW_LOOKOUTS,
  arcadePlantWaypoints,
  arcadeWindowWaypoints,
  nearestWorkstationSlot,
  positionAt,
  routeDistance,
  slotPosition,
  workstationWaypoints,
  WORLD_LAYOUTS,
  zoneForActivity,
} from '../shared/world-layouts.js';
import { createRpsRound, rpsDelayForPair, rpsPairKey } from '../shared/rps.js';
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
const IDLE_ROAM_DELAY_MS = 14_000;
const WINDOW_GAZE_DURATION_MS = 8_000;
// Verified account identity; do not match a first name or a username substring.
const MINI_REGULAR_USERNAME = MINI_WORKSTATION_USERNAME;
const RPS_PROXIMITY_PX = 52;
const RPS_PAIR_COOLDOWN_MS = 60_000;

const DANCE_FLOOR_PATHS: Position[][] = [
  [{ x: 582, y: 394 }, { x: 638, y: 414 }, { x: 704, y: 434 }],
  [{ x: 752, y: 394 }, { x: 676, y: 414 }, { x: 620, y: 454 }],
  [{ x: 620, y: 394 }, { x: 695, y: 434 }, { x: 744, y: 414 }],
  [{ x: 714, y: 394 }, { x: 638, y: 434 }, { x: 690, y: 454 }],
];

function clone<T>(value: T): T {
  return structuredClone(value);
}

function restoreSession(stored: WorldAgent): WorldAgent {
  const session = scrubLegacyAgentFields(clone(stored));
  session.ticketHookAt = Number.isFinite(session.ticketHookAt) ? session.ticketHookAt : session.lastEventAt;
  const attention = session.attention;
  if (!attention) { delete session.attention; return session; }
  const agreesWithActivity = (attention.kind === 'input' || attention.kind === 'permission')
    ? session.activity === 'waiting'
    : attention.kind === 'ready' ? session.activity === 'idle'
      : attention.kind === 'error' && (session.activity === 'thinking' || session.activity === 'idle');
  if (!agreesWithActivity || !Number.isFinite(attention.since) || attention.since < 0 || attention.since > session.lastEventAt) {
    delete session.attention;
  } else {
    session.attention = { kind: attention.kind, since: attention.since };
  }
  return session;
}

export class StateManager {
  private sessions = new Map<string, WorldAgent>();
  private stationTickets = new StationTickets();
  private ticketVersion = 0;
  private ticketCheckpointAt = 0;
  private tombstones = new Map<string, TombstoneState>();
  private chat: ChatMessage[] = [];
  private events = new Map<string, TimedWorldEvent>();
  private revision = 0;
  private knownSessions = new Set<string>();
  private pendingRemovals = new Map<string, ReturnType<typeof setTimeout>>();
  private onChange: StateChangeCallback | null = null;
  private sessionNameLookup: ((id: string) => string | undefined) | null = null;
  private sessionAliveCheck: ((id: string) => boolean) | null = null;
  private sessionKeepAliveCheck: ((id: string, ownerId?: string) => boolean) | null = null;
  private idleRoamAt = new Map<string, number>();
  private idleExcursionCount = new Map<string, number>();
  private windowVisitors = new Set<string>();
  private rpsReadyAt = new Map<string, number>();
  private restoringWorkReservations = new Map<number, string>();
  private avatarResolver: ((ownerId: string) => AvatarConfig | undefined) | undefined;
  private grabbedSession: (sessionId: string) => boolean = () => false;
  private garageDriving?: { occupied: (car: GarageCarId) => boolean; blocks: (from: Position, to: Position) => boolean };
  private garageDrivers = new Set<string>();
  private garageYielding = new Map<string, { movement: WorldMovement; pausedAt: number; activity: AgentActivity }>();

  constructor(
    private environment: EnvironmentType = 'arcade',
    private now: () => number = Date.now,
  ) {}

  constrainStep(from: Position, to: Position) {
    const next = this.environment === 'factory25d' ? constrainFactoryStep(from, to) : to;
    return this.garageDriving?.blocks(from, next) ? from : next;
  }
  manualElevatorEntry(from: Position, to: Position) { return this.environment === 'factory25d' ? manualElevatorEntry(from, to) : undefined; }
  get worldBounds() { return this.environment === 'factory25d' ? FACTORY25D_BOUNDS : CONTROL_WORLD_BOUNDS; }
  get grabBounds() { return this.environment === 'factory25d' ? { ...FACTORY25D_BOUNDS, minY: -82 } : GRAB_POINTER_BOUNDS; }

  setSessionNameLookup(fn: (id: string) => string | undefined) {
    this.sessionNameLookup = fn;
  }

  setSessionAliveCheck(fn: (id: string) => boolean) {
    this.sessionAliveCheck = fn;
  }

  /** Liveness reported by the machine running the agents, for servers that are
   *  not on that machine and so cannot read its session registry themselves.
   *  It protects a session from the stale reaper, and deliberately does NOT
   *  admit unknown session_ids the way the local registry does -- a pushed id
   *  is not proof that a SessionStart ever happened. */
  setSessionKeepAliveCheck(fn: (id: string, ownerId?: string) => boolean) {
    this.sessionKeepAliveCheck = fn;
  }

  onStateChange(cb: StateChangeCallback) {
    this.onChange = cb;
  }

  setAvatarResolver(resolve: (ownerId: string) => AvatarConfig | undefined) {
    this.avatarResolver = resolve;
  }

  setGrabbedSessionCheck(check: (sessionId: string) => boolean): void { this.grabbedSession = check; }
  setGarageDrivingHooks(hooks: StateManager['garageDriving']) { this.garageDriving = hooks; }
  isGarageCarReserved(car: GarageCarId, exceptSessionId?: string) { return this.garageCarOccupied(car, exceptSessionId); }
  isSessionGrabbed(sessionId: string) { return this.grabbedSession(sessionId); }
  holdGarageDriver(sessionId: string) {
    const session = this.sessions.get(sessionId); if (!session) return;
    session.world.position = this.currentWorldPosition(session); delete session.world.movement;
    this.garageDrivers.add(sessionId); this.emit('update', { agent: session });
  }
  finishGarageDriver(sessionId: string, parked = false) {
    if (!this.garageDrivers.delete(sessionId)) return;
    const session = this.sessions.get(sessionId); if (!session) return;
    if (parked && session.activity === 'idle' && !session.manualControl && !this.grabbedSession(sessionId) && session.world.carVisit) {
      // Resume only the existing door-open / get-out / walk-back section.
      const timestamp = this.now(); session.world.carVisit.startedAt = timestamp - 8_150;
      this.idleRoamAt.set(sessionId, timestamp + GARAGE_CAR_VISIT_MS - 8_150);
      this.emit('update', { agent: session }); return;
    }
    delete session.world.carVisit; delete session.world.idleVisit; this.idleRoamAt.delete(sessionId);
    this.syncWorld(session); this.emit('update', { agent: session });
  }
  /** Pause automatic pedestrians before a moving car, retaining the exact route for resumption. */
  yieldToGarageCars(timestamp: number) {
    if (!this.garageDriving) return;
    for (const id of this.garageYielding.keys()) if (!this.sessions.has(id)) this.garageYielding.delete(id);
    const changes: WorldChange[] = [];
    for (const session of this.sessions.values()) {
      const held = this.garageYielding.get(session.sessionId);
      if (held) {
        if (session.manualControl || session.activity !== held.activity || session.world.movement || this.grabbedSession(session.sessionId)) this.garageYielding.delete(session.sessionId);
        else {
          const from = positionAt(held.movement, held.pausedAt), to = positionAt(held.movement, held.pausedAt + 350);
          if (this.garageDriving.blocks(from, to)) continue;
          const delay = timestamp - held.pausedAt;
          session.world.movement = { ...held.movement, startedAt: held.movement.startedAt + delay, arrivesAt: held.movement.arrivesAt + delay };
          this.garageYielding.delete(session.sessionId); changes.push({ kind: 'agent_upsert', agent: clone(session) }); continue;
        }
      }
      const movement = session.world.movement;
      if (!movement || session.manualControl || session.activity === 'stopped' || this.garageDrivers.has(session.sessionId) || this.grabbedSession(session.sessionId)) continue;
      const from = positionAt(movement, timestamp), to = positionAt(movement, timestamp + 350);
      if (!this.garageDriving.blocks(from, to)) continue;
      this.garageYielding.set(session.sessionId, { movement, pausedAt: timestamp, activity: session.activity });
      session.world.position = from; delete session.world.movement;
      changes.push({ kind: 'agent_upsert', agent: clone(session) });
    }
    if (changes.length) this.commit(changes, false, timestamp);
  }

  updateOwnerAvatar(ownerId: string, avatar: AvatarConfig) {
    const changes: WorldChange[] = [];
    for (const session of this.sessions.values()) {
      if (session.ownerId !== ownerId || JSON.stringify(session.avatar) === JSON.stringify(avatar)) continue;
      session.avatar = clone(avatar);
      changes.push({ kind: 'agent_upsert', agent: clone(session) });
    }
    // Appearance updates preserve activity timestamps, positions and control leases.
    this.commit(changes, true);
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

  /** Reserve a parked car for an idle agent without acquiring or replacing a control lease. */
  requestGarageCarVisit(ownerId: string | undefined, sessionId: string, car: unknown): { success: boolean; error?: string } {
    if (!ownerId) return { success: false, error: 'Connect this browser to visit a car with your agent.' };
    const session = this.sessions.get(sessionId);
    if (!session || session.ownerId !== ownerId) return { success: false, error: 'Choose one of your own agents.' };
    return this.startIdleGarageCarVisit(sessionId, car);
  }

  /** Only the server's occasional idle excursion policy calls this without browser ownership. */
  startIdleGarageCarVisit(sessionId: string, car: unknown): { success: boolean; error?: string } {
    const session = this.sessions.get(sessionId);
    if (!session || this.grabbedSession(sessionId)) return { success: false, error: 'That agent is unavailable.' };
    if (this.environment !== 'factory25d') return { success: false, error: 'Car visits are available in the factory garage.' };
    if (!isGarageCarId(car)) return { success: false, error: 'Choose a car from the garage.' };
    if (session.activity !== 'idle') return { success: false, error: 'That agent is busy. Try again when they are idle.' };
    if (session.manualControl) return { success: false, error: 'Release manual control before visiting a car.' };
    if (this.packingMini(session)) return { success: false, error: 'Let your agent put the laptop away first.' };
    if (session.world.carVisit || session.world.idleVisit) return { success: false, error: 'That agent is already visiting a car.' };
    const carId = car as GarageCarId;
    if (this.garageCarOccupied(carId)) return { success: false, error: 'That car is occupied. Choose another car or wait a moment.' };
    const timestamp = this.now();
    const slotIndex = session.world.zone === 'idle' && session.world.slotIndex !== undefined
      ? session.world.slotIndex : this.allocateSlot(sessionId, 'idle');
    if (!this.moveFactoryIdle(session, toFactoryWorld(garageCarLookout(carId)), slotIndex, timestamp, undefined, carId)) {
      return { success: false, error: 'Your agent cannot reach that car from here. Move them to an open spot and try again.' };
    }
    this.commit([{ kind: 'agent_upsert', agent: clone(session) }], true, timestamp);
    return { success: true };
  }

  /** Grabbing interrupts both a parked-car performance and an automatic spectator visit. */
  cancelGarageCarVisit(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || (!session.world.carVisit && !session.world.idleVisit && !session.world.miniWork)) return;
    if (session.world.miniWork) {
      session.world = { zone: zoneForActivity(session.activity) === 'work' ? 'waiting' : zoneForActivity(session.activity), position: this.currentWorldPosition(session), facing: session.world.facing };
    }
    delete session.world.carVisit; delete session.world.idleVisit;
    this.idleRoamAt.delete(sessionId);
    this.emit('update', { agent: session }, true);
  }

  private garageCarOccupied(car: GarageCarId, exceptSessionId?: string): boolean {
    return !!this.garageDriving?.occupied(car) || [...this.sessions.values()].some(session => session.sessionId !== exceptSessionId && session.activity !== 'stopped' && !session.manualControl
      && (session.activity === 'idle' && session.world.carVisit?.car === car
        || car === 'mini' && (this.packingMini(session) || session.world.zone === 'work' && session.world.slotIndex === MINI_WORKSTATION_SLOT)));
  }

  private packingMini(session: WorldAgent, timestamp = this.now()): boolean {
    return session.world.miniWork?.packingAt !== undefined && timestamp < session.world.miniWork.packingAt + MINI_WORK_PACK_MS;
  }

  private workstationAllowed(session: Pick<WorldAgent, 'username'>, slotIndex: number): boolean {
    return this.environment !== 'factory25d' || slotIndex !== MINI_WORKSTATION_SLOT || session.username === MINI_WORKSTATION_USERNAME;
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

  findRockPaperScissorsOpponent(
    sessionId: string,
    point: Position,
    radius = 72,
  ): WorldAgent | undefined {
    let closest: { session: WorldAgent; distance: number } | undefined;
    const timestamp = this.now();
    for (const candidate of this.sessions.values()) {
      if (candidate.sessionId === sessionId || candidate.activity === 'stopped' || candidate.manualControl) continue;
      const position = this.currentWorldPosition(candidate, timestamp);
      const distance = Math.hypot(position.x - point.x, position.y - point.y);
      if (distance <= radius && (!closest || distance < closest.distance)) {
        closest = { session: candidate, distance };
      }
    }
    return closest?.session;
  }

  startRockPaperScissors(
    firstSessionId: string,
    secondSessionId: string,
    timestamp = this.now(),
    forced = false,
  ): boolean {
    if (firstSessionId === secondSessionId) return false;
    const first = this.sessions.get(firstSessionId);
    const second = this.sessions.get(secondSessionId);
    if (!first || !second || first.activity === 'stopped' || second.activity === 'stopped') return false;
    if (first.manualControl || second.manualControl) return false;

    const pairKey = rpsPairKey(firstSessionId, secondSessionId);
    if (!forced && timestamp < (this.rpsReadyAt.get(pairKey) ?? 0)) return false;
    const round = createRpsRound(firstSessionId, secondSessionId, timestamp);
    this.rpsReadyAt.set(pairKey, timestamp + RPS_PAIR_COOLDOWN_MS);
    this.emit('effect', {
      sessionId: firstSessionId,
      effect: 'rps',
      effectData: {
        opponentSessionId: secondSessionId,
        startedAt: timestamp,
        firstChoice: round.firstChoice,
        secondChoice: round.secondChoice,
        firstOutcome: round.firstOutcome,
        secondOutcome: round.secondOutcome,
      },
    });
    return true;
  }

  getSnapshot(): WorldSnapshot {
    const timestamp = this.now();
    return clone({
      schemaVersion: WORLD_SCHEMA_VERSION,
      stationTickets: this.stationTickets.snapshot(),
      workstationCount: WORLD_LAYOUTS[this.environment].workSlots.length,
      ...(this.environment === 'factory25d' ? { garageCars: true as const } : {}),
      ...(this.garageDriving ? { garageDriving: true as const } : {}),
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
    this.stationTickets.restore(snapshot.stationTickets);
    this.ticketVersion = this.stationTickets.version;
    this.chat = snapshot.chat.slice(-CHAT_HISTORY_LIMIT).map(clone);
    this.tombstones = new Map(snapshot.tombstones.map(tombstone => [tombstone.sessionId, clone(tombstone)]));
    if (this.environment === 'factory25d') for (const stone of this.tombstones.values()) {
      if (stone.slotIndex === MINI_WORKSTATION_SLOT && !this.workstationAllowed(stone, MINI_WORKSTATION_SLOT)) delete stone.slotIndex;
    }
    this.events = new Map(snapshot.events.map(event => [event.id, clone(event)]));

    const timestamp = this.now();
    this.pruneWorld(timestamp, false);
    if (snapshot.environment !== this.environment) {
      this.restoreDifferentLayout(snapshot, timestamp);
      return;
    }
    this.restoringWorkReservations = new Map(snapshot.agents.filter(session => !session.manualControl && session.activity !== 'stopped'
      && session.world.zone === 'work' && session.world.slotIndex !== undefined && this.workstationAllowed(session, session.world.slotIndex)).map(session => [session.world.slotIndex!, session.sessionId]));
    for (const stored of snapshot.agents) {
      const session = restoreSession(stored);
      this.knownSessions.add(session.sessionId);
      delete session.manualControl;
      if (session.activity === 'stopped') {
        this.createTombstone(session, timestamp);
        continue;
      }
      if (this.environment === 'factory25d') {
        // Retain identity and station reservations, but rebuild persisted routes
        // against the current terrace walls instead of reusing an older floor plan.
        const persistedPosition = stored.manualControl?.elevatorTrip
          ? manualElevatorLanding(stored.manualControl.elevatorTrip, timestamp)
          : stored.manualControl ?? this.currentWorldPosition(session, timestamp);
        session.world.position = recoverFactoryPosition(persistedPosition);
        delete session.world.movement;
        delete session.world.idleVisit; // Resume at a safe home after a server restart.
        delete session.world.carVisit;
        if (zoneForActivity(session.activity) !== 'work' || session.world.zone !== 'work' || session.world.slotIndex !== MINI_WORKSTATION_SLOT
          || !this.workstationAllowed(session, MINI_WORKSTATION_SLOT)) delete session.world.miniWork;
      }
      this.sessions.set(session.sessionId, session);
      // A settled, explicitly dropped workstation assignment survives a restart,
      // including an idle avatar placed there by its owner.
      if (!stored.manualControl && !stored.world.movement && session.world.zone === 'work'
        && this.layoutSlotValid('work', session.world.slotIndex) && this.workstationAllowed(session, session.world.slotIndex)
        && (session.world.slotIndex !== MINI_WORKSTATION_SLOT || !this.occupiedSlots(session.sessionId, 'work').has(MINI_WORKSTATION_SLOT))) {
        if (this.environment === 'factory25d' && session.world.slotIndex === MINI_WORKSTATION_SLOT && zoneForActivity(session.activity) === 'work') session.world.miniWork ??= { startedAt: timestamp };
        continue;
      }
      this.syncWorld(session, timestamp);
    }
    this.restoringWorkReservations.clear();
    for (const session of this.sessions.values()) this.stationTickets.track(session, timestamp);
    for (const visit of this.stationTickets.snapshot().visits) if (!this.sessions.has(visit.sessionId)) this.stationTickets.forget(visit.sessionId, timestamp);
    this.pruneWorld(timestamp, false);
  }

  private layoutSlotValid(zone: 'work' | 'waiting' | 'idle', index: number | undefined): index is number {
    if (index === undefined || !Number.isInteger(index) || index < 0) return false;
    if (zone === 'work' && index >= WORLD_LAYOUTS[this.environment].workSlots.length) return false;
    const point = slotPosition(this.environment, zone, index), bounds = this.worldBounds;
    return Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= bounds.minX && point.x <= bounds.maxX
      && point.y >= bounds.minY && point.y <= bounds.maxY;
  }

  private boundedLayoutSlots(zone: 'work' | 'waiting' | 'idle'): number[] {
    const indices: number[] = [], positions = new Set<string>();
    // The layout's overflow formulas can extend offscreen or repeat. Enumerate a
    // fixed search window and retain only distinct, usable destination points.
    const limit = zone === 'work' ? WORLD_LAYOUTS[this.environment].workSlots.length : 256;
    for (let index = 0; index < limit; index++) {
      if (!this.layoutSlotValid(zone, index)) continue;
      const point = slotPosition(this.environment, zone, index), key = `${point.x}:${point.y}`;
      if (!positions.has(key)) { positions.add(key); indices.push(index); }
    }
    return indices;
  }

  private boundedEntrance(): Position {
    const point = WORLD_LAYOUTS[this.environment].entrance, bounds = this.worldBounds;
    return { x: Math.max(bounds.minX, Math.min(bounds.maxX, point.x)), y: Math.max(bounds.minY, Math.min(bounds.maxY, point.y)) };
  }

  private restoreDifferentLayout(snapshot: WorldSnapshot, timestamp: number): void {
    const sessions = snapshot.agents.map(stored => {
      const session = restoreSession(stored);
      delete session.manualControl; this.knownSessions.add(session.sessionId); return session;
    });
    this.sessions.clear();
    const claimed = { work: new Set<number>(), waiting: new Set<number>(), idle: new Set<number>() };
    const available = { work: this.boundedLayoutSlots('work'), waiting: this.boundedLayoutSlots('waiting'), idle: this.boundedLayoutSlots('idle') };
    const placed = new Set<string>();
    const claim = (zone: 'work' | 'waiting' | 'idle', preferred?: number) => {
      const index = preferred !== undefined && available[zone].includes(preferred) && !claimed[zone].has(preferred)
        ? preferred : available[zone].find(index => !claimed[zone].has(index) && !(this.environment === 'factory25d' && zone === 'work' && index === MINI_WORKSTATION_SLOT));
      if (index !== undefined) claimed[zone].add(index);
      return index;
    };
    const place = (session: WorldAgent, zone: 'work' | 'waiting' | 'idle', index: number | undefined) => {
      session.world = { zone, ...(index === undefined ? {} : { slotIndex: index }),
        position: index === undefined ? this.boundedEntrance() : slotPosition(this.environment, zone, index), facing: zone === 'work' ? 'up' : 'down' };
      placed.add(session.sessionId);
    };

    // Convert unfinished session endings before remapping zones, preserving their
    // work reservation and the original removal/gravestone deadline.
    for (const session of sessions) if (session.activity === 'stopped' && !this.tombstones.has(session.sessionId)) {
      const removalAt = session.lastEventAt + STOPPED_REMOVAL_DELAY_MS;
      if (removalAt + TOMBSTONE_DURATION_MS <= timestamp) continue;
      this.tombstones.set(session.sessionId, { sessionId: session.sessionId, username: session.username, avatar: clone(session.avatar),
        position: this.boundedEntrance(), ...(session.world.zone === 'work' && session.world.slotIndex !== undefined ? { slotIndex: session.world.slotIndex } : {}),
        createdAt: Math.min(timestamp, removalAt), expiresAt: removalAt + TOMBSTONE_DURATION_MS });
    }
    for (const session of sessions) if (session.activity !== 'stopped') this.tombstones.delete(session.sessionId);

    // Existing valid reservations win regardless of snapshot insertion order.
    // Removed patio slots become memorials; they cannot reserve nonexistent machines.
    for (const stone of this.tombstones.values()) {
      if (this.layoutSlotValid('work', stone.slotIndex) && this.workstationAllowed(stone, stone.slotIndex) && !claimed.work.has(stone.slotIndex)) {
        claimed.work.add(stone.slotIndex); stone.position = slotPosition(this.environment, 'work', stone.slotIndex);
      } else delete stone.slotIndex;
    }
    for (const session of sessions) {
      if (session.activity === 'stopped' || session.world.zone !== 'work' || !this.layoutSlotValid('work', session.world.slotIndex) || !this.workstationAllowed(session, session.world.slotIndex)
        || claimed.work.has(session.world.slotIndex)) continue;
      claimed.work.add(session.world.slotIndex); place(session, 'work', session.world.slotIndex);
      if (this.environment === 'factory25d' && session.world.slotIndex === MINI_WORKSTATION_SLOT && zoneForActivity(session.activity) === 'work') session.world.miniWork = { startedAt: timestamp };
    }
    for (const session of sessions) {
      if (session.activity === 'stopped' || placed.has(session.sessionId)) continue;
      const zone = zoneForActivity(session.activity);
      if (zone === 'work' || session.world.zone !== zone || !this.layoutSlotValid(zone, session.world.slotIndex) || !available[zone].includes(session.world.slotIndex)
        || claimed[zone].has(session.world.slotIndex)) continue;
      claimed[zone].add(session.world.slotIndex); place(session, zone, session.world.slotIndex);
    }
    for (const session of sessions) {
      if (session.activity === 'stopped') continue;
      if (!placed.has(session.sessionId)) {
        let zone = zoneForActivity(session.activity), index = claim(zone);
        if (zone === 'work' && index === undefined) { zone = 'waiting'; index = claim(zone); }
        // No usable slot: keep the session visible at the bounded entrance rather
        // than inventing an offscreen slot or discarding it.
        place(session, zone, index);
      }
      this.sessions.set(session.sessionId, session);
    }
    for (const stone of this.tombstones.values()) if (stone.slotIndex === undefined) {
      const index = claim('waiting'); stone.position = index === undefined ? this.boundedEntrance() : slotPosition(this.environment, 'waiting', index);
    }
  }

  private advanceFactoryRoaming(timestamp: number): void {
    const changes: WorldChange[] = [];
    for (const session of this.sessions.values()) {
      if (this.garageDrivers.has(session.sessionId) || this.garageYielding.has(session.sessionId)) continue;
      const packingAt = session.world.miniWork?.packingAt;
      if (packingAt !== undefined && timestamp >= packingAt + MINI_WORK_PACK_MS) {
        if (session.world.zone === 'work' && session.world.slotIndex === MINI_WORKSTATION_SLOT && zoneForActivity(session.activity) === 'work' && !session.manualControl) session.world.miniWork = { startedAt: packingAt + MINI_WORK_PACK_MS };
        else delete session.world.miniWork;
        changes.push({ kind: 'agent_upsert', agent: clone(session) });
      }
      if (!session.manualControl && session.world.zone === 'waiting' && zoneForActivity(session.activity) === 'work'
        && this.allocateSlot(session.sessionId, 'work', this.preferredFactoryWorkstation(session, this.currentWorldPosition(session, timestamp))) < WORLD_LAYOUTS.factory25d.workSlots.length) {
        this.syncWorld(session, timestamp);
        changes.push({ kind: 'agent_upsert', agent: clone(session) });
      }
      if (session.activity !== 'idle' || session.manualControl) { this.idleRoamAt.delete(session.sessionId); continue; }
      if (session.world.movement && timestamp < session.world.movement.arrivesAt) continue;
      if ((session.world.idleVisit || session.world.carVisit) && session.world.movement) {
        const finishesAt = (session.world.carVisit?.startedAt ?? session.world.movement.arrivesAt) + GARAGE_CAR_VISIT_MS;
        session.world = {...session.world,position:{...session.world.movement.to},movement:undefined,facing:'up'};
        this.idleRoamAt.set(session.sessionId,finishesAt);
        if (timestamp < finishesAt) { changes.push({kind:'agent_upsert',agent:clone(session)}); continue; }
      }
      const seed = Array.from(session.sessionId).reduce((sum, char) => sum + char.charCodeAt(0), 0);
      const ready = this.idleRoamAt.get(session.sessionId);
      if (ready === undefined) { this.idleRoamAt.set(session.sessionId, timestamp + IDLE_ROAM_DELAY_MS + seed % 8000); continue; }
      if (timestamp < ready) continue;
      const slotIndex = session.world.zone === 'idle' && session.world.slotIndex !== undefined ? session.world.slotIndex : this.allocateSlot(session.sessionId, 'idle');
      const home = slotPosition(this.environment, 'idle', slotIndex);
      if (session.world.idleVisit || session.world.carVisit) {
        if (this.moveFactoryIdle(session,home,slotIndex,timestamp)) changes.push({kind:'agent_upsert',agent:clone(session)});
        continue;
      }
      const visit = (this.idleExcursionCount.get(session.sessionId) ?? 0) + 1;
      this.idleExcursionCount.set(session.sessionId, visit);
      const due = session.username === MINI_REGULAR_USERNAME ? visit%2===1 : (visit+seed)%16===0;
      if (due) {
        const occupied = [...this.sessions.values()].filter(other=>other.sessionId!==session.sessionId&&(other.world.idleVisit||other.world.carVisit)&&!other.manualControl).map(other=>other.world.movement?.to??other.world.position);
        const lookout = GARAGE_MINI_LOOKOUTS.map(toFactoryWorld).find(point=>occupied.every(other=>Math.hypot(point.x-other.x,point.y-other.y)>48));
        const miniSeat = toFactoryWorld(garageCarLookout('mini'));
        const seated = lookout && Math.hypot(lookout.x-miniSeat.x,lookout.y-miniSeat.y)<1 && !this.garageCarOccupied('mini');
        if (lookout && this.moveFactoryIdle(session,lookout,slotIndex,timestamp,'garage-mini',seated ? 'mini' : undefined)) {
          changes.push({kind:'agent_upsert',agent:clone(session)}); continue;
        }
      }
      const places = [home, toFactoryWorld({x:4.7 + seed % 3 * 0.55,z:9.4}),
        toFactoryWorld({x:-3.8 + seed % 5 * 1.6,z:-3.7}), toFactoryWorld({x:10.4 + seed % 4 * 2.3,z:7.7})];
      const target = places[visit % places.length];
      if(this.moveFactoryIdle(session,target,slotIndex,timestamp)) changes.push({kind:'agent_upsert',agent:clone(session)});
    }
    if(changes.length) this.commit(changes,false,timestamp);
    this.maybeStartRockPaperScissors(timestamp);
  }

  private moveFactoryIdle(session: WorldAgent,target: Position,slotIndex: number,timestamp: number,idleVisit?: 'garage-mini',car?: GarageCarId): boolean {
    const from=this.currentWorldPosition(session,timestamp),path=factory25dWaypoints(from,target);
    const route=[from,...path,target].map(fromFactoryWorld);
    if(route.slice(1).some((point,index)=>!clearFactorySegment(route[index],point))) {
      this.idleRoamAt.set(session.sessionId,timestamp+2_000); return false;
    }
    const distance=routeDistance(from,path,target),arrivesAt=timestamp+Math.ceil(distance/WORLD_MOVE_SPEED*1000);
    session.world={zone:'idle',slotIndex,position:from,facing:idleVisit||car?'up':'down',...(idleVisit?{idleVisit}:{}),...(car?{carVisit:{car,startedAt:arrivesAt}}:{}),movement:{from,to:target,waypoints:path,startedAt:timestamp,arrivesAt}};
    const seed=Array.from(session.sessionId).reduce((sum,char)=>sum+char.charCodeAt(0),0);
    this.idleRoamAt.set(session.sessionId,arrivesAt+IDLE_ROAM_DELAY_MS+seed%8000);
    return true;
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

  private observeTickets(session: WorldAgent, timestamp: number) {
    if (this.environment !== 'factory25d') return false;
    const payout = this.stationTickets.observe(session, timestamp, this.grabbedSession(session.sessionId) || this.garageDrivers.has(session.sessionId) || this.garageYielding.has(session.sessionId));
    if (payout) session.ticketPayout = payout;
    return !!payout;
  }

  private advanceTickets(timestamp: number) {
    if (this.environment !== 'factory25d') return;
    const changes: WorldChange[] = [];
    for (const session of this.sessions.values()) {
      let changed = this.observeTickets(session, timestamp);
      const payout = session.ticketPayout;
      if (payout && timestamp >= payout.collectAt) {
        // Attention was published at once; only the departure waits for collection.
        if (session.world.zone === 'work' && zoneForActivity(session.activity) !== 'work') { this.syncWorld(session, timestamp); changed = true; }
        if (timestamp > payout.collectAt + 1000) { delete session.ticketPayout; changed = true; }
      }
      if (changed) changes.push({ kind: 'agent_upsert', agent: clone(session) });
    }
    // Persist unfinished work periodically, without a new broadcast every rendered frame.
    if (changes.length || timestamp - this.ticketCheckpointAt >= 30_000) {
      this.ticketCheckpointAt = timestamp; this.commit(changes, !!changes.length, timestamp);
    }
  }

  advanceWorld(timestamp = this.now()): void {
    this.advanceTickets(timestamp);
    this.pruneWorld(timestamp, true);
    if (this.environment === 'factory25d') { this.advanceFactoryRoaming(timestamp); return; }
    if (this.environment !== 'arcade') return;

    const changes: WorldChange[] = [];
    for (const session of this.sessions.values()) {
      if (session.world.zone === 'waiting' && zoneForActivity(session.activity) === 'work' && !session.manualControl
        && this.allocateSlot(session.sessionId, 'work') < WORLD_LAYOUTS[this.environment].workSlots.length) {
        this.syncWorld(session, timestamp); changes.push({ kind: 'agent_upsert', agent: clone(session) });
      }
      if (session.activity !== 'idle' || session.manualControl) {
        this.idleRoamAt.delete(session.sessionId);
        this.windowVisitors.delete(session.sessionId);
        continue;
      }

      const current = this.currentWorldPosition(session, timestamp);
      if (session.world.movement && timestamp < session.world.movement.arrivesAt) continue;

      const seed = Array.from(session.sessionId).reduce((sum, char) => sum + char.charCodeAt(0), 0);
      const scheduledAt = this.idleRoamAt.get(session.sessionId);
      if (scheduledAt === undefined) {
        this.idleRoamAt.set(session.sessionId, timestamp + IDLE_ROAM_DELAY_MS + (seed % 8_000));
        continue;
      }
      if (timestamp < scheduledAt) continue;

      const slotIndex = session.world.zone === 'idle' && session.world.slotIndex !== undefined
        ? session.world.slotIndex
        : this.allocateSlot(session.sessionId, 'idle');
      const home = slotPosition(this.environment, 'idle', slotIndex);
      if (this.windowVisitors.delete(session.sessionId)) {
        const path = workstationWaypoints(
          this.environment,
          current,
          home,
          'manual',
          'idle',
          undefined,
          slotIndex,
        );
        const distance = routeDistance(current, path, home);
        const arrivesAt = timestamp + Math.ceil(distance / WORLD_MOVE_SPEED * 1_000);
        session.world = {
          zone: 'idle',
          slotIndex,
          position: current,
          facing: 'down',
          movement: {
            from: current,
            to: home,
            waypoints: path,
            startedAt: timestamp,
            arrivesAt,
          },
        };
        this.idleRoamAt.set(session.sessionId, arrivesAt + IDLE_ROAM_DELAY_MS + (seed % 8_000));
        changes.push({ kind: 'agent_upsert', agent: clone(session) });
        continue;
      }

      const excursionCount = (this.idleExcursionCount.get(session.sessionId) ?? 0) + 1;
      this.idleExcursionCount.set(session.sessionId, excursionCount);
      if ((seed + excursionCount) % 3 === 0) {
        const occupiedLookouts = new Set(Array.from(this.windowVisitors, visitorId => {
          const visitor = this.sessions.get(visitorId);
          const destination = visitor?.world.movement?.to ?? visitor?.world.position;
          return destination ? `${destination.x}:${destination.y}` : '';
        }));
        const start = seed % ARCADE_WINDOW_LOOKOUTS.length;
        const lookout = Array.from({ length: ARCADE_WINDOW_LOOKOUTS.length }, (_, offset) =>
          ARCADE_WINDOW_LOOKOUTS[(start + offset) % ARCADE_WINDOW_LOOKOUTS.length],
        ).find(point => !occupiedLookouts.has(`${point.x}:${point.y}`));
        if (!lookout) {
          this.idleRoamAt.set(session.sessionId, timestamp + 2_000);
          continue;
        }
        const path = arcadeWindowWaypoints(current, lookout);
        const distance = routeDistance(current, path, lookout);
        const arrivesAt = timestamp + Math.ceil(distance / WORLD_MOVE_SPEED * 1_000);
        session.world = {
          zone: 'idle',
          slotIndex,
          position: current,
          facing: 'up',
          movement: {
            from: current,
            to: lookout,
            waypoints: path,
            startedAt: timestamp,
            arrivesAt,
          },
        };
        this.windowVisitors.add(session.sessionId);
        this.idleRoamAt.set(session.sessionId, arrivesAt + WINDOW_GAZE_DURATION_MS);
        changes.push({ kind: 'agent_upsert', agent: clone(session) });
        continue;
      }

      const path = arcadePlantWaypoints(
        current,
        DANCE_FLOOR_PATHS[seed % DANCE_FLOOR_PATHS.length],
        home,
      );
      const distance = routeDistance(current, path, home);
      const arrivesAt = timestamp + Math.ceil(distance / WORLD_MOVE_SPEED * 1_000);
      session.world = {
        zone: 'idle',
        slotIndex,
        position: current,
        facing: 'right',
        movement: {
          from: current,
          to: home,
          waypoints: path.map(point => ({ ...point })),
          startedAt: timestamp,
          arrivesAt,
        },
      };
      this.idleRoamAt.set(session.sessionId, arrivesAt + IDLE_ROAM_DELAY_MS + (seed % 8_000));
      changes.push({ kind: 'agent_upsert', agent: clone(session) });
    }
    if (changes.length > 0) this.commit(changes, false, timestamp);
    this.maybeStartRockPaperScissors(timestamp);
  }

  private maybeStartRockPaperScissors(timestamp: number): void {
    const candidates = Array.from(this.sessions.values())
      .filter(session => (
        (session.activity === 'idle' || session.activity === 'waiting')
        && !session.manualControl
        && (!session.world.movement || timestamp >= session.world.movement.arrivesAt)
      ))
      .sort((a, b) => a.sessionId.localeCompare(b.sessionId));

    for (let firstIndex = 0; firstIndex < candidates.length; firstIndex++) {
      const first = candidates[firstIndex];
      const firstPosition = this.currentWorldPosition(first, timestamp);
      for (let secondIndex = firstIndex + 1; secondIndex < candidates.length; secondIndex++) {
        const second = candidates[secondIndex];
        const secondPosition = this.currentWorldPosition(second, timestamp);
        if (Math.hypot(secondPosition.x - firstPosition.x, secondPosition.y - firstPosition.y) > RPS_PROXIMITY_PX) continue;

        const pairKey = rpsPairKey(first.sessionId, second.sessionId);
        const readyAt = this.rpsReadyAt.get(pairKey);
        if (readyAt === undefined) {
          this.rpsReadyAt.set(pairKey, timestamp + rpsDelayForPair(first.sessionId, second.sessionId));
          continue;
        }
        if (timestamp >= readyAt && this.startRockPaperScissors(first.sessionId, second.sessionId, timestamp)) return;
      }
    }
  }

  handleHookEvent(payload: HookPayload): void {
    const savedAvatar = payload.ownerId && this.avatarResolver?.(payload.ownerId);
    if (savedAvatar) payload = { ...payload, avatar: clone(savedAvatar) };
    const { hook_event_name, session_id } = payload;
    const ticketAgent = this.sessions.get(session_id);
    if (ticketAgent && (!payload.agent_id || hook_event_name === 'SubagentStart'
      || ticketAgent.subagents.some(child => child.agentId === payload.agent_id))) {
      ticketAgent.ticketHookAt ??= ticketAgent.lastEventAt;
      if (['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'PreCompact', 'PostCompact', 'ElicitationResult', 'SubagentStart', 'SubagentStop'].includes(hook_event_name)) ticketAgent.ticketHookAt = this.now();
    }

    // Codex tags child work with agent_id while retaining the parent session_id.
    // A child's progress cannot answer the parent's question or finish its turn.
    if (payload.agent_id && hook_event_name !== 'SubagentStart' && hook_event_name !== 'SubagentStop') {
      this.handleSubagentHook(payload);
      return;
    }

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
        delete s.attention;

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
        this.setAttention(s, 'error');
        console.log(`[state] TOOL_FAILURE: id=${payload.session_id} tool=${payload.tool_name} reason=${payload.reason}`);
        this.touchAndEmit(payload, 'error', { tool: payload.tool_name, reason: payload.reason });
        break;
      }
      case 'StopFailure': {
        const s = this.ensureSession(payload);
        if (!s) break;
        s.activity = 'idle';
        s.currentTool = null;
        this.setAttention(s, 'error');
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
        delete s.attention;
        console.log(`[state] COMPACT_START: id=${payload.session_id} user=${s.username}`);
        this.touchAndEmit(payload, 'compact', { phase: 'pre' });
        break;
      }
      case 'PostCompact': {
        const s = this.ensureSession(payload);
        if (!s) break;
        s.activity = 'thinking';
        delete s.attention;
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
        this.setAttention(s, 'input');
        console.log(`[state] ELICITATION: id=${payload.session_id} user=${s.username} activity=waiting`);
        this.touchAndEmit(payload, 'elicitation', { type: 'mcp_input' });
        break;
      }
      case 'ElicitationResult': {
        const s = this.ensureSession(payload);
        if (!s) break;
        s.activity = 'thinking';
        delete s.attention;
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

  findSessionsByOwnerId(ownerId: string): WorldAgent[] {
    return Array.from(this.sessions.values())
      .filter(session => session.ownerId === ownerId && session.activity !== 'stopped')
      .sort((a, b) => b.lastEventAt - a.lastEventAt);
  }

  findSessionByOwnerId(ownerId: string): WorldAgent | undefined {
    return this.findSessionsByOwnerId(ownerId)[0];
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

  /** Place an active agent at a specific free workstation and persist the shared assignment. */
  assignWorkstation(sessionId: string, slotIndex: number): boolean {
    const session = this.sessions.get(sessionId);
    const slots = WORLD_LAYOUTS[this.environment].workSlots;
    if (!session || session.activity === 'stopped' || !Number.isInteger(slotIndex) || !slots[slotIndex]) return false;
    if (!this.workstationAllowed(session, slotIndex)) return false;
    const mini = this.environment === 'factory25d' && slotIndex === MINI_WORKSTATION_SLOT;
    if (mini && (session.manualControl || this.garageCarOccupied('mini', sessionId) || session.world.carVisit?.car === 'mini')) return false;

    const occupiedByAgent = Array.from(this.sessions.values()).some(candidate =>
      candidate.sessionId !== sessionId
      && candidate.activity !== 'stopped'
      && candidate.world.zone === 'work'
      && candidate.world.slotIndex === slotIndex,
    );
    const occupiedByTombstone = Array.from(this.tombstones.values()).some(tombstone =>
      tombstone.sessionId !== sessionId && tombstone.slotIndex === slotIndex,
    );
    if (occupiedByAgent || occupiedByTombstone) return false;

    const timestamp = this.now();
    this.observeTickets(session, timestamp);
    const payout = this.stationTickets.collect(sessionId, timestamp); if (payout) session.ticketPayout = payout;
    this.idleRoamAt.delete(sessionId);
    session.world = {
      zone: 'work',
      slotIndex,
      position: slotPosition(this.environment, 'work', slotIndex),
      facing: 'up',
      ...(mini && zoneForActivity(session.activity) === 'work' ? { miniWork: { startedAt: timestamp } } : {}),
    };
    this.commit([{ kind: 'agent_upsert', agent: clone(session) }], true, timestamp);
    return true;
  }

  /** Accept a client workstation hint only when the released pointer is actually near it. */
  assignNearbyWorkstation(sessionId: string, slotIndex: number, position: Position): boolean {
    if (nearestWorkstationSlot(this.environment, position) !== slotIndex) return false;
    return this.assignWorkstation(sessionId, slotIndex);
  }

  setManualControl(sessionId: string, control: ManualControlState): WorldAgent | undefined {
    const session = this.sessions.get(sessionId);
    if (!session || session.activity === 'stopped') return undefined;
    const lift=this.environment==='factory25d'&&session.world.movement?factoryElevatorTripAt(session.world.movement,this.now()):undefined;
    const current=this.currentWorldPosition(session);
    const landing=lift&&lift.progress>0&&lift.progress<1&&Math.hypot(control.x-current.x,control.y-current.y)<1
      ? toFactoryWorld(lift.progress<.5?lift.departure:lift.arrival):control;
    session.manualControl = { ...control, x:landing.x, y:landing.y };
    this.emit('update', { agent: session });
    return session;
  }

  updateManualControl(sessionId: string, control: ManualControlState): WorldAgent | undefined {
    const session = this.sessions.get(sessionId);
    if (!session?.manualControl || session.activity === 'stopped') return undefined;
    if (session.manualControl.elevatorTrip && !control.elevatorTrip) {
      session.world = { zone: 'manual', position: { x: control.x, y: control.y }, facing: control.facing };
    }
    session.manualControl = { ...control };
    this.emit('update', { agent: session });
    return session;
  }

  clearManualControl(sessionId: string): WorldAgent | undefined {
    const session = this.sessions.get(sessionId);
    if (!session?.manualControl) return session;
    if (session.manualControl.elevatorTrip) {
      session.world = { zone: 'manual', position: manualElevatorLanding(session.manualControl.elevatorTrip, this.now()), facing: 'down' };
    }
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
        // Don't reap sessions that are still alive in Claude's session registry,
        // locally or as reported by the machine they run on
        if (this.sessionAliveCheck?.(id) || this.sessionKeepAliveCheck?.(id, session.ownerId)) {
          // Touch liveness without extending station reward eligibility.
          session.ticketHookAt ??= session.lastEventAt;
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
    // Reconnecting to a session is not proof that its question was answered.
    const retainedAttention = !wasStopped && !hadPendingRemoval ? existing?.attention : undefined;

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
      existing.activity = retainedAttention?.kind === 'input' || retainedAttention?.kind === 'permission' ? 'waiting' : 'idle';
      existing.currentTool = null;
      existing.lastEventAt = now;
      this.emit('update', { agent: existing });
      return;
    }

    {
      const session: WorldAgent = {
        sessionId: payload.session_id,
        username: payload.username || 'anonymous',
        ownerId: payload.ownerId,
        avatar: payload.avatar || DEFAULT_AVATAR,
        cwd: payload.cwd || '',
        activity: retainedAttention?.kind === 'input' || retainedAttention?.kind === 'permission' ? 'waiting' : 'idle',
        ...(retainedAttention ? { attention: clone(retainedAttention) } : {}),
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
    delete session.attention;
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
    if (toolName === 'AskUserQuestion' || toolName === 'request_user_input') this.setAttention(session, 'input');
    else if (toolName === 'ExitPlanMode') this.setAttention(session, 'permission');
    else delete session.attention;
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
    delete session.attention;
    session.lastEventAt = this.now();
    console.log(`[state] TOOL_COMPLETE: id=${payload.session_id} user=${session.username} tool=${payload.tool_name} activity=${session.activity}`);

    if (toolName === 'EnterWorktree') {
      if (payload.session_name) session.sessionName = payload.session_name;
    } else if (toolName === 'ExitPlanMode') {
      session.sessionName = undefined;
      // Successful PostToolUse arrives after the approval interaction completed.
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

  private handleSubagentHook(payload: HookPayload): void {
    // Do not ensureSession here: an out-of-order or unknown child must never
    // create/resume a top-level agent or replace its identity from child metadata.
    const parent = this.sessions.get(payload.session_id);
    const child = parent?.subagents.find(agent => agent.agentId === payload.agent_id);
    if (!parent || parent.activity === 'stopped' || !child) return;

    switch (payload.hook_event_name) {
      case 'PreToolUse': child.activity = toolToActivity(payload.tool_name || 'unknown'); break;
      case 'PermissionRequest':
      case 'Elicitation': child.activity = 'waiting'; break;
      case 'PostToolUse':
      case 'PostToolUseFailure':
      case 'UserPromptSubmit':
      case 'PostCompact':
      case 'ElicitationResult': child.activity = 'thinking'; break;
      case 'PreCompact': child.activity = 'compacting'; break;
      case 'Stop': if (child.activity !== 'waiting') child.activity = 'idle'; break;
      case 'StopFailure': child.activity = 'idle'; break;
      default: return;
    }
    parent.lastEventAt = this.now();
    // Publish the changed child without rerouting or emitting a parent bubble.
    this.commit([{ kind: 'agent_upsert', agent: clone(parent) }], false);
  }

  private handleSubagentStop(payload: HookPayload): void {
    const session = this.sessions.get(payload.session_id);
    if (!session || session.activity === 'stopped') return;
    const agentId = payload.agent_id;
    if (agentId && !session.subagents.some(agent => agent.agentId === agentId)) return;

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
    this.setAttention(session, 'permission');
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
      this.setAttention(session, 'ready');
    }
    session.currentTool = null;
    session.lastEventAt = this.now();
    console.log(`[state] STOP: id=${payload.session_id} user=${session.username} activity=${session.activity} preserved=${session.activity === 'waiting'}`);
    this.emit('update', { agent: session });
  }

  private setAttention(session: WorldAgent, kind: AgentAttention['kind']): void {
    // Duplicate hooks and reconnects must not restart the viewer's alert timer.
    if (session.attention?.kind !== kind) session.attention = { kind, since: this.now() };
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
        ownerId: payload.ownerId,
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
    if (session.manualControl?.elevatorTrip) return manualElevatorLanding(session.manualControl.elevatorTrip, timestamp);
    return session.world.movement
      ? positionAt(session.world.movement, timestamp)
      : { ...session.world.position };
  }

  private syncWorld(session: WorldAgent, timestamp = this.now()): void {
    this.observeTickets(session, timestamp);
    const payout = session.ticketPayout;
    if (payout && timestamp < payout.collectAt && session.world.zone === 'work'
      && session.world.slotIndex === payout.slotIndex && !session.manualControl && !this.grabbedSession(session.sessionId)) {
      session.world.position = this.currentWorldPosition(session, timestamp); delete session.world.movement;
      session.world.facing = 'up'; return;
    }
    // Work begins immediately as data; the seated person finishes the safe car
    // return before walking to their workstation. Manual/grab/stopped overrides win.
    if (this.garageDrivers.has(session.sessionId) && !session.manualControl && session.activity !== 'stopped' && !this.grabbedSession(session.sessionId)) return;
    // Hooks must not re-open the portable workstation while a viewer is holding its agent.
    if (this.environment === 'factory25d' && !session.manualControl && session.activity !== 'stopped' && this.grabbedSession(session.sessionId)) {
      const mini = !!session.world.miniWork || session.world.zone === 'work' && session.world.slotIndex === MINI_WORKSTATION_SLOT;
      session.world = { ...session.world, position: this.currentWorldPosition(session, timestamp), movement: undefined };
      delete session.world.miniWork; delete session.world.carVisit; delete session.world.idleVisit;
      if (mini) { session.world.zone = zoneForActivity(session.activity) === 'work' ? 'waiting' : zoneForActivity(session.activity); delete session.world.slotIndex; }
      return;
    }
    if (this.environment !== 'factory25d' || session.manualControl || session.activity === 'stopped' || !this.workstationAllowed(session, MINI_WORKSTATION_SLOT)) delete session.world.miniWork;
    else if (session.world.miniWork) {
      const work = session.world.miniWork;
      if (work.packingAt !== undefined && timestamp >= work.packingAt + MINI_WORK_PACK_MS) {
        if (zoneForActivity(session.activity) === 'work' && session.world.zone === 'work' && session.world.slotIndex === MINI_WORKSTATION_SLOT) session.world.miniWork = { startedAt: work.packingAt + MINI_WORK_PACK_MS };
        else delete session.world.miniWork;
      } else if (work.packingAt === undefined && zoneForActivity(session.activity) !== 'work') {
        if (timestamp >= work.startedAt + MINI_WORK_RETRIEVAL_MS) session.world.miniWork = { ...work, packingAt: timestamp };
        else delete session.world.miniWork; // No laptop was retrieved during approach or the opening setup steps.
      } else if (work.packingAt === undefined && (session.world.zone !== 'work' || session.world.slotIndex !== MINI_WORKSTATION_SLOT)) delete session.world.miniWork;
    }
    const packing = this.packingMini(session, timestamp) ? session.world.miniWork : undefined;
    if((session.world.idleVisit || session.world.carVisit) && session.activity==='idle' && !session.manualControl) return;
    if(session.activity!=='idle'||session.manualControl) { this.idleRoamAt.delete(session.sessionId); delete session.world.idleVisit; delete session.world.carVisit; }
    let current = this.currentWorldPosition(session, timestamp);
    // If work interrupts an elevator visit, re-route from its nearest safe door.
    // An intermediate point in the virtual shaft is never a walkable origin.
    const lift=this.environment==='factory25d'&&session.world.movement?factoryElevatorTripAt(session.world.movement,timestamp):undefined;
    if(lift&&lift.progress>0&&lift.progress<1) current=toFactoryWorld(lift.progress<.5?lift.departure:lift.arrival);
    if (session.manualControl) {
      if (session.manualControl.elevatorTrip) {
        session.world = { zone: 'manual', position: manualElevatorLanding(session.manualControl.elevatorTrip, timestamp), facing: session.manualControl.facing };
        return;
      }
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

    if (this.environment === 'factory25d') current = recoverFactoryPosition(current);

    let zone = zoneForActivity(session.activity);
    const preferred = session.world.zone === zone ? session.world.slotIndex : undefined;
    let slotIndex = this.allocateSlot(session.sessionId, zone, zone === 'work' ? this.preferredFactoryWorkstation(session, current, preferred) : preferred);
    if ((this.environment === 'factory25d' || session.world.zone === 'waiting') && zone === 'work'
      && slotIndex >= WORLD_LAYOUTS[this.environment].workSlots.length) {
      zone = 'waiting';
      const occupied = new Set(Array.from(this.sessions.values()).filter(candidate => candidate.sessionId !== session.sessionId && candidate.world.zone === zone)
        .map(candidate => candidate.world.slotIndex));
      const candidates = this.boundedLayoutSlots(zone), preferred = session.world.zone === zone ? session.world.slotIndex : undefined;
      const available = preferred !== undefined && candidates.includes(preferred) && !occupied.has(preferred)
        ? preferred : candidates.find(index => !occupied.has(index));
      if (available === undefined) {
        session.world = { zone, position: this.boundedEntrance(), facing: 'down' }; return;
      }
      slotIndex = available;
    }
    const target = slotPosition(this.environment, zone, slotIndex);
    const mini = this.environment === 'factory25d' && zone === 'work' && slotIndex === MINI_WORKSTATION_SLOT;
    if (Math.hypot(target.x - current.x, target.y - current.y) < 1) {
      session.world = { zone, slotIndex, position: { ...target }, facing: session.world.facing,
        ...(mini || packing ? { miniWork: session.world.miniWork ?? { startedAt: timestamp } } : {}) }; return;
    }
    const existingMovement = session.world.movement;
    if (existingMovement
      && session.world.zone === zone
      && session.world.slotIndex === slotIndex
      && existingMovement.to.x === target.x
      && existingMovement.to.y === target.y
      && (this.environment !== 'factory25d' || factoryMovementIsClear(existingMovement))
      && timestamp < existingMovement.arrivesAt) {
      session.world.position = current;
      if (mini) session.world.miniWork ??= { startedAt: existingMovement.arrivesAt };
      return;
    }

    const waypoints = workstationWaypoints(
      this.environment,
      current,
      target,
      session.world.zone,
      zone,
      session.world.slotIndex,
      slotIndex,
    );
    if (this.environment === 'factory25d' && !factoryMovementIsClear({ from: current, to: target, waypoints })) {
      // A route can fail after a floor-plan update. Retry from here later instead
      // of treating the empty waypoint list as permission to cross a solid wall.
      session.world = { ...session.world, position: current, movement: undefined };
      return;
    }
    const firstLeg = waypoints[0] ?? target;
    const dx = firstLeg.x - current.x;
    const dy = firstLeg.y - current.y;
    const distance = routeDistance(current, waypoints, target);
    const facing: FacingDirection = Math.abs(dx) > Math.abs(dy)
      ? dx >= 0 ? 'right' : 'left'
      : dy >= 0 ? 'down' : 'up';
    const departsAt = packing ? packing.packingAt! + MINI_WORK_PACK_MS : timestamp;
    const arrivesAt = departsAt + Math.ceil(distance / WORLD_MOVE_SPEED * 1_000);
    session.world = {
      zone,
      slotIndex,
      position: current,
      facing: distance < 1 ? session.world.facing : facing,
      ...(mini || packing ? { miniWork: session.world.miniWork ?? { startedAt: arrivesAt } } : {}),
      movement: distance < 1
        ? undefined
        : {
            from: current,
            to: target,
            waypoints: waypoints.length ? waypoints : undefined,
            startedAt: departsAt,
            arrivesAt,
          },
    };
  }

  private occupiedSlots(sessionId: string, zone: 'work' | 'waiting' | 'idle'): Set<number> {
    const occupied = new Set<number>();
    for (const session of this.sessions.values()) {
      if (session.sessionId !== sessionId && session.world.zone === zone && session.world.slotIndex !== undefined) {
        occupied.add(session.world.slotIndex);
      }
      if (this.environment === 'factory25d' && zone === 'work' && session.sessionId !== sessionId && this.packingMini(session)) occupied.add(MINI_WORKSTATION_SLOT);
    }
    if (zone === 'work') {
      for (const [index, owner] of this.restoringWorkReservations) if (owner !== sessionId) occupied.add(index);
      for (const tombstone of this.tombstones.values()) {
        if (tombstone.sessionId !== sessionId && tombstone.slotIndex !== undefined) {
          occupied.add(tombstone.slotIndex);
        }
      }
    }
    return occupied;
  }

  private preferredFactoryWorkstation(session: WorldAgent, current: Position, preferred?: number): number | undefined {
    if (this.environment !== 'factory25d' || session.username !== MINI_WORKSTATION_USERNAME) return preferred;
    const assignedGarage = session.world.zone === 'work' && session.world.slotIndex !== undefined && WORKSTATIONS[session.world.slotIndex]?.room === 'garage';
    if (!assignedGarage && factoryRoomAt(fromFactoryWorld(current)) !== 'garage') return preferred;
    const occupied = this.occupiedSlots(session.sessionId, 'work');
    if (!occupied.has(MINI_WORKSTATION_SLOT) && !this.garageCarOccupied('mini', session.sessionId)) return MINI_WORKSTATION_SLOT;
    if (preferred !== undefined && preferred !== MINI_WORKSTATION_SLOT && !occupied.has(preferred)) return preferred;
    const regularGarage = WORKSTATIONS.findIndex((station, index) => station.room === 'garage' && index !== MINI_WORKSTATION_SLOT && !occupied.has(index));
    return regularGarage >= 0 ? regularGarage : undefined;
  }

  private allocateSlot(sessionId: string, zone: 'work' | 'waiting' | 'idle', preferred?: number): number {
    const occupied = this.occupiedSlots(sessionId, zone);
    const session = this.sessions.get(sessionId);
    if (this.environment === 'factory25d' && zone === 'work'
      && (preferred !== MINI_WORKSTATION_SLOT || !session || !this.workstationAllowed(session, MINI_WORKSTATION_SLOT) || this.garageCarOccupied('mini', sessionId))) occupied.add(MINI_WORKSTATION_SLOT);
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
    if (this.environment === 'factory25d') {
      for (const change of changes) if (change.kind === 'agent_upsert') {
        const current = this.sessions.get(change.agent.sessionId);
        if (current) { this.observeTickets(current, timestamp); change.agent = clone(current); }
        this.stationTickets.track(change.agent, timestamp, this.grabbedSession(change.agent.sessionId) || this.garageDrivers.has(change.agent.sessionId) || this.garageYielding.has(change.agent.sessionId));
      }
      if (this.ticketVersion !== this.stationTickets.version) {
        changes.push({ kind: 'station_tickets', tickets: this.stationTickets.snapshot() });
        this.ticketVersion = this.stationTickets.version;
      }
    }
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
      this.stationTickets.forget(data.sessionId, this.now());
      const changes: WorldChange[] = [{ kind: 'agent_remove', sessionId: data.sessionId }];
      if (data.agent) {
        const tombstone = this.createTombstone(data.agent, this.now());
        changes.push({ kind: 'tombstone_upsert', tombstone: clone(tombstone) });
      }
      this.commit(changes, true);
    }
  }
}
