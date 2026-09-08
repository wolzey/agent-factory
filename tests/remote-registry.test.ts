  it('lets go of an entry once its session leaves the world', () => {
    let now = 1_000;
    const live = new Set(['session-a', 'session-b']);
    const registry = new RemoteSessionRegistry(REMOTE_HEARTBEAT_TTL_MS, () => now);
    registry.setAdmissionCheck(id => live.has(id));

    expect(registry.heartbeat(['session-a', 'session-b'])).toBe(2);
    expect(registry.size).toBe(2);

    // The session ends. Waiting out the TTL would make what is held track recent
    // throughput rather than the world.
    live.delete('session-a');
    expect(registry.isAlive('session-a')).toBe(false);
    expect(registry.size).toBe(1);
    expect(registry.isAlive('session-b')).toBe(true);
  });

  it('reads a bounded number of ids from one request', () => {
    const registry = openRegistry();

    const flood = Array.from({ length: MAX_HEARTBEAT_SESSION_IDS + 50 }, (_, i) => `flood-${i}`);
    expect(registry.heartbeat(flood)).toBe(MAX_HEARTBEAT_SESSION_IDS);
  });

import { describe, expect, it } from 'vitest';
import { RemoteSessionRegistry } from '../server/remote-registry.js';
import { StateManager } from '../server/state.js';
import { MAX_HEARTBEAT_SESSION_IDS, REMOTE_HEARTBEAT_TTL_MS, STALE_SESSION_TIMEOUT_MS } from '../shared/constants.js';
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
    const registry = openRegistry(REMOTE_HEARTBEAT_TTL_MS, () => now);

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

});

describe('StateManager remote keep-alive', () => {
  it('spares a heartbeated session from the stale reaper and reaps a silent one', () => {
    let now = 1_000;
    const state = new StateManager('arcade', () => now);
    const registry = openRegistry(REMOTE_HEARTBEAT_TTL_MS, () => now);
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

  it('spares a restored session through the restart it cannot have reported yet', () => {
    let now = 1_000;
    const state = new StateManager('arcade', () => now);
    state.handleHookEvent(sessionStart('restored'));

    // Hours pass and the server restarts: the world comes back from persistence
    // with an old lastEventAt, and the registry comes back empty.
    now += STALE_SESSION_TIMEOUT_MS + 1;
    const registry = new RemoteSessionRegistry(REMOTE_HEARTBEAT_TTL_MS, () => now);
    // Exactly the production wiring, so dropping warmingUp() from it fails here.
    state.setSessionKeepAliveCheck((id, ownerId) => registry.isAlive(id, ownerId) || registry.warmingUp());
    registry.setAdmissionCheck((id, ownerId) => {
      const session = state.get(id);
      return !!session && session.ownerId === ownerId;
    });

    // The first sweep lands 30 seconds in, before a reporter is sure to have
    // checked in. Without the warm-up the restart itself reaps the session.
    expect(state.reapStale()).toEqual([]);

    // Its machine checks in, and that report -- not the warm-up -- carries it.
    now += 80_000;
    registry.heartbeat(['restored']);
    now += 15_000;
    expect(registry.warmingUp()).toBe(false);
    expect(state.reapStale()).toEqual([]);

    // Nothing reports it again, so it goes with the next sweep after expiry.
    now += REMOTE_HEARTBEAT_TTL_MS;
    expect(state.reapStale()).toEqual(['restored']);
  });

  it('does not let a pushed id conjure a session the server never saw', () => {
    let now = 1_000;
    const state = new StateManager('arcade', () => now);
    const registry = openRegistry(REMOTE_HEARTBEAT_TTL_MS, () => now);
    state.setSessionKeepAliveCheck((id, ownerId) => registry.isAlive(id, ownerId));

    registry.heartbeat(['never-started']);
    state.handleHookEvent({ ...sessionStart('never-started'), hook_event_name: 'PreToolUse', tool_name: 'Bash' });

    expect(state.get('never-started')).toBeUndefined();
  });
});
