import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import agentFactoryPiExtension from '../extensions/agent-factory/index';

/**
 * The pi extension posts to the same /api/hooks endpoint as the shell hook, so
 * it needs the same redaction. The server drops raw fields at ingest, but by
 * then they have already crossed the network, which is what this prevents.
 */
type Handler = (event: Record<string, unknown>, ctx?: Record<string, unknown>) => Promise<void>;

const posted: Record<string, unknown>[] = [];
const postedHeaders: Record<string, string>[] = [];
let testConfigDir: string;

function loadExtension(): Record<string, Handler> {
  const handlers: Record<string, Handler> = {};
  const pi = {
    on: (name: string, handler: Handler) => { handlers[name] = handler; },
    registerCommand: () => {},
  };
  agentFactoryPiExtension(pi as never);
  return handlers;
}

beforeEach(() => {
  posted.length = 0;
  postedHeaders.length = 0;
  testConfigDir = mkdtempSync(join(tmpdir(), 'af-pi-identity-'));
  process.env.AGENT_FACTORY_CONFIG_DIR = testConfigDir;
  vi.stubGlobal('fetch', async (_url: string, init: { body: string; headers: Record<string, string> }) => {
    posted.push(JSON.parse(init.body));
    postedHeaders.push(init.headers);
    return { ok: true } as Response;
  });
});

afterEach(() => {
  delete process.env.AGENT_FACTORY_CONFIG_DIR;
  rmSync(testConfigDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('pi extension redaction', () => {
  it('creates and reuses an owner-only installation identity', async () => {
    const handlers = loadExtension();
    await handlers.session_start({ reason: 'new' }, { cwd: '/work' });
    await handlers.agent_end({}, { cwd: '/work' });

    const firstAuthorization = postedHeaders[0].Authorization;
    expect(firstAuthorization).toMatch(/^Bearer afd1_[A-Za-z0-9_-]{43}$/);
    expect(postedHeaders[1].Authorization).toBe(firstAuthorization);

    const identityPath = join(testConfigDir, 'identity.json');
    const identity = JSON.parse(readFileSync(identityPath, 'utf8')) as { version: number; secret: string };
    expect(identity.version).toBe(1);
    expect(`Bearer ${identity.secret}`).toBe(firstAuthorization);
    expect(statSync(identityPath).mode & 0o777).toBe(0o600);
  });

  it('does not send prompt text, but keeps /rename', async () => {
    const handlers = loadExtension();

    await handlers.input({ text: 'rotate the key AKIAIOSFODNN7EXAMPLE' }, { cwd: '/work' });
    expect(posted).toHaveLength(1);
    expect(posted[0]).not.toHaveProperty('user_prompt');
    expect(JSON.stringify(posted[0])).not.toContain('AKIAIOSFODNN7EXAMPLE');

    await handlers.input({ text: '/rename payments refactor' }, { cwd: '/work' });
    expect(posted[1].session_name).toBe('payments refactor');
    expect(posted[1]).not.toHaveProperty('user_prompt');
  });

  it('does not send tool arguments on either tool event', async () => {
    const handlers = loadExtension();
    const args = { command: 'psql -c "SELECT email FROM users"', content: 'sk-live-secret' };

    await handlers.tool_execution_start({ toolName: 'Bash', args }, { cwd: '/work' });
    await handlers.tool_execution_end({ toolName: 'Bash', args, isError: false }, { cwd: '/work' });

    for (const body of posted) {
      expect(body).not.toHaveProperty('tool_input');
      expect(JSON.stringify(body)).not.toContain('SELECT email');
      expect(JSON.stringify(body)).not.toContain('sk-live-secret');
      expect(body.tool_name).toBe('Bash');
    }
  });

  it('derives git_action on tool completion without the command', async () => {
    const handlers = loadExtension();

    await handlers.tool_execution_end(
      { toolName: 'Bash', args: { command: 'git commit -m "internal notes"' }, isError: false },
      { cwd: '/work' },
    );
    expect(posted[0].git_action).toBe('commit');
    expect(JSON.stringify(posted[0])).not.toContain('internal notes');

    await handlers.tool_execution_end(
      { toolName: 'Read', args: { command: 'git commit -m x' }, isError: false },
      { cwd: '/work' },
    );
    expect(posted[1]).not.toHaveProperty('git_action');
  });

  it('sends a worktree name only for worktree tools', async () => {
    const handlers = loadExtension();

    await handlers.tool_execution_start(
      { toolName: 'EnterWorktree', args: { name: 'claude/payments' } },
      { cwd: '/work' },
    );
    expect(posted[0].session_name).toBe('claude/payments');

    await handlers.tool_execution_start(
      { toolName: 'Write', args: { name: 'internal-codename' } },
      { cwd: '/work' },
    );
    expect(posted[1]).not.toHaveProperty('session_name');
    expect(JSON.stringify(posted[1])).not.toContain('codename');
  });
});
