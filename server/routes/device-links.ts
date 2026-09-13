import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthService } from '../auth.js';
import type { AvatarProfiles } from '../avatar-profiles.js';
import { DeviceLinks, DeviceLinkError, LINK_TTL_MS } from '../device-links.js';
import { readBrowserPrincipal } from './auth.js';
import { isSameHostOrigin, usesSecureTransport } from '../request-security.js';

function bearer(request: FastifyRequest) { return /^Bearer (afn1_[A-Za-z0-9_-]{43})$/.exec(request.headers.authorization ?? '')?.[1]; }

export function registerDeviceLinkRoutes(app: FastifyInstance, auth: AuthService, links: DeviceLinks, profiles: AvatarProfiles) {
  // Bounded, process-local abuse limits. Pending links also have a global capacity limit.
  const attempts = new Map<string, { count: number; until: number }>();
  function allowed(request: FastifyRequest, reply: FastifyReply, kind: string, limit: number) {
    reply.header('Cache-Control', 'no-store');
    if (!usesSecureTransport(request)) { reply.code(403).send({ error: 'https_required' }); return false; }
    const now = Date.now();
    for (const [key, item] of attempts) if (item.until <= now) attempts.delete(key);
    const key = `${kind}:${request.ip}`;
    if (!attempts.has(key) && attempts.size >= 10_000) { reply.code(429).send({ error: 'busy' }); return false; }
    const item = attempts.get(key) ?? { count: 0, until: now + 60_000 }; attempts.set(key, item);
    if (++item.count > limit) { reply.header('Retry-After', '60').code(429).send({ error: 'slow_down' }); return false; }
    return true;
  }
  function browser(request: FastifyRequest, reply: FastifyReply, mutation = true) {
    if (!allowed(request, reply, 'browser', 60)) return;
    const principal = readBrowserPrincipal(request, auth);
    if (!principal) { reply.code(401).send({ error: 'browser_connection_required' }); return; }
    if (mutation && !isSameHostOrigin(request.headers.origin, request.headers.host)) { reply.code(403).send({ error: 'factory_origin_required' }); return; }
    if (request.headers['x-factory-owner'] !== principal.ownerId) { reply.code(409).send({ error: 'connection_changed' }); return; }
    return principal;
  }
  async function result(reply: FastifyReply, action: () => unknown | Promise<unknown>) {
    try { return reply.send(await action()); }
    catch (error) {
      if (error instanceof DeviceLinkError) return reply.code(error.status).send({ error: error.code });
      // Never log request tokens or database errors containing record parameters.
      return reply.code(503).send({ error: 'device_store_unavailable' });
    }
  }
  app.get('/api/auth/devices/capabilities', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { version: 1, linkExpiresIn: LINK_TTL_MS / 1000, scopes: ['identity:read', 'avatar:read'], nativeCommands: false };
  });
  app.post<{ Body: { deviceName?: unknown; tokenHash?: unknown } }>('/api/auth/devices/link', { bodyLimit: 1024 }, async (request, reply) => {
    if (!allowed(request, reply, 'create', 20)) return;
    return result(reply, () => links.begin(request.body?.deviceName, request.body?.tokenHash));
  });
  app.post<{ Body: { requestId?: unknown } }>('/api/auth/devices/link/exchange', { bodyLimit: 1024 }, async (request, reply) => {
    if (!allowed(request, reply, 'exchange', 240)) return;
    return result(reply, () => links.exchange(request.body?.requestId, bearer(request)));
  });
  app.post<{ Body: { requestId?: unknown } }>('/api/auth/devices/link/cancel', { bodyLimit: 1024 }, async (request, reply) => {
    if (!allowed(request, reply, 'cancel', 30)) return;
    return result(reply, () => links.cancel(request.body?.requestId, bearer(request)));
  });
  app.post<{ Body: { code?: unknown } }>('/api/auth/devices/inspect', { bodyLimit: 1024 }, async (request, reply) => {
    if (!browser(request, reply)) return;
    return result(reply, () => links.inspect(request.body?.code));
  });
  app.post<{ Body: { code?: unknown } }>('/api/auth/devices/approve', { bodyLimit: 1024 }, async (request, reply) => {
    const principal = browser(request, reply); if (!principal) return;
    return result(reply, () => links.approve(request.body?.code, principal));
  });
  app.get('/api/auth/devices', async (request, reply) => {
    const principal = browser(request, reply, false); if (!principal) return;
    return { devices: links.list(principal.ownerId) };
  });
  app.delete<{ Params: { id: string } }>('/api/auth/devices/:id', async (request, reply) => {
    const principal = browser(request, reply); if (!principal) return;
    return result(reply, () => links.revoke(request.params.id, principal.ownerId));
  });
  app.get('/api/auth/native/session', async (request, reply) => {
    if (!allowed(request, reply, 'session', 240)) return;
    const device = links.authenticate(bearer(request));
    if (!device) return reply.code(401).send({ authenticated: false });
    return { ...links.session(device), profile: profiles.get(device.ownerId) };
  });
  app.post('/api/auth/native/logout', async (request, reply) => {
    if (!allowed(request, reply, 'logout', 30)) return;
    const device = links.authenticate(bearer(request));
    if (!device) return reply.code(401).send({ authenticated: false });
    return result(reply, () => links.revoke(device.id, device.ownerId));
  });
}
