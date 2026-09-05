import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { WebSocket } from '@fastify/websocket';
import { watchPresenceConnection } from '../server/ws/presence-heartbeat.js';
import Fastify from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TeamRoster, type TeamRepository } from '../server/team-roster.js';
import { LibSqlWorldRepository } from '../server/persistence/libsql-world-repository.js';
import { StateManager } from '../server/state.js';
import { registerTeamRoutes } from '../server/routes/team.js';
import { DEFAULT_AVATAR } from '../shared/constants.js';
import { lastSeenLabel, type StoredTeamMember } from '../shared/team.js';
import type { WorldAgent } from '../shared/types.js';

function agent(sessionId: string, ownerId = 'alice', name = 'Alice'): WorldAgent {
  const state = new StateManager('factory25d', () => 1_000_000);
  state.handleHookEvent({ hook_event_name: 'SessionStart', session_id: sessionId, username: name, ownerId, cwd: '/private/task', avatar: DEFAULT_AVATAR });
  return state.get(sessionId)!;
}
function memory(): TeamRepository {
  const members = new Map<string, StoredTeamMember>();
  return { loadTeamMembers: async () => structuredClone([...members.values()]),
    saveTeamMembers: async batch => { for (const member of batch) members.set(member.id, structuredClone(member)); } };
}

describe('front-counter team presence', () => {
  it('groups multiple sessions per owner but keeps different owners with matching names distinct', async () => {
    const agents = [agent('one'), agent('two'), agent('three', 'bob')];
    const roster = new TeamRoster(memory(), () => agents, () => undefined); await roster.initialize();
    expect(roster.snapshot().members.map(member => [member.id, member.agents, member.online])).toEqual([['alice', 2, true], ['bob', 1, true]]);
  });
  it('retains an offline member and the actual last event time without fabricating old visits', async () => {
    let agents = [agent('one')];
    const repository = memory(), roster = new TeamRoster(repository, () => agents, () => undefined); await roster.initialize();
    agents = []; const member = roster.snapshot().members[0];
    expect(member).toMatchObject({ name: 'Alice', online: false, lastSeen: 1_000_000, agents: 0 });
    const restarted = new TeamRoster(repository, () => [], () => undefined); await restarted.initialize();
    expect(restarted.snapshot().members[0]).toEqual(member);
  });
  it('keeps a person online until their last authenticated browser closes', async () => {
    let now = 10_000; const roster = new TeamRoster(memory(), () => [], () => undefined, () => now); await roster.initialize();
    const first = {}, second = {};
    roster.connect(first, { ownerId: 'alice', username: 'Alice' }); roster.connect(second, { ownerId: 'alice', username: 'Alice' });
    now = 20_000; roster.disconnect(first); expect(roster.snapshot().members[0].online).toBe(true);
    now = 30_000; roster.disconnect(second); expect(roster.snapshot().members[0]).toMatchObject({ online: false, lastSeen: 30_000 });
    now = 40_000; roster.disconnect(second); expect(roster.snapshot().members[0].lastSeen).toBe(30_000);
  });
  it('does not let old world updates roll back a more recent browser visit', async () => {
    const roster = new TeamRoster(memory(), () => [], () => undefined, () => 2_000_000); await roster.initialize();
    roster.connect({}, { ownerId: 'alice', username: 'Alice' }); roster.observe(agent('old'));
    expect(roster.snapshot().members[0].lastSeen).toBe(2_000_000);
  });
  it('uses saved appearance for an offline member without changing presence', async () => {
    let agents = [agent('one')]; let saved = DEFAULT_AVATAR;
    const roster = new TeamRoster(memory(), () => agents, () => saved); await roster.initialize(); agents = [];
    saved = { ...DEFAULT_AVATAR, shirtColor: '#ff6633' };
    expect(roster.snapshot().members[0]).toMatchObject({ online: false, avatar: saved });
  });
  it('retries failed history writes and preserves newer visits that arrive in flight', async () => {
    const repository = memory(); let reject!: (error: Error) => void;
    repository.saveTeamMembers = () => new Promise((_resolve, failure) => { reject = failure; });
    const roster = new TeamRoster(repository, () => [], () => undefined, () => 3_000_000); await roster.initialize();
    roster.observe(agent('old')); const pending = roster.flush(); await Promise.resolve();
    roster.connect({}, { ownerId: 'alice', username: 'Alice' }); reject(new Error('offline')); await pending;
    expect(roster.snapshot().historyAvailable).toBe(false);
    let written: StoredTeamMember[] = []; repository.saveTeamMembers = async rows => { written = rows; };
    await roster.flush(); expect(written[0].lastSeen).toBe(3_000_000); expect(roster.snapshot().historyAvailable).toBe(true);
  });
  it('persists history in a separate table across database restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-team-')); const url = `file:${join(dir, 'world.db')}`;
    let repository = new LibSqlWorldRepository({ url, production: false });
    try {
      await repository.initialize(); const roster = new TeamRoster(repository, () => [agent('one')], () => undefined); await roster.initialize();
      await repository.close(); repository = new LibSqlWorldRepository({ url, production: false }); await repository.initialize();
      const restored = new TeamRoster(repository, () => [], () => undefined); await restored.initialize();
      expect(restored.snapshot().members[0]).toMatchObject({ name: 'Alice', online: false, lastSeen: 1_000_000 });
      expect(await repository.load()).toBeNull();
    } finally { await repository.close(); rmSync(dir, { recursive: true, force: true }); }
  });
  it('serves only public presence fields, never task paths, and disables caching', async () => {
    const roster = new TeamRoster(memory(), () => [agent('one')], () => undefined); await roster.initialize();
    const app = Fastify(); registerTeamRoutes(app, roster);
    const response = await app.inject({ method: 'GET', url: '/api/team' });
    expect(response.statusCode).toBe(200); expect(response.headers['cache-control']).toBe('no-store');
    expect(Object.keys(response.json().members[0]).sort()).toEqual(['agents', 'avatar', 'id', 'lastSeen', 'name', 'online']);
    expect(response.body).not.toContain('/private/task'); await app.close();
  });
  it('formats last-seen dates with sensible minute, hour and day boundaries', () => {
    expect(lastSeenLabel(120_000, 100_000)).toBe('last here just now');
    expect(lastSeenLabel(0, 60_000)).toBe('last here 1m ago');
    expect(lastSeenLabel(0, 3_600_000)).toBe('last here 1h ago');
    expect(lastSeenLabel(0, 86_400_000)).toBe('last here 1d ago');
  });
  it('expires a disconnected browser and releases the heartbeat on close', () => {
    vi.useFakeTimers();
    try {
      const socket = Object.assign(new EventEmitter(), { ping: vi.fn(), terminate: vi.fn() });
      const stop = watchPresenceConnection(socket as unknown as WebSocket);
      vi.advanceTimersByTime(30_000); expect(socket.ping).toHaveBeenCalledTimes(1);
      socket.emit('pong'); vi.advanceTimersByTime(30_000); expect(socket.terminate).not.toHaveBeenCalled();
      vi.advanceTimersByTime(30_000); expect(socket.terminate).toHaveBeenCalledOnce();
      socket.emit('close'); expect(vi.getTimerCount()).toBe(0); stop();
    } finally { vi.useRealTimers(); }
  });
});
