import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { WebSocket } from '@fastify/websocket';
import { BroadcastManager } from '../server/ws/broadcast';
import { VisitorBasketball } from '../server/visitor-basketball';
import { visitorShotVelocity, stepVisitorBall, VISITOR_BALL_RIM, VISITOR_BALL_RADIUS, validBallVector, type FlyingBall } from '../shared/visitor-basketball';
const position = { x: 1.3, y: .6, z: -5.65 };
function setup() {
  let time = 1000;
  const broadcast = new BroadcastManager();
  const socket = () => { const s = Object.assign(new EventEmitter(), { readyState: 1, send: vi.fn() }); broadcast.add(s as unknown as WebSocket); return s as unknown as WebSocket & { send: ReturnType<typeof vi.fn> }; };
  const a = socket(), b = socket(), relay = new VisitorBasketball(broadcast, () => time);
  return { a, b, relay, socket, later: (ms: number) => { time += ms; }, messages: (s = b) => s.send.mock.calls.map(([raw]) => JSON.parse(raw)) };
}
describe('public ghost basketball', () => {
  it('lets an unauthenticated viewer move a ghost for others without echoing it or trusting a supplied identity', () => {
    const s = setup();
    s.relay.receive(s.a, { phase: 'hold', visitorId: 'impersonation', position: { ...position, privateData: 'never broadcast' } });
    const message = s.messages()[0];
    expect(message).toMatchObject({ type: 'visitor_ball_update', phase: 'hold', position, serverTime: 1000 });
    expect(message.visitorId).not.toBe('impersonation'); expect(message.position.privateData).toBeUndefined();
    expect(s.messages(s.a)).toEqual([]);
    s.relay.receive(s.a, { phase: 'throw', position, velocity: visitorShotVelocity(position) });
    expect(s.messages().at(-1)).toMatchObject({ phase: 'throw', visitorId: message.visitorId });
  });
  it('rejects malformed, unbounded, and unstarted throws and limits repeated holds', () => {
    const s = setup();
    for (const invalid of [null, {}, { phase: 'shoot' }, { phase: 'throw', position, velocity: position },
      { phase: 'hold', position: { ...position, y: NaN } }, { phase: 'hold', position: { ...position, x: 99 } }]) s.relay.receive(s.a, invalid);
    expect(s.messages()).toEqual([]);
    s.relay.receive(s.a, { phase: 'hold', position });
    for (let i = 0; i < 100; i++) s.relay.receive(s.a, { phase: 'hold', position });
    expect(s.messages()).toHaveLength(1);
    s.later(70); s.relay.receive(s.a, { phase: 'hold', position }); expect(s.messages()).toHaveLength(2);
    s.relay.receive(s.a, { phase: 'throw', position, velocity: { x: Infinity, y: 2, z: 0 } }); expect(s.messages()).toHaveLength(2);
  });
  it('syncs a recent shot to a new viewer and removes it on cancel, disconnect, or idle timeout', () => {
    const s = setup(); s.relay.receive(s.a, { phase: 'hold', position });
    const c = s.socket(); s.relay.sendActive(c); expect(s.messages(c)).toHaveLength(1);
    s.relay.disconnect(s.a); expect(s.messages().at(-1).phase).toBe('cancel');
    const d = s.socket(); s.relay.sendActive(d); expect(s.messages(d)).toEqual([]);
    s.relay.receive(s.b, { phase: 'hold', position }); s.later(8001); s.relay.expire();
    expect(s.messages(c).at(-1).phase).toBe('cancel');
    const e = s.socket(); s.relay.sendActive(e); expect(s.messages(e)).toEqual([]);
  });
  it('caps active peer allocation and does not let one viewer cancel another’s ghost', () => {
    const s = setup(); s.relay.receive(s.a, { phase: 'hold', position });
    s.relay.receive(s.b, { phase: 'cancel', visitorId: s.messages()[0].visitorId });
    const c = s.socket(); s.relay.sendActive(c); expect(s.messages(c)).toHaveLength(1);
    for (let i = 0; i < 70; i++) s.relay.receive(s.socket(), { phase: 'hold', position });
    const late = s.socket(); s.relay.sendActive(late); expect(s.messages(late)).toHaveLength(64);
  });
});
describe('visitor shot physics', () => {
  it('makes a downward basket from both a low pickup and a raised cursor, at different frame rates', () => {
    for (const y of [VISITOR_BALL_RADIUS, .6, 2.3]) for (const dt of [1 / 60, .1]) {
      const p = { ...position, y }, ball: FlyingBall = { position: p, velocity: visitorShotVelocity(p), scored: false };
      let baskets = 0;
      for (let time = 0; time < 3; time += dt) if (stepVisitorBall(ball, dt).swish) baskets++;
      expect(baskets).toBe(1); expect(ball.position.y).toBeGreaterThanOrEqual(VISITOR_BALL_RADIUS);
    }
  });
  it('does not award a sideways miss or upward pass and keeps finite bounded positions', () => {
    const p = { ...position, x: 2.2 }, ball: FlyingBall = { position: p, velocity: visitorShotVelocity(p, { ...VISITOR_BALL_RIM, x: 2.2 }), scored: false };
    for (let i = 0; i < 60; i++) stepVisitorBall(ball, .1);
    expect(ball.scored).toBe(false); expect(validBallVector(ball.position)).toBe(true);
    const up: FlyingBall = { position: { ...VISITOR_BALL_RIM, y: 1.67 }, velocity: { x: 0, y: 2, z: 0 }, scored: false };
    expect(stepVisitorBall(up, .02).swish).toBe(false);
  });
});
