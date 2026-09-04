import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthHandoffManager } from '../server/auth-handoff.js';
import { AuthService } from '../server/auth.js';
import {
  BROWSER_SESSION_COOKIE,
  registerAuthRoutes,
} from '../server/routes/auth.js';
import { isSameHostOrigin } from '../server/request-security.js';

const DEVICE_SECRET = `afd1_${'A'.repeat(43)}`;

async function buildAuthApp() {
  const app = Fastify();
  await app.register(cookie);
  const auth = new AuthService('server-secret');
  registerAuthRoutes(app, auth, new AuthHandoffManager());
  return app;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('browser login routes', () => {
  it('exchanges a single-use handoff for a protected browser cookie', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = await buildAuthApp();

    const created = await app.inject({
      method: 'POST',
      url: '/api/auth/handoff',
      headers: {
        authorization: `Bearer ${DEVICE_SECRET}`,
        'x-forwarded-proto': 'https',
      },
      payload: { username: 'alice' },
    });
    expect(created.statusCode).toBe(200);
    const { code } = created.json<{ code: string }>();

    const exchanged = await app.inject({
      method: 'POST',
      url: '/api/auth/handoff/exchange',
      payload: { code },
    });
    expect(exchanged.statusCode).toBe(200);
    const setCookie = exchanged.headers['set-cookie'];
    expect(setCookie).toContain(`${BROWSER_SESSION_COOKIE}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Max-Age=31536000');

    const replayed = await app.inject({
      method: 'POST',
      url: '/api/auth/handoff/exchange',
      payload: { code },
    });
    expect(replayed.statusCode).toBe(400);

    await app.close();
  });

  it('restores and renews a valid session, then clears it on logout', async () => {
    const app = await buildAuthApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/auth/handoff',
      headers: { authorization: `Bearer ${DEVICE_SECRET}` },
      payload: { username: 'alice' },
    });
    const { code } = created.json<{ code: string }>();
    const exchanged = await app.inject({
      method: 'POST',
      url: '/api/auth/handoff/exchange',
      payload: { code },
    });
    const browserCookie = exchanged.cookies[0];

    const restored = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      cookies: { [browserCookie.name]: browserCookie.value },
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ authenticated: true, username: 'alice' });
    expect(restored.headers['set-cookie']).toContain(`${BROWSER_SESSION_COOKIE}=`);

    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(logout.headers['set-cookie']).toContain(`${BROWSER_SESSION_COOKIE}=;`);

    await app.close();
  });

  it('requires HTTPS for hosted handoff creation', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = await buildAuthApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/handoff',
      headers: { authorization: `Bearer ${DEVICE_SECRET}` },
      payload: { username: 'alice' },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

describe('browser origin validation', () => {
  it('accepts only the request host and rejects malformed origins', () => {
    expect(isSameHostOrigin('https://factory.example', 'factory.example')).toBe(true);
    expect(isSameHostOrigin('https://evil.example', 'factory.example')).toBe(false);
    expect(isSameHostOrigin('not-a-url', 'factory.example')).toBe(false);
    expect(isSameHostOrigin(undefined, 'factory.example')).toBe(false);
  });
});
