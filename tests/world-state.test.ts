import { describe, expect, it, vi } from 'vitest';
import { StateManager } from '../server/state.js';
import { STALE_SESSION_TIMEOUT_MS, TOMBSTONE_DURATION_MS } from '../shared/constants.js';
import type { HookPayload, WorldDelta } from '../shared/types.js';

function hook(sessionId: string, username = 'alice'): HookPayload {
  return {
    hook_event_name: 'SessionStart',
    session_id: sessionId,
    username,
    cwd: `/work/${sessionId}`,
    avatar: { spriteIndex: 0, color: '#ffffff', hat: null, trail: null },
  };
}

describe('StateManager authoritative world', () => {
  it('assigns unique server-owned slots and emits contiguous revisions', () => {
    let now = 1_000;
    const state = new StateManager('arcade', () => now);
    const deltas: WorldDelta[] = [];
    state.onStateChange((notification) => {
      if (notification.type === 'delta') deltas.push(notification.delta);
    });

    state.handleHookEvent(hook('one'));
    state.handleHookEvent(hook('two', 'bob'));
    now += 100;
    state.handleHookEvent({ ...hook('one'), hook_event_name: 'PreToolUse', tool_name: 'Read' });
    state.handleHookEvent({ ...hook('two', 'bob'), hook_event_name: 'PreToolUse', tool_name: 'Edit' });

    const snapshot = state.getSnapshot();
    expect(snapshot.agents.map(agent => agent.world.slotIndex)).toEqual([0, 1]);
    expect(snapshot.agents.every(agent => agent.world.zone === 'work')).toBe(true);
    expect(deltas.map(delta => [delta.previousRevision, delta.revision])).toEqual([
      [0, 1], [1, 2], [2, 3], [3, 4],
    ]);
  });

  it('persists bounded shared state and restores without a browser history', () => {
    let now = 2_000;
    const state = new StateManager('mining', () => now);
    state.handleHookEvent(hook('one'));
    state.appendChat({ username: 'alice', message: 'hello', timestamp: now });
    const event = state.startGlobalEvent('vortex');
    const saved = state.getSnapshot();

    now += 500;
    const restored = new StateManager('arcade', () => now);
    restored.restoreWorld(saved);
    const snapshot = restored.getSnapshot();

    // Deployment configuration remains authoritative if the theme changes between restarts.
    expect(snapshot.environment).toBe('arcade');
    expect(snapshot.revision).toBe(saved.revision);
    expect(snapshot.agents[0]).toMatchObject({ sessionId: 'one', username: 'alice' });
    expect(snapshot.chat).toEqual([{ username: 'alice', message: 'hello', timestamp: 2_000 }]);
    expect(snapshot.events[0]?.id).toBe(event.id);
  });

  it('selects interaction targets from canonical server positions', () => {
    let now = 2_500;
    const state = new StateManager('arcade', () => now);
    state.handleHookEvent(hook('shooter'));
    state.handleHookEvent(hook('target', 'bob'));
    state.setManualControl('shooter', { x: 100, y: 100, facing: 'right', moving: false });
    state.setManualControl('target', { x: 200, y: 110, facing: 'left', moving: false });
    now += 101;

    expect(state.getShotTargets('shooter', 'right')).toEqual(['target']);
    expect(state.getShotTargets('shooter', 'left')).toEqual([]);
  });

  it('creates and expires tombstones on the server', () => {
    vi.useFakeTimers();
    let now = 3_000;
    const state = new StateManager('arcade', () => now);
    state.handleHookEvent(hook('one'));

    now += STALE_SESSION_TIMEOUT_MS + 1;
    expect(state.reapStale()).toEqual(['one']);
    expect(state.getSnapshot().tombstones).toHaveLength(1);

    now += TOMBSTONE_DURATION_MS + 1;
    state.advanceWorld(now);
    expect(state.getSnapshot().tombstones).toHaveLength(0);
    vi.useRealTimers();
  });
});
