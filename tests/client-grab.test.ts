import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GrabTarget, WSMessageToClient } from '../shared/types';
import { GrabManager, sameGrabTarget } from '../client/grab/GrabManager';
import type { GrabAgents, GrabScene } from '../client/grab/GrabManager';
import { GRAB_DRAG_THRESHOLD } from '../client/grab/physics';
import { GRAB_INPUT_TIMEOUT_MS } from '../shared/constants';

type Listener = (...args: unknown[]) => void;

function fakeScene() {
  const listeners = new Map<string, Set<Listener>>();
  const scene: GrabScene = {
    input: {
      on(event, fn) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(fn as Listener);
      },
      off(event, fn) {
        listeners.get(event)?.delete(fn as Listener);
      },
    },
  };
  return {
    scene,
    emit(event: string, ...args: unknown[]) {
      for (const fn of listeners.get(event) ?? []) fn(...args);
    },
    count(event: string) {
      return listeners.get(event)?.size ?? 0;
    },
  };
}

function fakeAgents(target: GrabTarget | null = { sessionId: 'alice-1' }) {
  const agents = {
    isVortexActive: false,
    present: true,
    resolveGrabTarget: vi.fn(() => target),
    hasGrabTarget: vi.fn(() => agents.present),
    beginGrab: vi.fn(() => true),
    applyRemoteGrab: vi.fn(),
    moveGrab: vi.fn(),
    releaseGrab: vi.fn(),
    workstationDropSlot: vi.fn<() => number | undefined>(() => undefined),
    showGrabHint: vi.fn(),
  };
  return agents as typeof agents & GrabAgents;
}

const AVATAR = {} as unknown as Phaser.GameObjects.GameObject;

function pointer(id: number, x: number, y: number) {
  return { id, worldX: x, worldY: y };
}

function harness(opts: { loggedIn?: boolean; target?: GrabTarget | null } = {}) {
  const sceneHarness = fakeScene();
  const socket = { send: vi.fn() };
  const auth = { isLoggedIn: opts.loggedIn ?? true };
  const agents = fakeAgents(opts.target === undefined ? { sessionId: 'alice-1' } : opts.target);
  let now = 1_000;
  const manager = new GrabManager(sceneHarness.scene, auth, socket, agents, () => now);
  const dragTo = (x: number, y: number) => sceneHarness.emit('pointermove', pointer(0, x, y));
  return {
    ...sceneHarness,
    socket,
    auth,
    agents,
    manager,
    advance: (ms: number) => { now += ms; },
    press: (x = 100, y = 100) => sceneHarness.emit('gameobjectdown', pointer(0, x, y), AVATAR),
    dragTo,
    liftOff: () => sceneHarness.emit('pointerup', pointer(0, 150, 150)),
    startGrab() {
      this.press();
      dragTo(100 + GRAB_DRAG_THRESHOLD + 1, 100);
    },
    confirm(target: GrabTarget = { sessionId: 'alice-1' }) {
      manager.handleMessage({ type: 'grab_result', success: true, action: 'start', ...target });
    },
    sent: (type: string) => socket.send.mock.calls.map(c => c[0] as { type: string }).filter(m => m.type === type),
  };
}

beforeEach(() => {
  const windowListeners = new Map<string, Set<Listener>>();
  const documentListeners = new Map<string, Set<Listener>>();
  const classes = new Set<string>();
  vi.stubGlobal('window', {
    addEventListener: (event: string, fn: Listener) => {
      if (!windowListeners.has(event)) windowListeners.set(event, new Set());
      windowListeners.get(event)!.add(fn);
    },
    removeEventListener: (event: string, fn: Listener) => windowListeners.get(event)?.delete(fn),
    fire: (event: string) => { for (const fn of windowListeners.get(event) ?? []) fn(); },
  });
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    body: { classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c), contains: (c: string) => classes.has(c) } },
    addEventListener: (event: string, fn: Listener) => {
      if (!documentListeners.has(event)) documentListeners.set(event, new Set());
      documentListeners.get(event)!.add(fn);
    },
    removeEventListener: (event: string, fn: Listener) => documentListeners.get(event)?.delete(fn),
    fire: (event: string) => { for (const fn of documentListeners.get(event) ?? []) fn(); },
  });
});

describe('client GrabManager gestures', () => {
  it('ignores presses that never travel past the drag threshold', () => {
    const h = harness();
    h.press();
    h.dragTo(101, 101);
    h.liftOff();
    expect(h.socket.send).not.toHaveBeenCalled();
    expect(h.manager.holding).toBeNull();
  });

  it('asks viewers to log in instead of sending a grab when unauthenticated', () => {
    const h = harness({ loggedIn: false });
    h.startGrab();
    expect(h.socket.send).not.toHaveBeenCalled();
    expect(h.agents.showGrabHint).toHaveBeenCalledWith({ sessionId: 'alice-1' }, 'LOG IN TO GRAB');
    expect(h.manager.holding).toBeNull();
  });

  it('ignores presses on things that are not avatars', () => {
    const h = harness({ target: null });
    h.startGrab();
    expect(h.socket.send).not.toHaveBeenCalled();
  });

  it('requests a lease on drag and only lifts once the server confirms', () => {
    const h = harness();
    h.startGrab();
    expect(h.sent('grab_start')[0]).toEqual({ type: 'grab_start', sessionId: 'alice-1', x: 100 + GRAB_DRAG_THRESHOLD + 1, y: 100 });
    expect(h.agents.beginGrab).not.toHaveBeenCalled();
    expect(h.manager.holding).toEqual({ sessionId: 'alice-1' });

    h.dragTo(140, 120); // pointer keeps moving while the request is in flight
    expect(h.agents.moveGrab).not.toHaveBeenCalled();

    h.confirm();
    expect(h.agents.beginGrab).toHaveBeenCalledWith({ sessionId: 'alice-1' }, { x: 140, y: 120 });
    expect(h.sent('grab_move')[0]).toMatchObject({ x: 140, y: 120 });
    expect(document.body.classList.contains('is-grabbing')).toBe(true);
  });

  it('follows the pointer locally and throttles pointer updates to the server', () => {
    const h = harness();
    h.startGrab();
    h.confirm();
    h.socket.send.mockClear();

    h.dragTo(150, 150);
    h.dragTo(160, 160);
    expect(h.agents.moveGrab).toHaveBeenCalledTimes(2);
    expect(h.sent('grab_move')).toHaveLength(0); // inside the 50ms window after the confirm send

    h.advance(60);
    h.dragTo(170, 170);
    expect(h.sent('grab_move')).toEqual([{ type: 'grab_move', sessionId: 'alice-1', x: 170, y: 170 }]);
  });

  it('drops the avatar where the pointer is released and tells the server', () => {
    const h = harness();
    h.startGrab();
    h.confirm();
    h.liftOff();
    expect(h.sent('grab_end')[0]).toEqual({ type: 'grab_end', sessionId: 'alice-1', x: 150, y: 150 });
    expect(h.agents.releaseGrab).toHaveBeenCalledWith({ sessionId: 'alice-1' }, { x: 150, y: 150 });
    expect(h.manager.holding).toBeNull();
    expect(document.body.classList.contains('is-grabbing')).toBe(false);
  });

  it('includes a nearby workstation as the intended drop target', () => {
    const h = harness();
    h.agents.workstationDropSlot.mockReturnValue(7);
    h.startGrab();
    h.confirm();
    h.liftOff();
    expect(h.sent('grab_end')[0]).toEqual({
      type: 'grab_end', sessionId: 'alice-1', x: 150, y: 150, workstationSlot: 7,
    });
  });

  it('drops a grab that was rejected by the server and shows why', () => {
    const h = harness();
    h.startGrab();
    h.manager.handleMessage({ type: 'grab_result', success: false, action: 'start', sessionId: 'alice-1', error: 'Already grabbed by bob' });
    expect(h.agents.showGrabHint).toHaveBeenCalledWith({ sessionId: 'alice-1' }, 'Already grabbed by bob');
    expect(h.manager.holding).toBeNull();
    h.liftOff();
    expect(h.sent('grab_end')).toHaveLength(0);
  });

  it('shows why a drop was rejected, but only for an avatar this browser just released', () => {
    const h = harness();
    h.startGrab();
    h.confirm();
    h.liftOff();
    h.manager.handleMessage({ type: 'grab_result', success: false, action: 'end', sessionId: 'alice-1', error: 'Drop that agent closer to a free workstation' });
    expect(h.agents.showGrabHint).toHaveBeenCalledWith({ sessionId: 'alice-1' }, 'Drop that agent closer to a free workstation');
    h.manager.handleMessage({ type: 'grab_result', success: false, action: 'end', sessionId: 'someone-else', error: 'You are not holding that avatar' });
    expect(h.agents.showGrabHint).toHaveBeenCalledTimes(1);
  });

  it('sends grab_end even when the lease was never confirmed so a late accept is released', () => {
    const h = harness();
    h.startGrab();
    h.liftOff();
    expect(h.sent('grab_end')).toHaveLength(1);
    expect(h.agents.releaseGrab).not.toHaveBeenCalled();
  });
});

describe('client GrabManager cancellation and remote state', () => {
  it('lets go on window blur, pointer cancel, hidden tab, logout, and vortex', () => {
    const cases: Array<(h: ReturnType<typeof harness>) => void> = [
      h => (window as unknown as { fire(e: string): void }).fire('blur'),
      h => (window as unknown as { fire(e: string): void }).fire('pointercancel'),
      h => {
        (document as unknown as { visibilityState: string }).visibilityState = 'hidden';
        (document as unknown as { fire(e: string): void }).fire('visibilitychange');
      },
      h => h.manager.handleLoggedOut(),
      h => { h.agents.isVortexActive = true; h.manager.update(); },
      h => { h.agents.present = false; h.manager.update(); },
    ];
    for (const cancel of cases) {
      const h = harness();
      h.startGrab();
      h.confirm();
      cancel(h);
      expect(h.sent('grab_end')).toHaveLength(1);
      expect(h.agents.releaseGrab).toHaveBeenCalledTimes(1);
      expect(h.manager.holding).toBeNull();
    }
  });

  it('accepts a forced release from the server without echoing grab_end', () => {
    const h = harness();
    h.startGrab();
    h.confirm();
    h.manager.handleMessage({ type: 'grab_release', sessionId: 'alice-1', x: 111, y: 222, reason: 'Agent session ended' });
    expect(h.agents.releaseGrab).toHaveBeenCalledWith({ sessionId: 'alice-1' }, { x: 111, y: 222 });
    expect(h.sent('grab_end')).toHaveLength(0);
    expect(h.manager.holding).toBeNull();
  });

  it('drops a held avatar locally when the socket reconnects (the old lease died with it)', () => {
    const h = harness();
    h.startGrab();
    h.confirm();
    h.socket.send.mockClear();
    h.manager.handleConnected();
    expect(h.agents.releaseGrab).toHaveBeenCalledTimes(1);
    expect(h.socket.send).not.toHaveBeenCalled();
    expect(h.manager.holding).toBeNull();
  });

  it('mirrors other viewers\' grabs onto agents and ignores its own echo', () => {
    const h = harness();
    const other = { sessionId: 'bob-2' };
    h.manager.handleMessage({ type: 'grab_update', grab: { ...other, username: 'carol', x: 10, y: 20 } });
    expect(h.agents.applyRemoteGrab).toHaveBeenCalledWith(other, { x: 10, y: 20 });
    h.manager.handleMessage({ type: 'grab_release', ...other, x: 12, y: 22, reason: 'Released' });
    expect(h.agents.releaseGrab).toHaveBeenCalledWith(other, { x: 12, y: 22 });

    h.startGrab();
    h.confirm();
    h.agents.applyRemoteGrab.mockClear();
    h.manager.handleMessage({ type: 'grab_update', grab: { sessionId: 'alice-1', username: 'me', x: 1, y: 1 } });
    expect(h.agents.applyRemoteGrab).not.toHaveBeenCalled();
  });

  it('ignores a late echo of its own pointer after letting go, but not a genuinely new grab', () => {
    const h = harness();
    h.startGrab();
    h.confirm();
    h.liftOff();
    // The server flushed our last pointer just before it saw grab_end: this is our echo, not a claw.
    h.manager.handleMessage({ type: 'grab_update', grab: { sessionId: 'alice-1', username: 'me', x: 150, y: 150 } });
    expect(h.agents.applyRemoteGrab).not.toHaveBeenCalled();

    h.manager.handleMessage({ type: 'grab_release', sessionId: 'alice-1', x: 150, y: 150, reason: 'Released' });
    h.manager.handleMessage({ type: 'grab_update', grab: { sessionId: 'alice-1', username: 'carol', x: 10, y: 20 } });
    expect(h.agents.applyRemoteGrab).toHaveBeenCalledTimes(1);
    expect(h.agents.applyRemoteGrab).toHaveBeenCalledWith({ sessionId: 'alice-1' }, { x: 10, y: 20 });
  });

  it('scopes echo suppression to the released target only', () => {
    const h = harness();
    h.startGrab();
    h.confirm();
    h.liftOff();
    const other = { sessionId: 'bob-2' };
    h.manager.handleMessage({ type: 'grab_update', grab: { ...other, username: 'carol', x: 5, y: 5 } });
    expect(h.agents.applyRemoteGrab).toHaveBeenCalledWith(other, { x: 5, y: 5 });
  });

  it('stops treating updates as echoes once the server would have dropped a silent lease', () => {
    const h = harness();
    h.startGrab();
    h.confirm();
    h.liftOff();
    h.advance(GRAB_INPUT_TIMEOUT_MS + 1);
    h.manager.update();
    h.manager.handleMessage({ type: 'grab_update', grab: { sessionId: 'alice-1', username: 'me', x: 1, y: 1 } });
    expect(h.agents.applyRemoteGrab).toHaveBeenCalledTimes(1);
  });

  it('drops the echo list on reconnect because the new socket cannot receive the old lease', () => {
    const h = harness();
    h.startGrab();
    h.confirm();
    h.liftOff();
    h.manager.handleConnected();
    h.manager.handleMessage({ type: 'grab_update', grab: { sessionId: 'alice-1', username: 'me', x: 1, y: 1 } });
    expect(h.agents.applyRemoteGrab).toHaveBeenCalledTimes(1);
  });

  it('keeps sending heartbeats while holding and stops after release', () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      h.startGrab();
      h.confirm();
      h.socket.send.mockClear();
      h.advance(600);
      vi.advanceTimersByTime(600);
      expect(h.sent('grab_move').length).toBeGreaterThanOrEqual(1);
      h.liftOff();
      h.socket.send.mockClear();
      vi.advanceTimersByTime(2_000);
      expect(h.socket.send).not.toHaveBeenCalled();
      h.manager.destroy();
      expect(h.count('pointermove')).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('compares targets by session id', () => {
    expect(sameGrabTarget({ sessionId: 'a' }, { sessionId: 'a' })).toBe(true);
    expect(sameGrabTarget({ sessionId: 'a' }, { sessionId: 'b' })).toBe(false);
  });
});

// Keep the import used so the message union stays type-checked against this file.
const _typeCheck: WSMessageToClient | null = null;
void _typeCheck;
