import { describe, expect, it } from 'vitest';
import { WorldStore } from '../client/state/WorldStore';
import type { WorldAgent, WorldSnapshot } from '../shared/types.js';

function agent(sessionId: string): WorldAgent {
  return {
    sessionId,
    username: 'alice',
    avatar: { spriteIndex: 0, color: '#fff', hat: null, trail: null },
    cwd: '/work',
    activity: 'idle',
    currentTool: null,
    currentToolInput: null,
    subagents: [],
    startedAt: 1,
    lastEventAt: 1,
    world: {
      zone: 'idle',
      slotIndex: 0,
      position: { x: 10, y: 20 },
      facing: 'down',
    },
  };
}

function snapshot(): WorldSnapshot {
  return {
    schemaVersion: 1,
    revision: 4,
    serverTime: 100,
    environment: 'arcade',
    agents: [agent('one')],
    tombstones: [],
    chat: [],
    events: [],
  };
}

describe('WorldStore', () => {
  it('applies contiguous deltas to a replaced snapshot', () => {
    const store = new WorldStore();
    store.replace(snapshot());
    const updated = agent('one');
    updated.activity = 'reading';

    expect(store.apply({
      previousRevision: 4,
      revision: 5,
      serverTime: 110,
      changes: [
        { kind: 'agent_upsert', agent: updated },
        { kind: 'chat_append', chat: { username: 'alice', message: 'hi', timestamp: 109 } },
      ],
    })).toBe('applied');

    expect(store.snapshot).toMatchObject({
      revision: 5,
      agents: [{ activity: 'reading' }],
      chat: [{ message: 'hi' }],
    });
  });

  it('rejects gaps and ignores stale deliveries', () => {
    const store = new WorldStore();
    expect(store.apply({ previousRevision: 0, revision: 1, serverTime: 1, changes: [] })).toBe('gap');
    store.replace(snapshot());
    expect(store.apply({ previousRevision: 2, revision: 3, serverTime: 2, changes: [] })).toBe('stale');
    expect(store.apply({ previousRevision: 5, revision: 6, serverTime: 3, changes: [] })).toBe('gap');
    expect(store.snapshot?.revision).toBe(4);
  });
});
