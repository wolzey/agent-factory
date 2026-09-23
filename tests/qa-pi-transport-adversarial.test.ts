import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import agentFactoryPiExtension, { hookPostsSettled } from '../extensions/agent-factory/index';

let directory: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'qa-pi-transport-')); vi.stubEnv('AGENT_FACTORY_CONFIG_DIR', directory); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); rmSync(directory, { recursive: true, force: true }); });
function handler(serverUrl: string) {
  writeFileSync(join(directory, 'config.json'), JSON.stringify({ serverUrl, username: 'QA' }));
  const handlers: Record<string, (event: unknown, ctx: unknown) => Promise<void>> = {};
  agentFactoryPiExtension({ on: (event: string, fn: typeof handlers[string]) => { handlers[event] = fn; }, registerCommand: () => {} } as never);
  // Hook posts run in the background, so wait for the request itself, not just the handler.
  return async () => { await handlers.session_start({ reason: 'new' }, { cwd: '/qa-fixture' }); await hookPostsSettled(); };
}
it.each(['http://factory.example', 'http://localhost.evil', 'http://127.0.0.1.evil', 'ftp://localhost', 'https://user:secret@factory.example', 'https://factory.example?x=1', 'https://factory.example#fragment', 'https://'])('sends no credential to unsafe Pi address %s', async address => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await expect(handler(address)()).resolves.toBeUndefined(); expect(fetch).not.toHaveBeenCalled();
});
it.each(['https://factory.example', 'http://localhost:4242', 'http://127.1.2.3:4242', 'http://[::1]:4242'])('preserves supported Pi transport %s and refuses redirects', async address => {
  const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal('fetch', fetch);
  await handler(address)();
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: 'error', headers: { Authorization: expect.stringMatching(/^Bearer afd1_[A-Za-z0-9_-]{43}$/) } });
});
it('does not follow a real local Pi POST redirect', async () => {
  let forwarded = false;
  let received = false;
  const target = createServer((_request, response) => { forwarded = true; response.end('{}'); });
  const listen = (server: Server) => new Promise<string>(resolve => { server.listen(0, '127.0.0.1', () => { const address = server.address(); if (!address || typeof address === 'string') throw new Error('fixture'); resolve(`http://127.0.0.1:${address.port}`); }); });
  const targetURL = await listen(target);
  const source = createServer((request, response) => { received = !!request.headers.authorization; response.writeHead(307, { location: targetURL }); response.end(); });
  try { await handler(await listen(source))(); expect(received).toBe(true); expect(forwarded).toBe(false); }
  finally { source.closeAllConnections(); target.closeAllConnections(); await Promise.all([source, target].map(server => new Promise<void>(resolve => server.close(() => resolve())))); }
});
