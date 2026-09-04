import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { AuthService } from '../server/auth.js';
import { registerHookRoutes } from '../server/routes/hooks.js';
import { StateManager } from '../server/state.js';
import { BroadcastManager } from '../server/ws/broadcast.js';
import type { HookPayload } from '../shared/types.js';

const FIRST_SECRET = `afd1_${'A'.repeat(43)}`;
const SECOND_SECRET = `afd1_${'B'.repeat(43)}`;

function payload(sessionId: string): HookPayload {
  return {
    hook_event_name: 'SessionStart',
    session_id: sessionId,
    cwd: '/work',
    username: 'same-name',
    avatar: { spriteIndex: 0, color: '#fff', hat: null, trail: null },
  };
}

function buildHookApp() {
  const app = Fastify();
  const state = new StateManager('arcade');
  const auth = new AuthService('server-secret');
  registerHookRoutes(
    app,
    state,
    new BroadcastManager(),
    { title: 'test', environment: 'arcade' },
    auth,
    () => ({ healthy: true, lastSavedRevision: null, lastError: null }),
  );
  return { app, state, auth };
}

describe('hook ownership boundary', () => {
  it('keeps unsigned legacy sessions visible but unowned', async () => {
    const { app, state } = buildHookApp();
    const forged = { ...payload('legacy'), ownerId: 'forged-owner' };
    const response = await app.inject({ method: 'POST', url: '/api/hooks', payload: forged });

    expect(response.statusCode).toBe(200);
    expect(state.get('legacy')).toMatchObject({ username: 'same-name', ownerId: undefined });
    await app.close();
  });

  it('assigns different owners to installations using the same display name', async () => {
    const { app, state } = buildHookApp();
    await app.inject({
      method: 'POST', url: '/api/hooks', payload: payload('first'),
      headers: { authorization: `Bearer ${FIRST_SECRET}` },
    });
    await app.inject({
      method: 'POST', url: '/api/hooks', payload: payload('second'),
      headers: { authorization: `Bearer ${SECOND_SECRET}` },
    });

    expect(state.get('first')?.ownerId).toBeTruthy();
    expect(state.get('second')?.ownerId).toBeTruthy();
    expect(state.get('first')?.ownerId).not.toBe(state.get('second')?.ownerId);
    await app.close();
  });

  it('rejects unsigned and cross-installation updates to an owned session', async () => {
    const { app } = buildHookApp();
    await app.inject({
      method: 'POST', url: '/api/hooks', payload: payload('owned'),
      headers: { authorization: `Bearer ${FIRST_SECRET}` },
    });

    const unsigned = await app.inject({ method: 'POST', url: '/api/hooks', payload: payload('owned') });
    const otherDevice = await app.inject({
      method: 'POST', url: '/api/hooks', payload: payload('owned'),
      headers: { authorization: `Bearer ${SECOND_SECRET}` },
    });
    expect(unsigned.statusCode).toBe(403);
    expect(otherDevice.statusCode).toBe(403);
    await app.close();
  });

  it('does not retroactively claim an existing legacy session', async () => {
    const { app, state } = buildHookApp();
    await app.inject({ method: 'POST', url: '/api/hooks', payload: payload('legacy') });
    const upgraded = await app.inject({
      method: 'POST', url: '/api/hooks', payload: payload('legacy'),
      headers: { authorization: `Bearer ${FIRST_SECRET}` },
    });

    expect(upgraded.statusCode).toBe(200);
    expect(state.get('legacy')?.ownerId).toBeUndefined();
    await app.close();
  });

  it('rejects malformed credentials rather than treating them as legacy', async () => {
    const { app } = buildHookApp();
    const response = await app.inject({
      method: 'POST', url: '/api/hooks', payload: payload('invalid'),
      headers: { authorization: 'Bearer invalid' },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
