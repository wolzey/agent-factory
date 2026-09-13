import { createBranding } from '../server/branding.js';
import Fastify from 'fastify';
import { expect, it } from 'vitest';
import { AuthService } from '../server/auth.js';
import { registerHookRoutes } from '../server/routes/hooks.js';
import { RemoteSessionRegistry } from '../server/remote-registry.js';
import { StateManager } from '../server/state.js';
import { BroadcastManager } from '../server/ws/broadcast.js';

it('exposes only public renderer settings even when file config contains authentication secrets', async () => {
  const app = Fastify();
  // loadServerConfig merges the JSON file, which also stores the installation's signing key.
  const fileConfig = { title: 'QA office', environment: 'factory25d' as const, graphicDeath: false,
    tokenSecret: 'synthetic-qa-key', futurePrivateSetting: 'private', branding: {...createBranding({}).branding, privatePath: '/operator/secret'} };
  registerHookRoutes(app, new StateManager('factory25d'), new BroadcastManager(), fileConfig,
    new AuthService('test-only'), () => ({ healthy: true, lastSavedRevision: null, lastError: null }), new RemoteSessionRegistry());
  try {
    const response = await app.inject({ method: 'GET', url: '/api/config' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ title: 'QA office', environment: 'factory25d', graphicDeath: false, branding: createBranding({}).branding });
  } finally { await app.close(); }
});
