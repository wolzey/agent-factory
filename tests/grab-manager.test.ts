import { describe, expect, it } from 'vitest';
import type { WebSocket } from '@fastify/websocket';
import { GrabManager, parseGrabTarget } from '../server/grab-manager.js';
import { BroadcastManager } from '../server/ws/broadcast.js';
import { ControlManager } from '../server/control-manager.js';
import { StateManager } from '../server/state.js';
import {
  CONTROL_WORLD_BOUNDS,
  GRAB_POINTER_BOUNDS,
  GRAB_INPUT_TIMEOUT_MS,
  MAX_BROADCAST_RATE_MS,
} from '../shared/constants.js';
import type { HookPayload, WSMessageToClient } from '../shared/types.js';

interface FakeSocket {
  readyState: number;
  sent: WSMessageToClient[];
  send(raw: string): void;
  on(): void;
}

function socket(): WebSocket & FakeSocket {
  const sent: WSMessageToClient[] = [];
  return {
    readyState: 1,
    sent,
    send(raw: string) {
      sent.push(JSON.parse(raw) as WSMessageToClient);
    },
    on() {},
  } as unknown as WebSocket & FakeSocket;
}

const AVATAR = { spriteIndex: 0, color: '#ffffff', hat: null, trail: null };

function hook(state: StateManager, event: string, sessionId: string, username: string, extra: Partial<HookPayload> = {}): void {
  state.handleHookEvent({
    hook_event_name: event,
    session_id: sessionId,
    username,
    ownerId: `${username}-owner`,
    cwd: `/work/${sessionId}`,
    avatar: AVATAR,
    ...extra,
  });
}

function setup() {
  let now = 10_000;
  const state = new StateManager();
  const broadcast = new BroadcastManager();
  const grabs = new GrabManager(state, broadcast, () => now);
  const controls = new ControlManager(state, broadcast, () => now);
  // Mirror server/index.ts: state changes re-validate grab leases.
  state.onStateChange((notification) => {
    if (notification.type === 'effect') {
      broadcast.broadcastEffect(notification.sessionId, notification.effect, notification.effectData);
      return;
    }
    if (notification.type !== 'delta') return;
    for (const change of notification.delta.changes) {
      if (change.kind === 'agent_upsert') grabs.syncSession(change.agent);
      if (change.kind === 'agent_remove') grabs.releaseSession(change.sessionId, 'Agent session ended');
    }
  });
  const viewer = socket();
  broadcast.add(viewer);
  return {
    state,
    broadcast,
    grabs,
    controls,
    viewer,
    join(ws: WebSocket & FakeSocket) {
      broadcast.add(ws);
      return ws;
    },
    advance(ms: number) {
      now += ms;
      grabs.tick(now);
    },
  };
}

function ofType<T extends WSMessageToClient['type']>(messages: WSMessageToClient[], type: T) {
  return messages.filter((m): m is Extract<WSMessageToClient, { type: T }> => m.type === type);
}

describe('GrabManager authorization', () => {
  it('rejects unauthenticated viewers and unknown or stopped sessions', () => {
    const { state, grabs, join } = setup();
    hook(state, 'SessionStart', 'alice-1', 'alice');
    const ws = join(socket());

    expect(grabs.begin(ws, undefined, { sessionId: 'alice-1' }, 100, 100)).toBe(false);
    expect(grabs.begin(ws, 'bob', { sessionId: 'nope' }, 100, 100)).toBe(false);
    hook(state, 'SessionEnd', 'alice-1', 'alice');
    expect(grabs.begin(ws, 'bob', { sessionId: 'alice-1' }, 100, 100)).toBe(false);

    const results = ofType(ws.sent, 'grab_result');
    expect(results).toHaveLength(3);
    expect(results.every(r => !r.success && r.action === 'start')).toBe(true);
    expect(results[0].error).toMatch(/log in/i);
    expect(grabs.activeGrabs()).toEqual([]);
  });

  it('lets any authenticated viewer lift another user\'s avatar and tells the whole room', () => {
    const { state, grabs, join, viewer } = setup();
    hook(state, 'SessionStart', 'alice-1', 'alice');
    const bob = join(socket());

    expect(grabs.begin(bob, 'bob', { sessionId: 'alice-1' }, 120, 140)).toBe(true);
    expect(ofType(bob.sent, 'grab_result')).toContainEqual({
      type: 'grab_result', success: true, action: 'start', sessionId: 'alice-1',
    });
    const update = ofType(viewer.sent, 'grab_update')[0];
    expect(update.grab).toEqual({ sessionId: 'alice-1', username: 'bob', x: 120, y: 140 });
  });

  it('rejects invalid coordinates and clamps out-of-room pointers', () => {
    const { state, grabs, join } = setup();
    hook(state, 'SessionStart', 'alice-1', 'alice');
    const ws = join(socket());

    expect(grabs.begin(ws, 'bob', { sessionId: 'alice-1' }, Number.NaN, 10)).toBe(false);
    expect(grabs.begin(ws, 'bob', { sessionId: 'alice-1' }, -500, 9_999)).toBe(true);
    expect(grabs.activeGrabs()[0]).toMatchObject({ x: GRAB_POINTER_BOUNDS.minX, y: GRAB_POINTER_BOUNDS.maxY });
  });
});

describe('GrabManager leases and conflicts', () => {
  it('gives one avatar to one holder at a time', () => {
    const { state, grabs, join } = setup();
    hook(state, 'SessionStart', 'alice-1', 'alice');
    const bob = join(socket());
    const carol = join(socket());

    expect(grabs.begin(bob, 'bob', { sessionId: 'alice-1' }, 100, 100)).toBe(true);
    expect(grabs.begin(carol, 'carol', { sessionId: 'alice-1' }, 200, 200)).toBe(false);
    expect(ofType(carol.sent, 'grab_result')[0].error).toBe('Already grabbed by bob');
    expect(grabs.move(carol, 'carol', { sessionId: 'alice-1' }, 210, 210)).toBe(false);
    expect(grabs.activeGrabs()[0]).toMatchObject({ username: 'bob', x: 100, y: 100 });

    expect(grabs.end(bob, 'bob', { sessionId: 'alice-1' }, 130, 130)).toBe(true);
    expect(grabs.begin(carol, 'carol', { sessionId: 'alice-1' }, 200, 200)).toBe(true);
  });

  it('is idempotent for the same holder and swaps targets for a socket that grabs something else', () => {
    const { state, grabs, join, viewer } = setup();
    hook(state, 'SessionStart', 'alice-1', 'alice');
    hook(state, 'SessionStart', 'alice-2', 'alice');
    const bob = join(socket());

    expect(grabs.begin(bob, 'bob', { sessionId: 'alice-1' }, 100, 100)).toBe(true);
    expect(grabs.begin(bob, 'bob', { sessionId: 'alice-1' }, 100, 100)).toBe(true);
    expect(grabs.activeGrabs()).toHaveLength(1);

    expect(grabs.begin(bob, 'bob', { sessionId: 'alice-2' }, 300, 300)).toBe(true);
    expect(grabs.activeGrabs().map(g => g.sessionId)).toEqual(['alice-2']);
    expect(ofType(viewer.sent, 'grab_release')).toContainEqual(
      expect.objectContaining({ sessionId: 'alice-1', reason: 'Switched avatar' }),
    );
  });

  it('rate-limits pointer broadcasts but always flushes the latest position', () => {
    const { state, grabs, join, viewer, advance } = setup();
    hook(state, 'SessionStart', 'alice-1', 'alice');
    const bob = join(socket());
    grabs.begin(bob, 'bob', { sessionId: 'alice-1' }, 100, 100);
    expect(ofType(viewer.sent, 'grab_update')).toHaveLength(1);

    advance(MAX_BROADCAST_RATE_MS / 2);
    expect(grabs.move(bob, 'bob', { sessionId: 'alice-1' }, 110, 110)).toBe(true);
    expect(ofType(viewer.sent, 'grab_update')).toHaveLength(1); // too soon, held back

    advance(MAX_BROADCAST_RATE_MS / 2);
    const updates = ofType(viewer.sent, 'grab_update');
    expect(updates).toHaveLength(2); // tick flushed the dirty position
    expect(updates[1].grab).toMatchObject({ x: 110, y: 110 });

    advance(MAX_BROADCAST_RATE_MS);
    grabs.move(bob, 'bob', { sessionId: 'alice-1' }, 120, 120);
    expect(ofType(viewer.sent, 'grab_update')).toHaveLength(3); // rate window open, sent immediately
  });

  it('ends with a room-wide release at the sanitized drop point and confirms to the holder', () => {
    const { state, grabs, join, viewer } = setup();
    hook(state, 'SessionStart', 'alice-1', 'alice');
    const bob = join(socket());
    const carol = join(socket());
    grabs.begin(bob, 'bob', { sessionId: 'alice-1' }, 100, 100);

    expect(grabs.end(carol, 'carol', { sessionId: 'alice-1' }, 1, 1)).toBe(false);
    expect(ofType(carol.sent, 'grab_result')[0]).toMatchObject({ success: false, action: 'end' });

    expect(grabs.end(bob, 'bob', { sessionId: 'alice-1' }, 5_000, 250)).toBe(true);
    expect(ofType(viewer.sent, 'grab_release')[0]).toEqual({
      type: 'grab_release', sessionId: 'alice-1', x: CONTROL_WORLD_BOUNDS.maxX, y: 250, reason: 'Released',
    });
    expect(ofType(bob.sent, 'grab_result')).toContainEqual({
      type: 'grab_result', success: true, action: 'end', sessionId: 'alice-1',
    });
    expect(grabs.activeGrabs()).toEqual([]);
  });

  it('moves a dropped agent to a free workstation but never displaces its occupant', () => {
    const { state, grabs, join } = setup();
    hook(state, 'SessionStart', 'alice-1', 'alice');
    hook(state, 'SessionStart', 'carol-1', 'carol');
    const bob = join(socket());

    grabs.begin(bob, 'bob', { sessionId: 'alice-1' }, 100, 100);
    expect(grabs.end(bob, 'bob', { sessionId: 'alice-1' }, 208, 240, 7)).toBe(true);
    expect(state.get('alice-1')?.world).toMatchObject({ zone: 'work', slotIndex: 7 });

    grabs.begin(bob, 'bob', { sessionId: 'carol-1' }, 100, 100);
    expect(grabs.end(bob, 'bob', { sessionId: 'carol-1' }, 208, 240, 7)).toBe(false);
    expect(state.get('carol-1')?.world.zone).toBe('idle');
  });

  it('rejects a forged workstation hint that is not near the drop point', () => {
    const { state, grabs, join } = setup();
    hook(state, 'SessionStart', 'alice-1', 'alice');
    const bob = join(socket());

    grabs.begin(bob, 'bob', { sessionId: 'alice-1' }, 100, 100);
    expect(grabs.end(bob, 'bob', { sessionId: 'alice-1' }, 700, 400, 0)).toBe(false);
    expect(state.get('alice-1')?.world.zone).toBe('idle');
    expect(ofType(bob.sent, 'grab_result')).toContainEqual(expect.objectContaining({
      success: false,
      action: 'end',
      sessionId: 'alice-1',
    }));
  });

  it('never writes ordinary floor-grab state into the persisted session', () => {
    const { state, grabs, join } = setup();
    hook(state, 'SessionStart', 'alice-1', 'alice');
    const before = JSON.stringify(state.getAll());
    const bob = join(socket());

    grabs.begin(bob, 'bob', { sessionId: 'alice-1' }, 100, 100);
    grabs.move(bob, 'bob', { sessionId: 'alice-1' }, 300, 300);
    expect(JSON.stringify(state.getAll())).toBe(before);
    grabs.end(bob, 'bob', { sessionId: 'alice-1' }, 300, 300);
    expect(JSON.stringify(state.getAll())).toBe(before);
  });

  it('starts rock paper scissors when an agent is dropped beside another agent', () => {
    const { state, grabs, join, viewer } = setup();
    hook(state, 'SessionStart', 'alice-1', 'alice');
    hook(state, 'SessionStart', 'carol-1', 'carol');
    const bob = join(socket());
    const carolPosition = state.getCurrentPosition('carol-1');
    expect(carolPosition).not.toBeNull();

    grabs.begin(bob, 'bob', { sessionId: 'alice-1' }, 100, 100);
    grabs.end(bob, 'bob', { sessionId: 'alice-1' }, carolPosition!.x, carolPosition!.y);

    expect(ofType(viewer.sent, 'effect')).toContainEqual(expect.objectContaining({
      sessionId: 'alice-1',
      effect: 'rps',
      data: expect.objectContaining({ opponentSessionId: 'carol-1' }),
    }));
  });
});

describe('GrabManager cleanup', () => {
  it('releases on disconnect', () => {
    const { state, grabs, join, viewer } = setup();
    hook(state, 'SessionStart', 'alice-1', 'alice');
    const bob = join(socket());
    grabs.begin(bob, 'bob', { sessionId: 'alice-1' }, 100, 100);

    grabs.releaseSocket(bob, 'Browser disconnected');
    expect(grabs.activeGrabs()).toEqual([]);
    expect(ofType(viewer.sent, 'grab_release')[0]).toMatchObject({ sessionId: 'alice-1', reason: 'Browser disconnected' });
  });

  it('releases the lease on a session when it ends or is removed', () => {
    const { state, grabs, join, viewer } = setup();
    hook(state, 'SessionStart', 'alice-1', 'alice');
    const bob = join(socket());
    grabs.begin(bob, 'bob', { sessionId: 'alice-1' }, 100, 100);

    hook(state, 'SessionEnd', 'alice-1', 'alice');
    expect(grabs.activeGrabs()).toEqual([]);
    const releases = ofType(viewer.sent, 'grab_release');
    expect(releases).toHaveLength(1);
    expect(releases.every(r => r.reason === 'Agent is no longer active')).toBe(true);
  });

  it('times out a lease whose holder stops sending pointer updates', () => {
    const { state, grabs, join, viewer, advance } = setup();
    hook(state, 'SessionStart', 'alice-1', 'alice');
    const bob = join(socket());
    grabs.begin(bob, 'bob', { sessionId: 'alice-1' }, 100, 100);

    advance(GRAB_INPUT_TIMEOUT_MS);
    grabs.move(bob, 'bob', { sessionId: 'alice-1' }, Number.NaN, Number.NaN); // heartbeat keeps it alive
    advance(GRAB_INPUT_TIMEOUT_MS);
    expect(grabs.activeGrabs()).toHaveLength(1);

    advance(1);
    expect(grabs.activeGrabs()).toEqual([]);
    expect(ofType(viewer.sent, 'grab_release')[0].reason).toBe('Grab timed out');
  });

  it('does not fight manual control: refuses controlled avatars and lets go when control begins', () => {
    const { state, grabs, controls, join, viewer } = setup();
    hook(state, 'SessionStart', 'alice-1', 'alice');
    const alice = join(socket());
    const bob = join(socket());

    controls.claim(alice, 'alice-owner', 'alice-1');
    expect(grabs.begin(bob, 'bob', { sessionId: 'alice-1' }, 100, 100)).toBe(false);
    expect(ofType(bob.sent, 'grab_result')[0].error).toBe('Agent is under manual control');

    controls.release(alice, 'alice-owner', 'alice-1');
    expect(grabs.begin(bob, 'bob', { sessionId: 'alice-1' }, 100, 100)).toBe(true);
    controls.claim(alice, 'alice-owner', 'alice-1');
    expect(grabs.activeGrabs()).toEqual([]);
    expect(ofType(viewer.sent, 'grab_release')[0].reason).toBe('Agent is under manual control');
  });

  it('brings late joiners up to date with avatars already in the air', () => {
    const { state, grabs, join } = setup();
    hook(state, 'SessionStart', 'alice-1', 'alice');
    const bob = join(socket());
    grabs.begin(bob, 'bob', { sessionId: 'alice-1' }, 100, 100);

    const late = socket();
    grabs.sendActive(late);
    expect(ofType(late.sent, 'grab_update')[0].grab).toEqual({ sessionId: 'alice-1', username: 'bob', x: 100, y: 100 });
  });

  it('parses untrusted socket payloads into targets', () => {
    expect(parseGrabTarget({ sessionId: 'a', agentId: 'b' })).toEqual({ sessionId: '' });
    expect(parseGrabTarget({ sessionId: 'a', agentId: '' })).toEqual({ sessionId: 'a' });
    expect(parseGrabTarget({})).toEqual({ sessionId: '' });
  });
});
