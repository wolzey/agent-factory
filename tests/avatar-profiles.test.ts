import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../server/auth.js';
import { AvatarProfiles, type AvatarProfileRepository } from '../server/avatar-profiles.js';
import { registerAvatarRoutes } from '../server/routes/avatar.js';
import { registerHookRoutes } from '../server/routes/hooks.js';
import { StateManager, type StateNotification } from '../server/state.js';
import { BroadcastManager } from '../server/ws/broadcast.js';
import { LibSqlWorldRepository } from '../server/persistence/libsql-world-repository.js';
import { DEFAULT_AVATAR } from '../shared/constants.js';
import { parseAvatarConfig } from '../shared/avatar-customization.js';
import type { AvatarConfig, HookPayload } from '../shared/types.js';

const blue = { ...DEFAULT_AVATAR, shirtColor: '#2468ac', hairStyle: 4 };
const red = { ...blue, shirtColor: '#ed6644' };
const device = `afd1_${'A'.repeat(43)}`, secondDevice = `afd1_${'B'.repeat(43)}`;
const auth = new AuthService('avatar-test-only-secret');
const alice = auth.authenticateDevice(`Bearer ${device}`), bob = auth.authenticateDevice(`Bearer ${secondDevice}`);
if (alice.kind !== 'authenticated' || bob.kind !== 'authenticated') throw new Error('Fixture authentication failed');
const owner = alice.ownerId, otherOwner = bob.ownerId;
const browserCookie = auth.issueBrowserSession({ ownerId: owner, username: 'alice' });
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks(); });

function hook(session_id = 'one', ownerId: string | undefined = owner, avatar: AvatarConfig = blue): HookPayload {
  return { hook_event_name: 'SessionStart', session_id, ownerId, username: 'alice', cwd: '/fixture', avatar };
}
function memoryRepository(): AvatarProfileRepository {
  return { loadAvatarProfiles: async () => [], saveAvatarProfile: vi.fn(async () => {}) };
}
async function fixture(repository = memoryRepository()) {
  const state = new StateManager('factory25d');
  state.handleHookEvent(hook()); state.handleHookEvent(hook('two')); state.handleHookEvent(hook('other', otherOwner));
  const profiles = new AvatarProfiles(repository, state); await profiles.initialize();
  const app = Fastify(); await app.register(cookie);
  registerAvatarRoutes(app, auth, profiles);
  registerHookRoutes(app, state, new BroadcastManager(), { title: 'Test' }, auth, () => ({ healthy: true, lastSavedRevision: 0, lastError: null }));
  return { app, state, profiles, repository };
}
const request = { method: 'PUT' as const, url: '/api/avatar', headers: { origin: 'http://factory.test', host: 'factory.test', 'x-avatar-owner': owner }, cookies: { af_session: browserCookie }, payload: { avatar: red } };

describe('avatar editing access and validation', () => {
  it('requires a browser identity and rejects cross-site or originless saves', async () => {
    const { app, repository } = await fixture();
    expect((await app.inject({ method: 'GET', url: '/api/avatar' })).statusCode).toBe(401);
    expect((await app.inject({ ...request, cookies: {} })).statusCode).toBe(401);
    expect((await app.inject({ ...request, headers: { origin: 'https://other.example' } })).statusCode).toBe(403);
    expect((await app.inject({ ...request, headers: {} })).statusCode).toBe(403);
    expect(repository.saveAvatarProfile).not.toHaveBeenCalled(); await app.close();
  });
  it('loads the current owner appearance without exposing anyone else’s profile', async () => {
    const { app } = await fixture();
    const response = await app.inject({ method: 'GET', url: '/api/avatar?ownerId=' + otherOwner, cookies: request.cookies });
    expect(response.json()).toEqual({ avatar: blue, saved: false });
    expect(response.headers['cache-control']).toBe('no-store'); await app.close();
  });
  it('rejects stale editor requests after a browser switches identities', async () => {
    const { app, repository, state } = await fixture();
    const cookies = { af_session: auth.issueBrowserSession({ ownerId: otherOwner, username: 'bob' }) };
    expect((await app.inject({ ...request, cookies })).statusCode).toBe(409);
    expect((await app.inject({ method: 'GET', url: '/api/avatar', cookies, headers: { 'x-avatar-owner': owner } })).statusCode).toBe(409);
    expect((await app.inject({ ...request, headers: { origin: 'http://factory.test', host: 'factory.test' } })).statusCode).toBe(409);
    expect(repository.saveAvatarProfile).not.toHaveBeenCalled(); expect(state.get('other')?.avatar).toEqual(blue); await app.close();
  });
  it('updates all and only owned agents while preserving their activity and positions', async () => {
    const { app, state } = await fixture();
    const before = structuredClone(state.get('one'))!;
    const changes: StateNotification[] = []; state.onStateChange(change => changes.push(change));
    const response = await app.inject({ ...request, payload: { avatar: red, ownerId: otherOwner } });
    expect(response.statusCode).toBe(200);
    expect(state.get('one')).toEqual({ ...before, avatar: red });
    expect(state.get('two')?.avatar).toEqual(red); expect(state.get('other')?.avatar).toEqual(blue);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ type: 'delta', immediatePersistence: true, delta: { changes: [{ kind: 'agent_upsert' }, { kind: 'agent_upsert' }] } });
    await app.close();
  });
  it('rejects malformed appearances and extra appearance fields without saving', async () => {
    const { app, repository } = await fixture();
    for (const avatar of [null, [], { ...red, hairStyle: -1 }, { ...red, shirtDesign: 12 }, { ...red, color: 'url(x)' }, { ...red, skinTone: '#fff' }, { ...red, ownerId: otherOwner }]) {
      expect((await app.inject({ ...request, payload: { avatar } })).statusCode).toBe(400);
    }
    expect(repository.saveAvatarProfile).not.toHaveBeenCalled(); await app.close();
  });
  it('keeps the old appearance and allows retry when durable saving fails', async () => {
    const { app, state, repository } = await fixture();
    vi.mocked(repository.saveAvatarProfile).mockRejectedValueOnce(new Error('Fixture write failure'));
    expect((await app.inject(request)).statusCode).toBe(503);
    expect(state.get('one')?.avatar).toEqual(blue);
    expect((await app.inject(request)).statusCode).toBe(200);
    expect(state.get('one')?.avatar).toEqual(red); await app.close();
  });
});

describe('durable avatar preferences and terminal compatibility', () => {
  it('keeps legacy appearance fields when validating a saved look', () => {
    const legacy = { ...DEFAULT_AVATAR, hat: 'old hat', trail: 'spark', graphicDeath: false };
    expect(parseAvatarConfig(legacy)).toEqual(legacy);
  });
  it('survives old terminal hooks, resumed sessions and new sessions without crossing owners', async () => {
    const { app, state, profiles } = await fixture(); await profiles.save(owner, red);
    for (const hook_event_name of ['PreToolUse', 'PostToolUse', 'SessionStart']) {
      const response = await app.inject({ method: 'POST', url: '/api/hooks', headers: { authorization: `Bearer ${device}` }, payload: { ...hook(), hook_event_name, tool_name: 'Read' } });
      expect(response.statusCode).toBe(200); expect(state.get('one')?.avatar).toEqual(red);
    }
    state.handleHookEvent(hook('new'));
    expect(state.get('new')?.avatar).toEqual(red);
    expect(state.get('other')?.avatar).toEqual(blue);
    // An unauthenticated hook cannot spoof the owner or replace an owned session.
    expect((await app.inject({ method: 'POST', url: '/api/hooks', payload: hook() })).statusCode).toBe(403);
    state.handleHookEvent({ ...hook('legacy'), ownerId: undefined });
    expect(state.get('legacy')?.avatar).toEqual(blue); await app.close();
  });
  it('saves without an active session and restores the preference after a database restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-avatar-')); dirs.push(dir);
    const url = `file:${join(dir, 'world.db')}`;
    let repository = new LibSqlWorldRepository({ url, production: false }); await repository.initialize();
    const state = new StateManager('factory25d');
    const profiles = new AvatarProfiles(repository, state); await profiles.initialize();
    await profiles.save(owner, red); await repository.save(state.getSnapshot()); await repository.close();
    repository = new LibSqlWorldRepository({ url, production: false }); await repository.initialize();
    const restored = new StateManager('factory25d'); restored.restoreWorld((await repository.load())!);
    const loaded = new AvatarProfiles(repository, restored); await loaded.initialize();
    expect(loaded.get(owner)).toEqual({ avatar: red, saved: true });
    restored.handleHookEvent(hook('after-restart'));
    expect(restored.get('after-restart')?.avatar).toEqual(red); await repository.close();
  });
  it('reconciles a saved profile with an older world snapshot at startup', async () => {
    const { state, app } = await fixture();
    const profiles = new AvatarProfiles({ loadAvatarProfiles: async () => [{ ownerId: owner, avatar: red }], saveAvatarProfile: async () => {} }, state);
    await profiles.initialize(); expect(state.get('one')?.avatar).toEqual(red); expect(state.get('other')?.avatar).toEqual(blue); await app.close();
  });
  it('serializes concurrent saves so the latest accepted appearance stays durable', async () => {
    const repository = memoryRepository(); let finish!: () => void;
    vi.mocked(repository.saveAvatarProfile).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const { profiles, state, app } = await fixture(repository);
    const first = profiles.save(owner, red), last = profiles.save(owner, blue);
    await vi.waitFor(() => expect(finish).toBeDefined());
    expect(repository.saveAvatarProfile).toHaveBeenCalledTimes(1); finish();
    await Promise.all([first, last]);
    expect(repository.saveAvatarProfile).toHaveBeenLastCalledWith(owner, blue);
    expect(profiles.get(owner).avatar).toEqual(blue); expect(state.get('one')?.avatar).toEqual(blue); await app.close();
  });
});
