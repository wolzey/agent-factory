import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { describe, it, expect, vi } from 'vitest';
import { DeviceLinks, nativeTokenHash, LINK_TTL_MS, DEVICE_TTL_MS } from '../server/device-links.js';
import { LibSqlWorldRepository } from '../server/persistence/libsql-world-repository.js';
import { AuthService } from '../server/auth.js';
import { AvatarProfiles } from '../server/avatar-profiles.js';
import { StateManager } from '../server/state.js';
import { registerDeviceLinkRoutes } from '../server/routes/device-links.js';
const principal = { ownerId: 'A'.repeat(43), username: 'Alice' };
const other = { ownerId: 'B'.repeat(43), username: 'Bob' };
const token = () => `afn1_${randomBytes(32).toString('base64url')}`;
async function fixture(run: (links: DeviceLinks, repo: LibSqlWorldRepository, clock: { now: number }) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'factory-link-'));
  const repo = new LibSqlWorldRepository({ url: `file:${join(dir, 'db.sqlite')}`, production: false });
  try { await repo.initialize(); const clock = { now: 1_000_000 }; const links = new DeviceLinks(repo, () => clock.now); await links.initialize(); await run(links, repo, clock); }
  finally { await repo.close(); await rm(dir, { recursive: true, force: true }); }
}
describe('native device grants', () => {
  it('binds approval to the initiating credential, survives restart, and never stores the raw credential', () => fixture(async (links, repo, clock) => {
    const key = token(), link = links.begin('Alice’s iPad', nativeTokenHash(key));
    expect(await links.exchange(link.requestId, key)).toEqual({ status: 'pending' });
    await links.approve(link.userCode, principal);
    await expect(links.exchange(link.requestId, token())).rejects.toMatchObject({ code: 'link_unavailable' });
    const result = await links.exchange(link.requestId, key);
    expect(result).toMatchObject({ status: 'linked', ownerId: principal.ownerId });
    expect(await links.exchange(link.requestId, key)).toEqual(result);
    const stored = await repo.loadLinkedDevices(); expect(stored).toHaveLength(1); expect(JSON.stringify(stored)).not.toContain(key);
    const restarted = new DeviceLinks(repo, () => clock.now); await restarted.initialize();
    expect(restarted.authenticate(key)?.ownerId).toBe(principal.ownerId);
    expect(() => restarted.begin('Another device', nativeTokenHash(key))).toThrow('credential_already_linked');
    expect(new AuthService('secret').authenticateDevice(`Bearer ${key}`)).toEqual({ kind: 'invalid' });
  }));
  it('expires pending links, rejects takeover, and never revives revoked grants through exchange retry', () => fixture(async (links, repo, clock) => {
    const key = token(), link = links.begin('Mac', nativeTokenHash(key));
    await links.approve(link.userCode, principal);
    await expect(links.approve(link.userCode, other)).rejects.toMatchObject({ code: 'already_approved' });
    await links.exchange(link.requestId, key); const id = links.list(principal.ownerId)[0].id;
    await expect(links.revoke(id, other.ownerId)).rejects.toMatchObject({ status: 404 });
    expect(links.list(other.ownerId)).toEqual([]);
    await links.revoke(id, principal.ownerId); expect(links.authenticate(key)).toBeNull();
    await expect(links.exchange(link.requestId, key)).rejects.toMatchObject({ code: 'device_revoked' });
    const restarted = new DeviceLinks(repo, () => clock.now); await restarted.initialize(); expect(restarted.authenticate(key)).toBeNull();
    const pending = links.begin('iPad', nativeTokenHash(token())); clock.now += LINK_TTL_MS;
    expect(() => links.inspect(pending.userCode)).toThrow('link_unavailable');
  }));
  it('does not authenticate a grant until persistence succeeds; retries recover from storage failure', () => fixture(async (links, repo) => {
    const key = token(), link = links.begin('Mac', nativeTokenHash(key)); await links.approve(link.userCode, principal);
    vi.spyOn(repo, 'saveLinkedDevice').mockRejectedValueOnce(new Error('offline'));
    await expect(links.exchange(link.requestId, key)).rejects.toThrow('offline'); expect(links.authenticate(key)).toBeNull();
    await links.exchange(link.requestId, key); expect(links.authenticate(key)).not.toBeNull();
    vi.spyOn(repo, 'deleteLinkedDevice').mockRejectedValueOnce(new Error('offline'));
    await expect(links.revoke(links.list(principal.ownerId)[0].id, principal.ownerId)).rejects.toThrow('offline');
    expect(links.authenticate(key)).not.toBeNull();
  }));
  it('serializes concurrent exchange and cancellation across the actual durable write', () => fixture(async (links, repo) => {
    const key = token(), link = links.begin('iPad', nativeTokenHash(key)); await links.approve(link.userCode, principal);
    const save = repo.saveLinkedDevice.bind(repo); let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(repo, 'saveLinkedDevice').mockImplementation(async device => { await gate; await save(device); });
    const first = links.exchange(link.requestId, key), duplicate = links.exchange(link.requestId, key), cancel = links.cancel(link.requestId, key);
    expect(links.authenticate(key)).toBeNull(); release();
    expect(await first).toEqual(await duplicate); await cancel;
    expect(links.authenticate(key)).toBeNull(); expect(await repo.loadLinkedDevices()).toEqual([]);
  }));
  it('recovers a committed-but-unacknowledged save without creating a grant that revives after revocation', () => fixture(async (links, repo, clock) => {
    const key = token(), link = links.begin('Mac', nativeTokenHash(key)); await links.approve(link.userCode, principal);
    const save = repo.saveLinkedDevice.bind(repo);
    vi.spyOn(repo, 'saveLinkedDevice').mockImplementationOnce(async device => { await save(device); throw new Error('reply lost'); });
    await expect(links.exchange(link.requestId, key)).rejects.toThrow('reply lost');
    const first = (await repo.loadLinkedDevices())[0];
    await links.exchange(link.requestId, key);
    expect(await repo.loadLinkedDevices()).toHaveLength(1); expect(links.list(principal.ownerId)[0].id).toBe(first.id);
    await links.revoke(first.id, principal.ownerId);
    const restarted = new DeviceLinks(repo, () => clock.now); await restarted.initialize();
    expect(restarted.authenticate(key)).toBeNull(); expect(await repo.loadLinkedDevices()).toEqual([]);
  }));
  it('cancels a durable grant even if its code expired during the exchange write', () => fixture(async (links, repo, clock) => {
    const key = token(), link = links.begin('Mac', nativeTokenHash(key)); await links.approve(link.userCode, principal);
    clock.now += LINK_TTL_MS - 1;
    const save = repo.saveLinkedDevice.bind(repo); let release!: () => void, entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(repo, 'saveLinkedDevice').mockImplementation(async device => { entered(); await gate; await save(device); });
    const exchange = links.exchange(link.requestId, key); await started;
    const cancel = links.cancel(link.requestId, key); clock.now += 100; release();
    await exchange; await cancel;
    expect(links.authenticate(key)).toBeNull(); expect(await repo.loadLinkedDevices()).toEqual([]);
  }));
  it('cancels uncertain writes after request expiry and retries a committed-but-unacknowledged cancellation', () => fixture(async (links, repo, clock) => {
    const key = token(), link = links.begin('Mac', nativeTokenHash(key)); await links.approve(link.userCode, principal);
    const save = repo.saveLinkedDevice.bind(repo);
    vi.spyOn(repo, 'saveLinkedDevice').mockImplementationOnce(async device => { await save(device); throw new Error('reply lost'); });
    await expect(links.exchange(link.requestId, key)).rejects.toThrow(); clock.now += LINK_TTL_MS;
    await links.cancel(link.requestId, key); expect(await repo.loadLinkedDevices()).toEqual([]);
    const next = links.begin('Mac', nativeTokenHash(key)); await links.approve(next.userCode, principal); await links.exchange(next.requestId, key);
    const remove = repo.deleteLinkedDevice.bind(repo);
    vi.spyOn(repo, 'deleteLinkedDevice').mockImplementationOnce(async id => { await remove(id); throw new Error('delete reply lost'); });
    await expect(links.cancel(next.requestId, key)).rejects.toThrow('delete reply lost');
    await links.cancel(next.requestId, key); expect(links.authenticate(key)).toBeNull(); expect(await repo.loadLinkedDevices()).toEqual([]);
  }));
  it('expires device sessions independently of browser credentials', () => fixture(async (links, repo, clock) => {
    const key = token(), link = links.begin('Mac', nativeTokenHash(key)); await links.approve(link.userCode, principal); await links.exchange(link.requestId, key);
    clock.now += DEVICE_TTL_MS; expect(links.authenticate(key)).toBeNull(); expect(links.list(principal.ownerId)).toEqual([]);
    const restarted = new DeviceLinks(repo, () => clock.now); await restarted.initialize(); expect(await repo.loadLinkedDevices()).toEqual([]);
  }));
  it('enforces browser identity/origin and a separate native bearer through real HTTP routes', () => fixture(async (links, repo) => {
    const app = Fastify(); await app.register(cookie);
    const auth = new AuthService('test-secret'); const profiles = new AvatarProfiles(repo, new StateManager('factory25d')); await profiles.initialize();
    registerDeviceLinkRoutes(app, auth, links, profiles);
    try {
      const key = token(); const created = await app.inject({ method: 'POST', url: '/api/auth/devices/link', payload: { deviceName: 'Mac', tokenHash: nativeTokenHash(key) } });
      expect(created.statusCode).toBe(200); const link = created.json();
      const cookies = { af_session: auth.issueBrowserSession(principal) };
      const headers = { host: 'factory.test', origin: 'https://factory.test', 'x-factory-owner': principal.ownerId };
      const approve = (extra: object) => app.inject({ method: 'POST', url: '/api/auth/devices/approve', payload: { code: link.userCode }, ...extra });
      expect((await approve({ headers })).statusCode).toBe(401);
      expect((await approve({ cookies, headers: { ...headers, origin: 'https://evil.test' } })).statusCode).toBe(403);
      expect((await approve({ cookies, headers: { ...headers, 'x-factory-owner': other.ownerId } })).statusCode).toBe(409);
      expect((await approve({ cookies, headers })).statusCode).toBe(200);
      const exchange = await app.inject({ method: 'POST', url: '/api/auth/devices/link/exchange', headers: { authorization: `Bearer ${key}` }, payload: { requestId: link.requestId } });
      expect(exchange.statusCode).toBe(200); expect(exchange.json()).toMatchObject({ ownerId: principal.ownerId });
      expect(exchange.headers['set-cookie']).toBeUndefined(); expect(exchange.body).not.toContain(key);
      expect((await app.inject({ url: '/api/auth/native/session', cookies })).statusCode).toBe(401);
      const session = await app.inject({ url: '/api/auth/native/session', headers: { authorization: `Bearer ${key}` } });
      expect(session.statusCode).toBe(200); expect(session.json()).toMatchObject({ authenticated: true, ownerId: principal.ownerId, profile: { saved: false } });
      expect(session.headers['cache-control']).toBe('no-store');
      expect((await app.inject({ method: 'POST', url: '/api/auth/native/logout', headers: { authorization: `Bearer ${key}` } })).statusCode).toBe(200);
      expect((await app.inject({ url: '/api/auth/native/session', headers: { authorization: `Bearer ${key}` } })).statusCode).toBe(401);
    } finally { await app.close(); }
  }));
});
