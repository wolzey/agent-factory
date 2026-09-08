import { describe, expect, it } from 'vitest';
import { RemoteSessionRegistry } from '../server/remote-registry.js';
import { StateManager } from '../server/state.js';
import {
  MAX_HEARTBEAT_SESSION_IDS,
  REMOTE_HEARTBEAT_TTL_MS,
  STALE_SESSION_TIMEOUT_MS,
} from '../shared/constants.js';
import type { HookPayload } from '../shared/types.js';

/** A registry that admits anything, for the tests that are about TTL and caps
 *  rather than about which reports are worth holding. */
function openRegistry(...args: ConstructorParameters<typeof RemoteSessionRegistry>) {
  const registry = new RemoteSessionRegistry(...args);
  registry.setAdmissionCheck(() => true);
  return registry;
}

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
    const registry = openRegistry(REMOTE_HEARTBEAT_TTL_MS, 10, () => now);

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
    const registry = openRegistry();

    expect(registry.heartbeat(['ok', '', '   ', 42, null, 'x'.repeat(600), 'ok'])).toBe(1);
    expect(registry.isAlive('ok')).toBe(true);
    expect(registry.heartbeat('not-an-array')).toBe(0);
  });

  it('lets only the reporting installation hold an owned session open', () => {
    const registry = openRegistry();

    registry.heartbeat(['owned'], 'owner-a');

    expect(registry.isAlive('owned', 'owner-a')).toBe(true);
    expect(registry.isAlive('owned', 'owner-b')).toBe(false);
    expect(registry.isAlive('owned')).toBe(false);

    registry.heartbeat(['legacy']);
    expect(registry.isAlive('legacy')).toBe(true);
    expect(registry.isAlive('legacy', 'owner-a')).toBe(false);
  });

  it('cannot be used to drop a session someone else is holding open', () => {
    const registry = openRegistry();

    registry.heartbeat(['shared-id'], 'owner-a');

    // Session ids are public in world state. Reporting one you do not own must
    // not rewrite who is holding it, or the owner's live session gets reaped.
    registry.heartbeat(['shared-id'], 'owner-b');
    registry.heartbeat(['shared-id']);

    expect(registry.isAlive('shared-id', 'owner-a')).toBe(true);
  });

  it('holds only sessions the server knows, reported by the installation that owns them', () => {
    const registry = new RemoteSessionRegistry();
    registry.setAdmissionCheck((id, ownerId) => id === 'real' && ownerId === 'owner-a');

    // Credentials are self-minted, so this is the boundary that actually bounds
    // the registry: invented ids are refused instead of occupying capacity.
    expect(registry.heartbeat(['real', 'invented'], 'owner-a')).toBe(1);
    expect(registry.heartbeat(['real'], 'owner-b')).toBe(0);
    expect(registry.size).toBe(1);
    expect(registry.isAlive('real', 'owner-a')).toBe(true);
  });

  it('refuses a new id at capacity instead of evicting another installation', () => {
    let now = 1_000;
    const registry = openRegistry(REMOTE_HEARTBEAT_TTL_MS, 3, () => now, 3);

    registry.heartbeat(['w1', 'w2', 'w3'], 'worker');

    // A smaller shelf must not be able to make room by deleting a bigger one's
    // entries -- that would reap the busiest machine's live sessions.
    expect(registry.heartbeat(['x1'], 'other')).toBe(0);
    expect(registry.isAlive('w1', 'worker')).toBe(true);
    expect(registry.isAlive('w2', 'worker')).toBe(true);
    expect(registry.isAlive('w3', 'worker')).toBe(true);
  });

  it('spares restored sessions for one TTL after a restart', () => {
    let now = 1_000;
    const registry = openRegistry(REMOTE_HEARTBEAT_TTL_MS, 10, () => now);

    // A restart restores sessions with an old lastEventAt and an empty registry,
    // and the first sweep runs before a 30-second reporter is sure to have
    // checked in.
    expect(registry.warmingUp()).toBe(true);
    now += REMOTE_HEARTBEAT_TTL_MS;
    expect(registry.warmingUp()).toBe(false);
  });

  it('bounds what one request and one server can hold', () => {
    let now = 1_000;
    const registry = openRegistry(REMOTE_HEARTBEAT_TTL_MS, 3, () => now);

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
    const registry = openRegistry(REMOTE_HEARTBEAT_TTL_MS, 10, () => now);
    state.setSessionKeepAliveCheck((id, ownerId) => registry.isAlive(id, ownerId));
    registry.setAdmissionCheck((id, ownerId) => {
      const session = state.get(id);
      return !!session && session.ownerId === ownerId;
    });

    state.handleHookEvent(sessionStart('reported'));
    state.handleHookEvent(sessionStart('silent'));
    registry.heartbeat(['reported']);

    now += STALE_SESSION_TIMEOUT_MS + 1;
    registry.heartbeat(['reported']);

    expect(state.reapStale()).toEqual(['silent']);
    expect(state.get('reported')).toBeDefined();

    // The machine goes away. The report expires 90 seconds later and the very
    // next sweep takes the session -- it does not get another stale window.
    now += REMOTE_HEARTBEAT_TTL_MS + 1;
    expect(state.reapStale()).toEqual(['reported']);
  });

  it('does not let a pushed id conjure a session the server never saw', () => {
    let now = 1_000;
    const state = new StateManager('arcade', () => now);
    const registry = openRegistry(REMOTE_HEARTBEAT_TTL_MS, 10, () => now);
    state.setSessionKeepAliveCheck((id, ownerId) => registry.isAlive(id, ownerId));

    registry.heartbeat(['never-started']);
    state.handleHookEvent({ ...sessionStart('never-started'), hook_event_name: 'PreToolUse', tool_name: 'Bash' });

    expect(state.get('never-started')).toBeUndefined();
  });
});
