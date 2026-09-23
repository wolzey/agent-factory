import { randomUUID } from 'node:crypto';
import type { WebSocket } from '@fastify/websocket';
import { GarageDrivingSimulation, GARAGE_NEUTRAL_INPUT, garageCarBlocksSegment, validGarageDriveInput, type GarageDrivePedestrian, type GarageDriveRequest } from '../shared/factory25d-driving.js';
import { GARAGE_CAR_BAYS, isGarageCarId, type GarageCarId } from '../shared/factory25d-garage.js';
import { factoryCompanionPosition, factoryRoomAt, fromFactoryWorld, GARAGE_WORLD_Z, MINI_WORKSTATION_USERNAME } from '../shared/factory25d-layout.js';
import type { Position, WorldAgent } from '../shared/types.js';
import type { StateManager } from './state.js';
import type { BroadcastManager } from './ws/broadcast.js';

export const GARAGE_INPUT_STALE_MS = 500;
export const GARAGE_LEASE_IDLE_MS = 45_000;
// A driving browser releases its controls after 2.5s without a packet, so repeat an unchanged state at least this often.
const GARAGE_KEEPALIVE_MS = 1_000;
type Peer = { id: string; car?: GarageCarId; inputAt: number; usedAt: number; actionAt: number };

/** Temporary public socket leases, separate from authenticated avatar controls. */
export class GarageDrivingManager {
  readonly simulation = new GarageDrivingSimulation();
  private peers = new Map<WebSocket, Peer>();
  private timer?: ReturnType<typeof setInterval>;
  private previous: number;
  private broadcastAt = -Infinity;
  private broadcastCars = '';
  private markCursor = 0;
  private dirty = true;
  private nextDonut: number;
  private excursion?: { sessionId: string; car: GarageCarId; started: boolean };
  private enabled: boolean;
  constructor(private state: StateManager, private broadcast: BroadcastManager, private now = Date.now) {
    this.enabled = state.getSnapshot().environment === 'factory25d';
    this.previous = now(); this.nextDonut = this.previous + 120_000;
    if (this.enabled) state.setGarageDrivingHooks({ occupied: id => this.simulation.car(id).mode !== 'parked', blocks: (from, to) => this.blocksPedestrian(from, to) });
  }
  start() { if (this.enabled && !this.timer) this.timer = setInterval(() => this.tick(), 50); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; this.peers.clear(); this.state.setGarageDrivingHooks(undefined); }
  sendActive(socket: WebSocket) { if (this.enabled) this.broadcast.sendTo(socket, this.simulation.snapshot(this.now())); }
  receive(socket: WebSocket, value: unknown) {
    if (!this.enabled || !value || typeof value !== 'object') return;
    const msg = value as GarageDriveRequest, now = this.now();
    if (!isGarageCarId(msg.car) || !['claim', 'input', 'release', 'reset'].includes(msg.action)) return;
    let peer = this.peers.get(socket);
    if (!peer) {
      if (msg.action !== 'claim' || this.peers.size >= 128) {
        if (msg.action !== 'input') this.broadcast.sendTo(socket, { type: 'garage_drive_result', action: msg.action, car: msg.car, success: false,
          error: msg.action === 'claim' ? 'The garage is busy. Try again in a moment.' : 'This browser is not driving that car.' });
        return;
      }
      peer = { id: randomUUID(), inputAt: -Infinity, usedAt: -Infinity, actionAt: -Infinity }; this.peers.set(socket, peer);
    }
    const result = (success: boolean, error?: string) => this.broadcast.sendTo(socket, { type: 'garage_drive_result', action: msg.action, car: msg.car, success, visitorId: peer!.id, ...(error ? { error } : {}) });
    if (msg.action === 'input') {
      if (peer.car !== msg.car || this.simulation.car(msg.car).driverVisitorId !== peer.id || !validGarageDriveInput(msg.input)) return;
      const neutral = msg.input.throttle === 0 && msg.input.steer === 0 && !msg.input.drift;
      // Key-up / blur must take effect even immediately after the previous input.
      if (!neutral && now - peer.inputAt < 25) return;
      this.simulation.setInput(msg.car, msg.input); peer.inputAt = now;
      if (Math.abs(msg.input.throttle) > .01 || Math.abs(msg.input.steer) > .01) peer.usedAt = now;
      return;
    }
    if (msg.action !== 'release' && now - peer.actionAt < 50) { result(false, 'Wait a moment before choosing another car action.'); return; }
    peer.actionAt = now;
    if (msg.action === 'claim') {
      const target = this.simulation.car(msg.car);
      if (peer.car === msg.car && target.mode === 'driving' && target.driverVisitorId === peer.id) { result(true); return; }
      const ownParkingCar = target.mode === 'returning' && target.driverVisitorId === peer.id;
      if (!ownParkingCar && this.state.isGarageCarReserved(msg.car)) { result(false, 'That car is occupied. Choose another or wait a moment.'); return; }
      if (!this.simulation.claim(msg.car, peer.id)) { result(false, 'That car is returning to its bay.'); return; }
      peer.car = msg.car; peer.inputAt = peer.usedAt = now; this.dirty = true; result(true); this.flush(now); return;
    }
    if (peer.car !== msg.car || this.simulation.car(msg.car).driverVisitorId !== peer.id) { result(false, 'This browser is not driving that car.'); return; }
    if (msg.action === 'release') {
      // Release stays immediate, but repeated blur/pagehide requests must not
      // restart parking or broadcast unchanged state to every viewer.
      if (this.simulation.car(msg.car).mode === 'returning') { result(true); return; }
      this.simulation.release(msg.car);
    }
    else {
      if (!this.simulation.reset(msg.car)) { result(false, 'The parking bay is blocked. The car will wait for a clear route.'); this.dirty = true; return; }
      peer.car = undefined;
    }
    this.dirty = true; result(true); this.flush(now);
  }
  disconnect(socket: WebSocket) {
    const peer = this.peers.get(socket);
    if (peer?.car && this.simulation.car(peer.car).driverVisitorId === peer.id) { this.simulation.release(peer.car); this.dirty = true; }
    this.peers.delete(socket); this.flush(this.now());
  }
  /** Called after real hook/grab/control changes, never fabricates an agent. */
  syncAgent(agent: WorldAgent | undefined, sessionId = agent?.sessionId) {
    const trip = this.excursion;
    if (!trip || trip.sessionId !== sessionId) return;
    const car = this.simulation.car(trip.car);
    if (!agent || agent.activity === 'stopped' || agent.manualControl || this.state.isSessionGrabbed(trip.sessionId) || !agent.world.carVisit) {
      this.excursion = undefined;
      if (trip.started) { this.simulation.release(trip.car); delete car.driverSessionId; this.state.finishGarageDriver(trip.sessionId); }
      this.dirty = true;
    } else if (trip.started && agent.activity !== 'idle') { this.simulation.release(trip.car); this.dirty = true; }
  }
  private blocksPedestrian(from: Position, to: Position) {
    const a = fromFactoryWorld(from), b = fromFactoryWorld(to);
    if (factoryRoomAt(a) !== 'garage' || factoryRoomAt(b) !== 'garage') return false;
    return this.simulation.cars.some(car => (car.mode !== 'parked' || Math.hypot(car.vx, car.vz) > 0 || Math.hypot(car.x - GARAGE_CAR_BAYS[car.id].x, car.z - GARAGE_CAR_BAYS[car.id].z) > .01) && garageCarBlocksSegment(car, { x: a.x, z: a.z - GARAGE_WORLD_Z }, { x: b.x, z: b.z - GARAGE_WORLD_Z }));
  }
  private pedestrians(now: number): GarageDrivePedestrian[] {
    const result: GarageDrivePedestrian[] = [];
    for (const agent of this.state.getAll()) {
      if (this.simulation.cars.some(car => car.driverSessionId === agent.sessionId) || this.state.isSessionGrabbed(agent.sessionId)) continue;
      const p = fromFactoryWorld(this.state.getCurrentPosition(agent.sessionId, now)!), next = fromFactoryWorld(this.state.getCurrentPosition(agent.sessionId, now + 200)!);
      if (factoryRoomAt(p) !== 'garage') continue;
      result.push({ x: p.x, z: p.z - GARAGE_WORLD_Z, toX: next.x, toZ: next.z - GARAGE_WORLD_Z, sessionId: agent.sessionId, pushable: !agent.world.carVisit && !agent.world.miniWork && !agent.manualControl?.elevatorTrip, radius: agent.world.carVisit ? .65 : .32 });
      agent.subagents.forEach((_, i) => { const child = factoryCompanionPosition(p, i); result.push({ x: child.x, z: child.z - GARAGE_WORLD_Z, radius: .22 }); });
    }
    return result;
  }
  tick(timestamp = this.now()) {
    if (!this.enabled) return;
    const dt = Math.max(0, Math.min(.1, (timestamp - this.previous) / 1000)); this.previous = timestamp;
    for (const peer of this.peers.values()) if (peer.car) {
      const car = this.simulation.car(peer.car);
      if (car.mode === 'parked' || car.driverVisitorId !== peer.id) { peer.car = undefined; continue; }
      if (timestamp - peer.inputAt > GARAGE_INPUT_STALE_MS) this.simulation.setInput(peer.car, GARAGE_NEUTRAL_INPUT);
      if (car.mode === 'driving' && timestamp - peer.usedAt > GARAGE_LEASE_IDLE_MS) this.simulation.release(peer.car);
    }
    this.state.yieldToGarageCars(timestamp);
    const active = this.simulation.cars.some(car => car.mode !== 'parked' || car.damage > 0 || Math.hypot(car.vx, car.vz) > 0);
    this.simulation.step(dt, timestamp, this.pedestrians(timestamp));
    this.state.applyGaragePedestrianPushes(this.simulation.pedestrianPushes, timestamp);
    this.advanceExcursion(timestamp);
    this.dirty ||= active || this.simulation.cars.some(car => car.mode !== 'parked');
    if (this.dirty && timestamp - this.broadcastAt >= 100) this.flush(timestamp);
  }
  private advanceExcursion(now: number) {
    const trip = this.excursion;
    if (trip) {
      const agent = this.state.get(trip.sessionId); this.syncAgent(agent, trip.sessionId);
      if (!this.excursion || !agent) return;
      const car = this.simulation.car(trip.car);
      if (!trip.started) {
        if (agent.activity !== 'idle') { this.excursion = undefined; return; }
        if (now < agent.world.carVisit!.startedAt + 4_050) return;
        if (this.state.isGarageCarReserved(trip.car, trip.sessionId) || !this.simulation.startDonut(trip.car, trip.sessionId)) { this.excursion = undefined; return; }
        trip.started = true; this.state.holdGarageDriver(trip.sessionId); this.dirty = true;
      } else if (car.mode === 'parked') {
        this.excursion = undefined; this.state.finishGarageDriver(trip.sessionId, true); this.dirty = true;
      }
      return;
    }
    if (now < this.nextDonut || this.simulation.cars.some(car => car.mode !== 'parked')) return;
    this.nextDonut = now + 180_000;
    const candidates = this.state.getAll().filter(agent => agent.activity === 'idle' && !agent.manualControl && !agent.world.carVisit && !agent.world.miniWork && !this.state.isSessionGrabbed(agent.sessionId))
      .sort((a, b) => {
        const score = (agent: WorldAgent) => (factoryRoomAt(fromFactoryWorld(this.state.getCurrentPosition(agent.sessionId, now)!)) === 'garage' ? 4 : 0) + (agent.username === MINI_WORKSTATION_USERNAME ? 2 : 0);
        return score(b) - score(a);
      });
    const car = (['mini', 'f1', 'delorean'] as GarageCarId[]).find(id => !this.state.isGarageCarReserved(id));
    if (!car) return;
    for (const agent of candidates) if (this.state.startIdleGarageCarVisit(agent.sessionId, car).success) { this.excursion = { sessionId: agent.sessionId, car, started: false }; break; }
  }
  private flush(now: number) {
    if (!this.enabled || !this.dirty) return;
    const snapshot = this.simulation.snapshot(now);
    snapshot.marks = snapshot.marks.filter(mark => mark.id > this.markCursor); snapshot.replaceMarks = false;
    // A car waiting to re-park keeps the garage dirty without moving; skip repeats of the last packet.
    const cars = JSON.stringify(snapshot.cars);
    this.dirty = false;
    if (!snapshot.marks.length && cars === this.broadcastCars && now - this.broadcastAt < GARAGE_KEEPALIVE_MS) return;
    if (snapshot.marks.length) this.markCursor = snapshot.marks.at(-1)!.id;
    this.broadcast.broadcastGarageDriving(snapshot); this.broadcastAt = now; this.broadcastCars = cars;
  }
}
