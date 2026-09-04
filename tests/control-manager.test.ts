import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from '@fastify/websocket';
import { ControlManager } from '../server/control-manager.js';
import { BroadcastManager } from '../server/ws/broadcast.js';
import { StateManager } from '../server/state.js';
import {
  CONTROL_INPUT_TIMEOUT_MS,
  CONTROL_MOVE_SPEED,
  CONTROL_SHOOT_COOLDOWN_MS,
  CONTROL_WORLD_BOUNDS,
  MAX_BROADCAST_RATE_MS,
} from '../shared/constants.js';
import type { WSMessageToClient } from '../shared/types.js';

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

function session(
  state: StateManager,
  sessionId: string,
  username: string,
  ownerId = `${username}-owner`,
): void {
  state.handleHookEvent({
    hook_event_name: 'SessionStart',
    session_id: sessionId,
    username,
    ownerId,
    cwd: `/work/${sessionId}`,
    avatar: { spriteIndex: 0, color: '#ffffff', hat: null, trail: null },
  });
}

function setup() {
  let now = 10_000;
  const state = new StateManager('arcade', () => now);
  const broadcast = new BroadcastManager();
  const controls = new ControlManager(state, broadcast, () => now);
  return {
    state,
    broadcast,
    controls,
    advance(ms: number) {
      now += ms;
      controls.tick(now);
    },
    now: () => now,
  };
}

describe('ControlManager authorization and leases', () => {
  it('rejects unauthenticated and cross-user claims', () => {
    const { state, controls } = setup();
    session(state, 'alice-1', 'alice');
    const ws = socket();

    expect(controls.claim(ws, undefined, 'alice-1')).toBe(false);
    expect(controls.claim(ws, 'bob-owner', 'alice-1')).toBe(false);
    expect(state.get('alice-1')?.manualControl).toBeUndefined();
    expect(ws.sent.filter((message: WSMessageToClient) => message.type === 'control_result')).toHaveLength(2);
  });

  it('isolates installations that use the same display username', () => {
    const { state, controls } = setup();
    session(state, 'first-device', 'alice', 'owner-one');
    session(state, 'second-device', 'alice', 'owner-two');
    const ws = socket();

    expect(controls.claim(ws, 'owner-one', 'first-device')).toBe(true);
    expect(controls.claim(ws, 'owner-one', 'second-device')).toBe(false);
    expect(state.get('second-device')?.manualControl).toBeUndefined();
  });

  it('lets an owner choose among sessions and releases the previous one', () => {
    const { state, controls } = setup();
    session(state, 'alice-1', 'alice');
    session(state, 'alice-2', 'alice');
    const ws = socket();

    expect(controls.claim(ws, 'alice-owner', 'alice-1')).toBe(true);
    expect(controls.claim(ws, 'alice-owner', 'alice-2')).toBe(true);

    expect(state.get('alice-1')?.manualControl).toBeUndefined();
    expect(state.get('alice-2')?.manualControl).toMatchObject({ x: 400, y: CONTROL_WORLD_BOUNDS.maxY });
  });

  it('revokes an older browser when the same owner takes over', () => {
    const { state, controls } = setup();
    session(state, 'alice-1', 'alice');
    const first = socket();
    const second = socket();

    controls.claim(first, 'alice-owner', 'alice-1');
    controls.claim(second, 'alice-owner', 'alice-1');

    expect(first.sent).toContainEqual(expect.objectContaining({
      type: 'control_revoked',
      sessionId: 'alice-1',
    }));
    expect(state.get('alice-1')?.manualControl).toMatchObject({ x: 400, y: CONTROL_WORLD_BOUNDS.maxY });
    expect(controls.updateInput(first, 'alice-owner', 'alice-1', {
      up: true, down: false, left: false, right: false,
    })).toBe(false);
  });

  it('preserves hook activity while controlled and keeps it after release', () => {
    const { state, controls } = setup();
    session(state, 'alice-1', 'alice');
    const ws = socket();
    controls.claim(ws, 'alice-owner', 'alice-1');

    state.handleHookEvent({
      hook_event_name: 'PreToolUse',
      session_id: 'alice-1',
      username: 'alice',
      cwd: '/work/alice-1',
      avatar: { spriteIndex: 0, color: '#ffffff', hat: null, trail: null },
      tool_name: 'Read',
    });

    expect(state.get('alice-1')).toMatchObject({
      activity: 'reading',
      manualControl: { x: 400, y: CONTROL_WORLD_BOUNDS.maxY },
    });
    controls.release(ws, 'alice-owner', 'alice-1');
    expect(state.get('alice-1')).toMatchObject({ activity: 'reading' });
    expect(state.get('alice-1')?.manualControl).toBeUndefined();
  });

  it('keeps control when display attribution changes but ownership does not', () => {
    const { state, controls } = setup();
    session(state, 'alice-1', 'alice');
    const ws = socket();
    controls.claim(ws, 'alice-owner', 'alice-1');

    state.handleHookEvent({
      hook_event_name: 'SessionStart',
      session_id: 'alice-1',
      username: 'renamed-alice',
      ownerId: 'alice-owner',
      cwd: '/work/alice-1',
      avatar: { spriteIndex: 0, color: '#ffffff', hat: null, trail: null },
    });

    expect(controls.updateInput(ws, 'alice-owner', 'alice-1', {
      up: true, down: false, left: false, right: false,
    })).toBe(true);
    expect(state.get('alice-1')?.manualControl).toBeDefined();
  });

  it('releases leases on disconnect or session end', () => {
    const { state, controls } = setup();
    session(state, 'alice-1', 'alice');
    const ws = socket();

    controls.claim(ws, 'alice-owner', 'alice-1');
    controls.releaseSocket(ws, 'disconnect');
    expect(state.get('alice-1')?.manualControl).toBeUndefined();

    controls.claim(ws, 'alice-owner', 'alice-1');
    controls.releaseSession('alice-1', 'ended');
    expect(state.get('alice-1')?.manualControl).toBeUndefined();
  });
});

describe('ControlManager movement and actions', () => {
  it('normalizes diagonal movement and clamps world coordinates', () => {
    const { state, controls, advance } = setup();
    session(state, 'alice-1', 'alice');
    const ws = socket();
    controls.claim(ws, 'alice-owner', 'alice-1');
    controls.updateInput(ws, 'alice-owner', 'alice-1', {
      up: true, down: false, left: false, right: true,
    });

    advance(MAX_BROADCAST_RATE_MS);
    const controlled = state.get('alice-1')?.manualControl;
    expect(controlled?.x).toBeCloseTo(400 + CONTROL_MOVE_SPEED * 0.1 / Math.sqrt(2), 4);
    expect(controlled?.y).toBeCloseTo(CONTROL_WORLD_BOUNDS.maxY - CONTROL_MOVE_SPEED * 0.1 / Math.sqrt(2), 4);
    expect(controlled?.facing).toBe('up');
    expect(controlled?.moving).toBe(true);
  });

  it('stops movement after the input heartbeat expires', () => {
    const { state, controls, advance } = setup();
    session(state, 'alice-1', 'alice');
    const ws = socket();
    controls.claim(ws, 'alice-owner', 'alice-1');
    controls.updateInput(ws, 'alice-owner', 'alice-1', {
      up: false, down: true, left: false, right: false,
    });

    advance(MAX_BROADCAST_RATE_MS);
    expect(state.get('alice-1')?.manualControl?.moving).toBe(true);
    advance(CONTROL_INPUT_TIMEOUT_MS + 1);
    expect(state.get('alice-1')?.manualControl?.moving).toBe(false);
  });

  it('rate-limits shooting and uses server-held facing', () => {
    const { state, controls, advance } = setup();
    session(state, 'alice-1', 'alice');
    const ws = socket();
    const effects = vi.fn();
    state.onStateChange((notification) => {
      if (notification.type === 'effect') effects(notification);
    });

    controls.claim(ws, 'alice-owner', 'alice-1');
    controls.updateInput(ws, 'alice-owner', 'alice-1', {
      up: false, down: false, left: true, right: false,
    });

    // Facing changes synchronously, so an immediate Space press shoots left.
    expect(controls.shoot(ws, 'alice-owner', 'alice-1')).toBe(true);
    expect(controls.shoot(ws, 'alice-owner', 'alice-1')).toBe(false);
    advance(CONTROL_SHOOT_COOLDOWN_MS);
    expect(controls.shoot(ws, 'alice-owner', 'alice-1')).toBe(true);

    expect(effects).toHaveBeenCalledWith(expect.objectContaining({
      effect: 'shoot',
      effectData: expect.objectContaining({ facing: 'left', targetSessionIds: [] }),
    }));
  });
});
