import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { AuthService } from '../server/auth.js';
import { registerHookRoutes } from '../server/routes/hooks.js';
import { RemoteSessionRegistry } from '../server/remote-registry.js';
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
  const remoteRegistry = new RemoteSessionRegistry();
  remoteRegistry.setAdmissionCheck((id, ownerId) => {
    const session = state.get(id);
    return !!session && session.ownerId === ownerId;
  });
  registerHookRoutes(
    app,
    state,
    new BroadcastManager(),
    { title: 'test', environment: 'arcade' },
    auth,
    () => ({ healthy: true, lastSavedRevision: null, lastError: null }),
    remoteRegistry,
  );
  return { app, state, auth, remoteRegistry };
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

  it('holds a session only for the installation that owns it', async () => {
    const { app } = buildHookApp();
    const secure = { authorization: `Bearer ${FIRST_SECRET}`, 'x-forwarded-proto': 'https' };
    await app.inject({ method: 'POST', url: '/api/hooks', payload: payload('owned'), headers: secure });

    const unsigned = await app.inject({
      method: 'POST', url: '/api/registry/heartbeat',
      payload: { session_ids: ['owned'] }, headers: { 'x-forwarded-proto': 'https' },
    });
    // Session ids are public in world state, so an unsigned report would let
    // anyone hold a session open after the machine running it is gone.
    expect(unsigned.statusCode).toBe(401);

    const wrongOwner = await app.inject({
      method: 'POST', url: '/api/registry/heartbeat', payload: { session_ids: ['owned'] },
      headers: { authorization: `Bearer ${SECOND_SECRET}`, 'x-forwarded-proto': 'https' },
    });
    expect(wrongOwner.statusCode).toBe(200);
    expect(wrongOwner.json()).toMatchObject({ tracked: 0 });

    const owner = await app.inject({
      method: 'POST', url: '/api/registry/heartbeat',
      payload: { session_ids: ['owned', 'never-seen'] }, headers: secure,
    });
    expect(owner.json()).toMatchObject({ tracked: 1 });
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
