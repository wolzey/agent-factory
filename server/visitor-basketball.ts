import { randomUUID } from 'node:crypto';
import type { WebSocket } from '@fastify/websocket';
import { validBallVector, type BallVector, type VisitorBallUpdate } from '../shared/visitor-basketball.js';
import type { BroadcastManager } from './ws/broadcast.js';

/** Public, ephemeral ghost balls. This channel never changes agents or scores. */
export class VisitorBasketball {
  private peers = new Map<WebSocket, { id: string; last: number; throwAt: number; state?: VisitorBallUpdate }>();
  constructor(private broadcast: BroadcastManager, private now = Date.now) {}
  receive(socket: WebSocket, value: unknown) {
    if (!value || typeof value !== 'object') return;
    const msg = value as Record<string, unknown>, now = this.now();
    if (!['hold', 'throw', 'cancel'].includes(String(msg.phase))) return;
    if (msg.phase !== 'cancel' && !validBallVector(msg.position)) return;
    if (msg.phase === 'throw' && !validBallVector(msg.velocity, true)) return;
    let peer = this.peers.get(socket);
    if (!peer) {
      if (this.peers.size >= 64 || msg.phase !== 'hold') return;
      peer = { id: randomUUID(), last: -Infinity, throwAt: -Infinity }; this.peers.set(socket, peer);
    }
    if (msg.phase === 'cancel') { this.release(socket); return; }
    if (msg.phase === 'hold' && now - peer.last < 65) return;
    if (msg.phase === 'throw' && (peer.state?.phase !== 'hold' || now - peer.throwAt < 700)) return;
    if (msg.phase === 'throw') peer.throwAt = now;
    peer.last = now;
    const vector = (value: unknown) => { const p = value as BallVector; return { x: p.x, y: p.y, z: p.z }; };
    peer.state = { type: 'visitor_ball_update', visitorId: peer.id, serverTime: now,
      phase: msg.phase as 'hold' | 'throw', position: vector(msg.position),
      ...(msg.phase === 'throw' ? { velocity: vector(msg.velocity) } : {}) };
    this.broadcast.broadcastVisitorBall(peer.state, socket);
  }
  release(socket: WebSocket) {
    const peer = this.peers.get(socket); if (!peer?.state) return;
    peer.state = undefined;
    this.broadcast.broadcastVisitorBall({ type: 'visitor_ball_update', visitorId: peer.id, phase: 'cancel', serverTime: this.now() }, socket);
  }
  disconnect(socket: WebSocket) { this.release(socket); this.peers.delete(socket); }
  sendActive(socket: WebSocket) {
    this.expire();
    for (const [other, peer] of this.peers) if (other !== socket && peer.state) this.broadcast.sendTo(socket, peer.state);
  }
  expire() { for (const [socket, peer] of this.peers) if (peer.state && this.now() - peer.last > 8000) this.release(socket); }
}
