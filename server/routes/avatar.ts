import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AuthService } from '../auth.js';
import { AvatarConflict, type AvatarProfiles } from '../avatar-profiles.js';
import { readBrowserPrincipal } from './auth.js';
import { isSameHostOrigin, usesSecureTransport } from '../request-security.js';
import { parseAvatarConfig } from '../../shared/avatar-customization.js';

export function registerAvatarRoutes(app: FastifyInstance, auth: AuthService, profiles: AvatarProfiles) {
  // Explicit terminal edits share durable preferences with the browser. Ordinary
  // hooks still cannot overwrite them with an old copy of the local config.
  function installationOwner(request: FastifyRequest, reply: FastifyReply) {
    reply.header('Cache-Control', 'no-store');
    const device = auth.authenticateDevice(request.headers.authorization);
    if (device.kind !== 'authenticated') {
      reply.status(401).send({ error: 'Installation authentication required.' }); return;
    }
    if (!usesSecureTransport(request)) {
      reply.status(403).send({ error: 'HTTPS is required to save your avatar.' }); return;
    }
    return device.ownerId;
  }
  app.get('/api/avatar/installation', async (request, reply) => {
    const ownerId = installationOwner(request, reply);
    if (!ownerId) return;
    return profiles.read(ownerId);
  });
  app.put<{ Body: { avatar?: unknown; revision?: unknown } }>('/api/avatar/installation', { bodyLimit: 4096 }, async (request, reply) => {
    const ownerId = installationOwner(request, reply);
    if (!ownerId) return;
    const avatar = parseAvatarConfig(request.body?.avatar);
    if (!avatar) return reply.status(400).send({ error: 'That appearance is invalid.' });
    if (typeof request.body?.revision !== 'string') return reply.status(428).send({ error: 'Reload your avatar before saving; this client needs revision support.' });
    try { return await profiles.save(ownerId, avatar, request.body.revision); }
    catch (error) {
      if (error instanceof AvatarConflict) return reply.status(409).send({ error: 'avatar_changed', profile: error.profile });
      request.log.error('Could not persist terminal avatar profile');
      return reply.status(503).send({ error: 'Your avatar could not be saved. Please try again.' });
    }
  });

  app.get('/api/avatar', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const principal = readBrowserPrincipal(request, auth);
    if (!principal) return reply.status(401).send({ error: 'Connect your browser to edit your avatar.' });
    if (request.headers['x-avatar-owner'] && request.headers['x-avatar-owner'] !== principal.ownerId) {
      return reply.status(409).send({ error: 'Your connection changed. Reopen the avatar editor.' });
    }
    return reply.send(await profiles.read(principal.ownerId));
  });

  app.put<{ Body: { avatar?: unknown; revision?: unknown } }>('/api/avatar', { bodyLimit: 4096 }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const principal = readBrowserPrincipal(request, auth);
    if (!principal) return reply.status(401).send({ error: 'Connect your browser to edit your avatar.' });
    if (!isSameHostOrigin(request.headers.origin, request.headers.host) || !usesSecureTransport(request)) {
      return reply.status(403).send({ error: 'Save your avatar from the factory page.' });
    }
    // This is an identity precondition, never a selector for whose profile to edit.
    // A cookie changed in another tab must not save an old draft to the new owner.
    if (request.headers['x-avatar-owner'] !== principal.ownerId) {
      return reply.status(409).send({ error: 'Your connection changed. Reopen the avatar editor.' });
    }
    const avatar = parseAvatarConfig(request.body?.avatar);
    if (!avatar) return reply.status(400).send({ error: 'That appearance is invalid. Reload the editor and try again.' });
    if (typeof request.body?.revision !== 'string') return reply.status(428).send({ error: 'Reload the editor before saving.' });
    try {
      // Ownership comes exclusively from the verified browser cookie.
      return reply.send(await profiles.save(principal.ownerId, avatar, request.body.revision as string));
    } catch (error) {
      if (error instanceof AvatarConflict) return reply.status(409).send({ error: 'avatar_changed', profile: error.profile });
      request.log.error('Could not persist avatar profile');
      return reply.status(503).send({ error: 'Your avatar couldn’t be saved. Please try again.' });
    }
  });
}
