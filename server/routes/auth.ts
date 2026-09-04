import '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  BROWSER_SESSION_MAX_AGE_SECONDS,
  type AuthPrincipal,
  type AuthService,
} from '../auth.js';
import type { AuthHandoffManager } from '../auth-handoff.js';
import { usesSecureTransport } from '../request-security.js';

export const BROWSER_SESSION_COOKIE = 'af_session';

export function registerAuthRoutes(
  app: FastifyInstance,
  auth: AuthService,
  handoffs: AuthHandoffManager,
): void {
  app.post<{ Body: { username?: string } }>('/api/auth/handoff', async (request, reply) => {
    if (!usesSecureTransport(request)) {
      return reply.status(400).send({ error: 'HTTPS is required for remote login' });
    }

    const device = auth.authenticateDevice(request.headers.authorization);
    if (device.kind !== 'authenticated') {
      return reply.status(401).send({ error: 'Valid installation authentication required' });
    }

    const username = request.body?.username?.trim();
    if (!username || username.length > 100) {
      return reply.status(400).send({ error: 'Username must be between 1 and 100 characters' });
    }

    return reply.send(handoffs.create({ ownerId: device.ownerId, username }));
  });

  app.post<{ Body: { code?: string } }>('/api/auth/handoff/exchange', async (request, reply) => {
    const principal = handoffs.consume(request.body?.code ?? '');
    if (!principal) {
      return reply.status(400).send({ error: 'Login handoff is invalid or expired' });
    }

    setBrowserSession(reply, auth, principal);
    return reply.send({ authenticated: true, ...principal });
  });

  app.get('/api/auth/session', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const principal = readBrowserPrincipal(request, auth);
    if (!principal) {
      clearBrowserSession(reply);
      return reply.status(401).send({ authenticated: false });
    }

    // Sliding expiration: each normal browser startup renews the one-year cookie.
    setBrowserSession(reply, auth, principal);
    return reply.send({ authenticated: true, ...principal });
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    clearBrowserSession(reply);
    return reply.send({ ok: true });
  });
}

export function readBrowserPrincipal(
  request: FastifyRequest,
  auth: AuthService,
): AuthPrincipal | null {
  return auth.verifyBrowserSession(request.cookies[BROWSER_SESSION_COOKIE]);
}

function setBrowserSession(
  reply: FastifyReply,
  auth: AuthService,
  principal: AuthPrincipal,
): void {
  reply.setCookie(BROWSER_SESSION_COOKIE, auth.issueBrowserSession(principal), cookieOptions());
}

function clearBrowserSession(reply: FastifyReply): void {
  reply.clearCookie(BROWSER_SESSION_COOKIE, cookieOptions());
}

function cookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: BROWSER_SESSION_MAX_AGE_SECONDS,
  };
}

