import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from '@fastify/websocket';
import { BroadcastManager, SERVER_BUILD_ID } from '../server/ws/broadcast.js';

function failingSocket(): WebSocket {
  return {
    readyState: 1,
    send: () => { throw new Error('socket failed'); },
    on: vi.fn(),
  } as unknown as WebSocket;
}

describe('BroadcastManager failure isolation', () => {
  it('removes a failing socket without throwing into state persistence', () => {
    const broadcast = new BroadcastManager();
    const socket = failingSocket();
    broadcast.add(socket);

    expect(() => broadcast.broadcastWorldDelta({
      previousRevision: 0,
      revision: 1,
      serverTime: 1,
      changes: [],
    })).not.toThrow();
    expect(broadcast.clientCount).toBe(0);
  });
});

describe('BroadcastManager snapshot tagging', () => {
  it('tags every world snapshot with the running build id', () => {
    const sent: string[] = [];
    const socket = { readyState: 1, send: (raw: string) => sent.push(raw), on: vi.fn() } as unknown as WebSocket;
    const broadcast = new BroadcastManager();
    broadcast.add(socket);
    broadcast.sendWorldSnapshot(socket, { revision: 3, serverTime: 1, agents: [] } as never);
    const message = JSON.parse(sent[0]);
    expect(message.type).toBe('world_snapshot');
    expect(message.buildId).toBe(SERVER_BUILD_ID);
    expect(typeof message.buildId).toBe('string');
    expect(message.buildId.length).toBeGreaterThan(0);
  });
});
