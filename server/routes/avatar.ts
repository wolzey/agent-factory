import type { FastifyInstance } from 'fastify';
import type { AuthService } from '../auth.js';
import type { AvatarProfiles } from '../avatar-profiles.js';
import { readBrowserPrincipal } from './auth.js';
import { isSameHostOrigin, usesSecureTransport } from '../request-security.js';
import { parseAvatarConfig } from '../../shared/avatar-customization.js';

export function registerAvatarRoutes(app: FastifyInstance, auth: AuthService, profiles: AvatarProfiles) {
  app.get('/api/avatar', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const principal = readBrowserPrincipal(request, auth);
    if (!principal) return reply.status(401).send({ error: 'Connect your browser to edit your avatar.' });
    if (request.headers['x-avatar-owner'] && request.headers['x-avatar-owner'] !== principal.ownerId) {
      return reply.status(409).send({ error: 'Your connection changed. Reopen the avatar editor.' });
    }
    return reply.send(profiles.get(principal.ownerId));
  });

  app.put<{ Body: { avatar?: unknown } }>('/api/avatar', { bodyLimit: 4096 }, async (request, reply) => {
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
    try {
      // Ownership comes exclusively from the verified browser cookie.
      return reply.send(await profiles.save(principal.ownerId, avatar));
    } catch {
      request.log.error('Could not persist avatar profile');
      return reply.status(503).send({ error: 'Your avatar couldn’t be saved. Please try again.' });
    }
  });
}
