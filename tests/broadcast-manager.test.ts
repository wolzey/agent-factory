import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from '@fastify/websocket';
import { BroadcastManager } from '../server/ws/broadcast.js';

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
