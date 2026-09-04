import { describe, expect, it } from 'vitest';
import { AuthHandoffManager, HANDOFF_TTL_MS } from '../server/auth-handoff.js';
import { AuthService } from '../server/auth.js';

const DEVICE_SECRET = `afd1_${'A'.repeat(43)}`;

describe('AuthService', () => {
  it('derives stable server-specific owners from valid device credentials', () => {
    const firstServer = new AuthService('server-one');
    const sameServer = new AuthService('server-one');
    const otherServer = new AuthService('server-two');

    const first = firstServer.authenticateDevice(`Bearer ${DEVICE_SECRET}`);
    const same = sameServer.authenticateDevice(`Bearer ${DEVICE_SECRET}`);
    const other = otherServer.authenticateDevice(`Bearer ${DEVICE_SECRET}`);

    expect(first.kind).toBe('authenticated');
    expect(same).toEqual(first);
    expect(other).not.toEqual(first);
  });

  it('distinguishes legacy requests from malformed credentials', () => {
    const auth = new AuthService('server-secret');
    expect(auth.authenticateDevice(undefined)).toEqual({ kind: 'legacy' });
    expect(auth.authenticateDevice('Basic abc')).toEqual({ kind: 'invalid' });
    expect(auth.authenticateDevice('Bearer short')).toEqual({ kind: 'invalid' });
  });

  it('issues expiring browser sessions and rejects tampering', () => {
    let now = 1_000;
    const auth = new AuthService('server-secret', () => now);
    const principal = { ownerId: 'B'.repeat(43), username: 'alice' };
    const token = auth.issueBrowserSession(principal);

    expect(auth.verifyBrowserSession(token)).toEqual(principal);
    expect(auth.verifyBrowserSession(`${token.slice(0, -1)}x`)).toBeNull();

    now += 366 * 24 * 60 * 60 * 1_000;
    expect(auth.verifyBrowserSession(token)).toBeNull();
  });
});

describe('AuthHandoffManager', () => {
  it('consumes a handoff once and rejects it after replay', () => {
    const manager = new AuthHandoffManager();
    const principal = { ownerId: 'B'.repeat(43), username: 'alice' };
    const { code } = manager.create(principal);

    expect(manager.consume(code)).toEqual(principal);
    expect(manager.consume(code)).toBeNull();
  });

  it('expires handoffs and evicts the oldest entry at capacity', () => {
    let now = 1_000;
    const manager = new AuthHandoffManager(() => now, 1);
    const first = manager.create({ ownerId: 'A'.repeat(43), username: 'alice' });
    const second = manager.create({ ownerId: 'B'.repeat(43), username: 'bob' });

    expect(manager.consume(first.code)).toBeNull();
    now += HANDOFF_TTL_MS;
    expect(manager.consume(second.code)).toBeNull();
  });
});
