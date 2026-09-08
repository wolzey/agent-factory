import { describe, expect, it } from 'vitest';
import { RemoteSessionRegistry } from '../server/remote-registry.js';
import { StateManager } from '../server/state.js';
import {
  MAX_HEARTBEAT_SESSION_IDS,
  REMOTE_HEARTBEAT_TTL_MS,
  STALE_SESSION_TIMEOUT_MS,
} from '../shared/constants.js';
import type { HookPayload } from '../shared/types.js';

function sessionStart(sessionId: string): HookPayload {
  return {
    hook_event_name: 'SessionStart',
    session_id: sessionId,
    username: 'jake',
    cwd: `/work/${sessionId}`,
    avatar: { spriteIndex: 0, color: '#ffffff', hat: null, trail: null },
  };
}

describe('RemoteSessionRegistry', () => {
  it('keeps a reported session alive until its heartbeats stop', () => {
    let now = 1_000;
    const registry = new RemoteSessionRegistry(REMOTE_HEARTBEAT_TTL_MS, 10, () => now);

    registry.heartbeat(['session-a']);
    expect(registry.isAlive('session-a')).toBe(true);

    now += REMOTE_HEARTBEAT_TTL_MS - 1;
    expect(registry.isAlive('session-a')).toBe(true);

    registry.heartbeat(['session-a']);
    now += REMOTE_HEARTBEAT_TTL_MS - 1;
    expect(registry.isAlive('session-a')).toBe(true);

    now += 2;
    expect(registry.isAlive('session-a')).toBe(false);
    expect(registry.size).toBe(0);
  });

  it('ignores ids that are not usable strings', () => {
    const registry = new RemoteSessionRegistry();

    expect(registry.heartbeat(['ok', '', '   ', 42, null, 'x'.repeat(600), 'ok'])).toBe(1);
    expect(registry.isAlive('ok')).toBe(true);
    expect(registry.heartbeat('not-an-array')).toBe(0);
  });

  it('lets only the reporting installation hold an owned session open', () => {
    const registry = new RemoteSessionRegistry();

    registry.heartbeat(['owned'], 'owner-a');

    expect(registry.isAlive('owned', 'owner-a')).toBe(true);
    expect(registry.isAlive('owned', 'owner-b')).toBe(false);
    // An unowned (pre-credential) session keeps the trust /api/hooks gives it.
    expect(registry.isAlive('owned')).toBe(true);

    registry.heartbeat(['legacy']);
    expect(registry.isAlive('legacy')).toBe(true);
    expect(registry.isAlive('legacy', 'owner-a')).toBe(false);
  });

  it('bounds what one request and one server can hold', () => {
    let now = 1_000;
    const registry = new RemoteSessionRegistry(REMOTE_HEARTBEAT_TTL_MS, 3, () => now);

    const flood = Array.from({ length: MAX_HEARTBEAT_SESSION_IDS + 50 }, (_, i) => `flood-${i}`);
    expect(registry.heartbeat(flood)).toBe(3);
    expect(registry.size).toBe(3);

    // A tracked id still refreshes once the cap is reached, so a machine at the
    // cap keeps its own sessions rather than losing them to newcomers.
    now += REMOTE_HEARTBEAT_TTL_MS - 1;
    expect(registry.heartbeat(['flood-0'])).toBe(1);
    now += 2;
    expect(registry.isAlive('flood-0')).toBe(true);
    expect(registry.isAlive('flood-1')).toBe(false);
  });
});

describe('StateManager remote keep-alive', () => {
  it('spares a heartbeated session from the stale reaper and reaps a silent one', () => {
    let now = 1_000;
    const state = new StateManager('arcade', () => now);
    const registry = new RemoteSessionRegistry(REMOTE_HEARTBEAT_TTL_MS, 10, () => now);
    state.setSessionKeepAliveCheck((id, ownerId) => registry.isAlive(id, ownerId));

    state.handleHookEvent(sessionStart('reported'));
    state.handleHookEvent(sessionStart('silent'));
    registry.heartbeat(['reported']);

    now += STALE_SESSION_TIMEOUT_MS + 1;
    registry.heartbeat(['reported']);

    expect(state.reapStale()).toEqual(['silent']);
    expect(state.get('reported')).toBeDefined();

    // The machine goes away: nothing refreshes the entry, so the next sweep
    // after it expires takes the session with it.
    now += STALE_SESSION_TIMEOUT_MS + REMOTE_HEARTBEAT_TTL_MS;
    expect(state.reapStale()).toEqual(['reported']);
  });

  it('does not let a pushed id conjure a session the server never saw', () => {
    let now = 1_000;
    const state = new StateManager('arcade', () => now);
    const registry = new RemoteSessionRegistry(REMOTE_HEARTBEAT_TTL_MS, 10, () => now);
    state.setSessionKeepAliveCheck((id, ownerId) => registry.isAlive(id, ownerId));

    registry.heartbeat(['never-started']);
    state.handleHookEvent({ ...sessionStart('never-started'), hook_event_name: 'PreToolUse', tool_name: 'Bash' });

    expect(state.get('never-started')).toBeUndefined();
  });
});
