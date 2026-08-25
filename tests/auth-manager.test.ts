import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthManager } from '../client/auth/AuthManager';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});

describe('AuthManager login lifecycle', () => {
  it('persists the submitted token only after successful authentication', () => {
    const auth = new AuthManager();
    auth.beginLogin('alice.token');
    expect(auth.isLoggedIn).toBe(false);
    expect(auth.authenticationToken).toBe('alice.token');

    expect(auth.completeLogin('alice')).toBe(true);
    expect(auth.isLoggedIn).toBe(true);
    expect(auth.token).toBe('alice.token');
    expect(auth.username).toBe('alice');
  });

  it('clears pending and persisted identity on logout', () => {
    const auth = new AuthManager();
    auth.beginLogin('alice.token');
    auth.completeLogin('alice');
    auth.logout();

    expect(auth.isLoggedIn).toBe(false);
    expect(auth.token).toBeNull();
    expect(auth.username).toBeNull();
  });
});
