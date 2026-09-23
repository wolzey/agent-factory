import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { AuthService } from '../server/auth.js';
import { registerHookRoutes } from '../server/routes/hooks.js';
import { RemoteSessionRegistry } from '../server/remote-registry.js';
import { SessionCreationLimits } from '../server/session-limits.js';
import { StateManager } from '../server/state.js';
import { BroadcastManager } from '../server/ws/broadcast.js';

function start(session_id: string) {
  return { hook_event_name: 'SessionStart', session_id, cwd: '/work', username: 'visitor' };
}

function buildApp(limits: SessionCreationLimits) {
  const app = Fastify();
  const state = new StateManager('factory25d');
  registerHookRoutes(app, state, new BroadcastManager(), { title: 'test' }, new AuthService('limits-test-secret'),
    () => ({ healthy: true, lastSavedRevision: null, lastError: null }), new RemoteSessionRegistry(), limits);
  return { app, state };
}

describe('session creation limits', () => {
  it('lets each client address start a bounded number of sessions per window', () => {
    let now = 0;
    const limits = new SessionCreationLimits(150, 2, 60_000, () => now);
    expect(limits.allow('a')).toBe(true);
    expect(limits.allow('a')).toBe(true);
    expect(limits.allow('a')).toBe(false);
    expect(limits.allow('b')).toBe(true);
    now = 60_001;
    expect(limits.allow('a')).toBe(true);
  });

  it('answers 429 past the per-address limit, keyed on the address Cloudflare reports', async () => {
    const { app, state } = buildApp(new SessionCreationLimits(150, 2));
    const post = (id: string, address: string) => app.inject({ method: 'POST', url: '/api/hooks', payload: start(id), headers: { 'cf-connecting-ip': address } });

    expect((await post('one', '203.0.113.9')).statusCode).toBe(200);
    expect((await post('two', '203.0.113.9')).statusCode).toBe(200);
    expect((await post('three', '203.0.113.9')).statusCode).toBe(429);
    expect((await post('four', '198.51.100.4')).statusCode).toBe(200);
    // Events for sessions that already exist are never limited.
    expect((await post('one', '203.0.113.9')).statusCode).toBe(200);
    expect(state.getAll().map(agent => agent.sessionId).sort()).toEqual(['four', 'one', 'two']);
  });

  it('stops adding agents once the room is full', async () => {
    const { app, state } = buildApp(new SessionCreationLimits(2, 100));
    for (const id of ['one', 'two']) expect((await app.inject({ method: 'POST', url: '/api/hooks', payload: start(id) })).statusCode).toBe(200);
    const full = await app.inject({ method: 'POST', url: '/api/hooks', payload: start('three') });
    expect(full.statusCode).toBe(429);
    expect(full.json()).toEqual({ error: 'The factory is full' });
    expect(state.getAll()).toHaveLength(2);
  });
});
