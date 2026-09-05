import { describe, expect, it } from 'vitest';
import {
  boardDataFromSnapshot,
  rankBoardAgents,
  boardColumn,
  sessionAge,
  applyBoardChanges,
  readChat,
} from '../client/prototypes/factory25dBoardData';

describe('whiteboard public factory data', () => {
  it('keeps absent counts unknown and preserves genuine zeroes', () => {
    const old = boardDataFromSnapshot({
      agents: [{ sessionId: 'a', username: 'Ada', activity: 'thinking' }],
    });
    expect(old.merges).toBeNull();
    expect(old.agents[0].tools).toBeNull();
    const current = boardDataFromSnapshot({
      mergeCount: 0,
      agents: [{ sessionId: 'a', username: 'Ada', toolUseCount: 0 }],
    });
    expect(current.merges).toBe(0);
    expect(current.agents[0].tools).toBe(0);
  });
  it('rejects malformed snapshots and ignores incomplete agents', () => {
    for (const value of [null, {}, { agents: 'bad' }]) expect(() => boardDataFromSnapshot(value)).toThrow();
    expect(
      boardDataFromSnapshot({
        agents: [null, {}, { sessionId: 'a', username: 'Ada', sessionName: 42, toolUseCount: -1 }],
        mergeCount: 1.5,
      }),
    ).toEqual({
      connected: true,
      merges: null,
      chat: [],
      agents: [
        {
          id: 'a',
          name: 'Ada',
          owner: 'Ada',
          task: null,
          project: null,
          tool: null,
          startedAt: null,
          activity: 'unknown',
          tools: null,
          avatar: undefined,
          slot: null,
        },
      ],
    });
  });
  it('ranks sessions by recorded activity without inventing merge attribution', () => {
    const data = boardDataFromSnapshot({
      mergeCount: 17,
      agents: [
        { sessionId: 'c', username: 'Ada', toolUseCount: 0 },
        { sessionId: 'a', username: 'Ada', sessionName: 'Checkout', toolUseCount: 8 },
        { sessionId: 'b', username: 'Ben', toolUseCount: 12 },
        { sessionId: 'd', username: 'Unknown' },
      ],
    });
    const before = structuredClone(data.agents);
    expect(rankBoardAgents(data.agents).map((a) => a.id)).toEqual(['b', 'a', 'c', 'd']);
    expect(data.agents).toEqual(before);
    expect(data.merges).toBe(17);
  });
  it('keeps real task and owner fields distinct and only exposes a project basename', () => {
    const data = boardDataFromSnapshot({
      agents: [
        {
          sessionId: 'a',
          username: 'Ada',
          sessionName: 'Checkout',
          taskDescription: 'Fix validation',
          cwd: '/private/work/checkout/',
          currentTool: 'Edit',
          startedAt: 1000,
        },
      ],
    });
    expect(data.agents[0]).toMatchObject({
      name: 'Checkout',
      owner: 'Ada',
      task: 'Fix validation',
      project: 'checkout',
      tool: 'Edit',
      startedAt: 1000,
    });
    expect(JSON.stringify(data)).not.toContain('/private');
    const missing = boardDataFromSnapshot({
      agents: [{ sessionId: 'b', username: 'Ben', taskDescription: ' ', cwd: 42, startedAt: -1 }],
    });
    expect(missing.agents[0]).toMatchObject({ task: null, project: null, startedAt: null });
  });
  it('groups actual activities without relabeling idle or unknown sessions as working', () => {
    expect(['thinking', 'planning', 'chatting', 'compacting'].map(boardColumn)).toEqual(
      Array(4).fill('thinking'),
    );
    expect(['writing', 'running'].map(boardColumn)).toEqual(['coding', 'coding']);
    expect(['reading', 'searching'].map(boardColumn)).toEqual(['reading', 'reading']);
    expect(['idle', 'waiting', 'stopped', 'unknown', 'future-state'].map(boardColumn)).toEqual(
      Array(5).fill(null),
    );
  });
  it('only shows a session age when a valid start time is known', () => {
    expect(sessionAge(null, 60000)).toBe('');
    expect(sessionAge(70000, 60000)).toBe('');
    expect(sessionAge(59000, 60000)).toBe('<1m');
    expect(sessionAge(0, 120000)).toBe('2m');
    expect(sessionAge(0, 7200000)).toBe('2h');
  });
  it('keeps current chat through agent updates and appends server messages once in order', () => {
    const first = { username: 'Ada', message: 'hello', timestamp: 1 };
    const second = { username: 'Ben', message: '@Ada hello', timestamp: 2 };
    const initial = boardDataFromSnapshot({ agents: [], chat: [first] });
    const next = applyBoardChanges(initial, [
      { kind: 'agent_upsert', agent: { sessionId: 'a', username: 'Ada' } },
      { kind: 'chat_append', chat: second },
    ]);
    expect(next.chat).toEqual([first, second]);
    expect(initial.chat).toEqual([first]);
    expect(boardDataFromSnapshot({ agents: [], chat: next.chat }).chat).toEqual(next.chat);
  });
  it('caps history at the same 100 messages as the factory and rejects malformed entries', () => {
    const history = Array.from({ length: 100 }, (_, i) => ({ username: 'Ada', message: `message ${i}`, timestamp: i }));
    const data = boardDataFromSnapshot({ agents: [], chat: history });
    const newest = { username: 'Ben', message: '<b>literal</b>', timestamp: 100 };
    expect(applyBoardChanges(data, [{ kind: 'chat_append', chat: newest }]).chat).toEqual([...history.slice(1), newest]);
    expect(readChat([null, {}, { ...newest, timestamp: -1 }, { ...newest, message: ' ' }, newest])).toEqual([newest]);
  });
});
