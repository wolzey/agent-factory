import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthManager } from '../client/auth/AuthManager';

let values: Map<string, string>;

beforeEach(() => {
  values = new Map([
    ['af_token', 'legacy-token'],
    ['af_username', 'legacy-user'],
  ]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});

function sessionResponse() {
  return new Response(JSON.stringify({
    authenticated: true,
    username: 'alice',
    ownerId: 'owner-one',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AuthManager cookie session lifecycle', () => {
  it('removes legacy browser token storage on construction', () => {
    const auth = new AuthManager(vi.fn<typeof fetch>());
    expect(auth.isLoggedIn).toBe(false);
    expect(values.has('af_token')).toBe(false);
    expect(values.has('af_username')).toBe(false);
  });

  it('exchanges a handoff using same-origin cookies without persisting credentials', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(sessionResponse());
    const auth = new AuthManager(fetcher);

    expect(await auth.exchangeHandoff('one-time-code')).toBe(true);
    expect(auth.username).toBe('alice');
    expect(auth.ownerId).toBe('owner-one');
    expect(fetcher).toHaveBeenCalledWith('/api/auth/handoff/exchange', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      body: JSON.stringify({ code: 'one-time-code' }),
    }));
    expect(values.size).toBe(0);
  });

  it('restores an existing cookie session on startup', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(sessionResponse());
    const auth = new AuthManager(fetcher);

    expect(await auth.restoreSession()).toBe(true);
    expect(auth.isLoggedIn).toBe(true);
    expect(fetcher).toHaveBeenCalledWith('/api/auth/session', expect.objectContaining({
      method: 'GET',
      credentials: 'same-origin',
    }));
  });

  it('clears local state and asks the server to clear its cookie on logout', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(sessionResponse());
    const auth = new AuthManager(fetcher);
    await auth.restoreSession();
    await auth.logout();

    expect(auth.isLoggedIn).toBe(false);
    expect(auth.username).toBeNull();
    expect(auth.ownerId).toBeNull();
    expect(fetcher).toHaveBeenLastCalledWith('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
  });
});
