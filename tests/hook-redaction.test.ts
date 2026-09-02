import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const HOOK = resolve(__dirname, '../cli/internal/hooks/agent-factory-hook.sh');

/**
 * Four separate installers ship a copy of this hook, and they drifted: the CLI
 * embeds one, `pnpm install-hooks` copies another, and install.sh and
 * team-install.sh each inline their own inside a quoted heredoc. A fix applied
 * to one of them is not a fix.
 */
const HOOK_SOURCES: Array<{ name: string; path: string; extract?: boolean }> = [
  { name: 'cli (embedded)', path: '../cli/internal/hooks/agent-factory-hook.sh' },
  { name: 'hooks/ (pnpm install-hooks)', path: '../hooks/agent-factory-hook.sh' },
  { name: 'install.sh (inline)', path: '../install.sh', extract: true },
  { name: 'hooks/team-install.sh (inline)', path: '../hooks/team-install.sh', extract: true },
];

/** Pull the hook out of an installer's quoted heredoc. */
function hookScriptFrom(source: { path: string; extract?: boolean }): string {
  const text = readFileSync(resolve(__dirname, source.path), 'utf8');
  if (!source.extract) return text;
  const match = text.match(/<< 'HOOKEOF'\n([\s\S]*?)\nHOOKEOF/);
  if (!match) throw new Error(`no heredoc hook found in ${source.path}`);
  return match[1];
}

/** The jq filter itself, which must not differ between copies. */
function payloadFilter(script: string): string {
  const start = script.indexOf('PAYLOAD=$(echo "$INPUT" | jq -c');
  const end = script.indexOf('exit 0\nfi\n', start);
  if (start < 0 || end < 0) throw new Error('no payload filter found');
  return script.slice(start, end);
}

/**
 * The hook runs on every tool call in every session, including sessions working
 * in private repositories and against production databases. It must send an
 * allowlist and never the raw payload Claude/Codex put on stdin, because that
 * payload carries prompt text, whole Bash command lines, the file contents given
 * to Write/Edit, and tool output on PostToolUse.
 */
function runHook(input: Record<string, unknown>, hookPath: string = HOOK): Record<string, unknown> {
  const home = mkdtempSync(join(tmpdir(), 'af-hook-'));
  const binDir = join(home, 'bin');
  mkdirSync(binDir, { recursive: true });
  mkdirSync(join(home, '.config', 'agent-factory'), { recursive: true });
  writeFileSync(
    join(home, '.config', 'agent-factory', 'config.json'),
    JSON.stringify({ serverUrl: 'https://factory.example', username: 'tester', avatar: {} }),
  );

  // Stand in for curl so the payload is captured instead of sent.
  const capture = join(home, 'payload.json');
  const fakeCurl = `#!/bin/bash
prev=""
for arg in "$@"; do
  if [ "$prev" = "-d" ]; then printf '%s' "$arg" > ${JSON.stringify(capture)}; fi
  prev="$arg"
done
exit 0
`;
  writeFileSync(join(binDir, 'curl'), fakeCurl);
  chmodSync(join(binDir, 'curl'), 0o755);

  execFileSync('bash', [hookPath], {
    input: JSON.stringify(input),
    env: { ...process.env, HOME: home, PATH: `${binDir}:${process.env.PATH}` },
  });

  // The hook backgrounds the request, so give it a moment to land.
  const deadline = Date.now() + 5000;
  for (;;) {
    try {
      return JSON.parse(readFileSync(capture, 'utf8')) as Record<string, unknown>;
    } catch {
      if (Date.now() > deadline) throw new Error('hook never posted a payload');
      execFileSync('sleep', ['0.05']);
    }
  }
}

/**
 * The allowlist is asserted as an exact key set rather than a blacklist of known
 * bad fields. A blacklist passes when a field nobody thought of starts arriving.
 */
function expectKeys(payload: Record<string, unknown>, expected: string[]): void {
  expect(Object.keys(payload).sort()).toEqual([...expected].sort());
}

const BASE_KEYS = ['session_id', 'hook_event_name', 'cwd', 'username', 'avatar'];

describe('every installer ships the same redaction', () => {
  const canonical = payloadFilter(hookScriptFrom(HOOK_SOURCES[0]));

  it.each(HOOK_SOURCES.slice(1))('$name matches the CLI copy', source => {
    expect(payloadFilter(hookScriptFrom(source))).toBe(canonical);
  });

  it.each(HOOK_SOURCES)('$name does not forward the raw payload', source => {
    const script = hookScriptFrom(source);
    // The shape this replaced, and the fallback that reinstated it on any jq error.
    expect(script).not.toContain('. + {username: $username, avatar: $avatar}');
    expect(script).not.toContain('PAYLOAD="$INPUT"');
  });

  it.each(HOOK_SOURCES)('$name redacts when actually run', source => {
    const dir = mkdtempSync(join(tmpdir(), 'af-variant-'));
    const scriptPath = join(dir, 'hook.sh');
    writeFileSync(scriptPath, hookScriptFrom(source));
    chmodSync(scriptPath, 0o755);

    const payload = runHook(
      {
        session_id: 's1',
        hook_event_name: 'PostToolUse',
        cwd: '/work',
        tool_name: 'Bash',
        tool_input: { command: 'git commit -m "SELECT email FROM users"' },
        tool_response: { output: 'DB_PASSWORD=hunter2' },
        prompt: 'AKIAIOSFODNN7EXAMPLE',
      },
      scriptPath,
    );

    expect(payload).not.toHaveProperty('tool_input');
    expect(payload).not.toHaveProperty('tool_response');
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('SELECT email');
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('AKIAIOSFODNN7EXAMPLE');
    // and the feature that reads the command still works
    expect(payload.git_action).toBe('commit');
  });
});

describe('hook payload redaction', () => {
  beforeAll(() => {
    // jq is a hard dependency of the hook itself, not just of this test.
    execFileSync('jq', ['--version']);
  });

  it('drops the Bash command line and never forwards tool_input', () => {
    const payload = runHook({
      session_id: 's1',
      hook_event_name: 'PreToolUse',
      cwd: '/work/private-repo',
      tool_name: 'Bash',
      tool_input: { command: 'psql -c "SELECT email FROM users"', description: 'query prod' },
      transcript_path: '/home/tester/.claude/transcript.jsonl',
    });

    expectKeys(payload, [...BASE_KEYS, 'tool_name']);
    expect(JSON.stringify(payload)).not.toContain('SELECT email');
    // What the avatar actually needs still arrives.
    expect(payload.session_id).toBe('s1');
    expect(payload.tool_name).toBe('Bash');
    expect(payload.cwd).toBe('/work/private-repo');
    expect(payload.username).toBe('tester');
  });

  it('drops file contents written by Write and Edit', () => {
    const payload = runHook({
      session_id: 's1',
      hook_event_name: 'PreToolUse',
      cwd: '/work',
      tool_name: 'Write',
      tool_input: { file_path: '/work/config.ts', content: 'export const TOKEN = "sk-live-secret"' },
    });

    expectKeys(payload, [...BASE_KEYS, 'tool_name']);
    expect(JSON.stringify(payload)).not.toContain('sk-live-secret');
    expect(JSON.stringify(payload)).not.toContain('config.ts');
  });

  it('drops tool output on PostToolUse', () => {
    const payload = runHook({
      session_id: 's1',
      hook_event_name: 'PostToolUse',
      cwd: '/work',
      tool_name: 'Read',
      tool_response: { output: 'DB_PASSWORD=hunter2' },
    });

    expectKeys(payload, [...BASE_KEYS, 'tool_name']);
    expect(JSON.stringify(payload)).not.toContain('hunter2');
  });

  it('drops prompt text but keeps the /rename name', () => {
    const renamed = runHook({
      session_id: 's1',
      hook_event_name: 'UserPromptSubmit',
      cwd: '/work',
      prompt: '/rename   payments refactor  ',
    });
    expect(renamed.session_name).toBe('payments refactor');

    const ordinary = runHook({
      session_id: 's1',
      hook_event_name: 'UserPromptSubmit',
      cwd: '/work',
      prompt: 'rotate the key AKIAIOSFODNN7EXAMPLE for me',
    });
    expect(ordinary).not.toHaveProperty('session_name');
    expect(JSON.stringify(ordinary)).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('drops user_prompt, the other name Claude uses for prompt text', () => {
    const payload = runHook({
      session_id: 's1',
      hook_event_name: 'UserPromptSubmit',
      cwd: '/work',
      user_prompt: 'the password is hunter2',
    });
    expectKeys(payload, BASE_KEYS);
    expect(JSON.stringify(payload)).not.toContain('hunter2');
  });

  it('matches the old server regex on a multiline rename', () => {
    // The regex this replaced was unanchored at the end, so `/rename foo\nbar`
    // named the session `foo`. An anchored jq regex would silently drop it.
    const payload = runHook({
      session_id: 's1',
      hook_event_name: 'UserPromptSubmit',
      cwd: '/work',
      prompt: '/rename foo\nbar',
    });
    expect(payload.session_name).toBe('foo');
  });

  it('lets an explicit rename win over a worktree name', () => {
    const payload = runHook({
      session_id: 's1',
      hook_event_name: 'WorktreeCreate',
      cwd: '/work',
      prompt: '/rename desired',
      tool_input: { name: 'override' },
    });
    expect(payload.session_name).toBe('desired');
  });

  it('only forwards tool_input.name for worktree events', () => {
    // Another tool may put something private in a `name` field; it is read only
    // for worktree events, so it is only sent for worktree events.
    const payload = runHook({
      session_id: 's1',
      hook_event_name: 'PreToolUse',
      cwd: '/work',
      tool_name: 'Write',
      tool_input: { name: 'internal-project-codename' },
    });
    expectKeys(payload, [...BASE_KEYS, 'tool_name']);
    expect(JSON.stringify(payload)).not.toContain('codename');
  });

  it('forwards a Notification message, which the server renders', () => {
    const payload = runHook({
      session_id: 's1',
      hook_event_name: 'Notification',
      cwd: '/work',
      message: 'needs your approval',
    });
    expect(payload.message).toBe('needs your approval');
  });

  it('accepts a legacy top-level worktree name', () => {
    const payload = runHook({
      session_id: 's1',
      hook_event_name: 'WorktreeCreate',
      cwd: '/work',
      name: 'legacy-shape',
    });
    expect(payload.session_name).toBe('legacy-shape');
  });

  it('caps derived strings so curl cannot blow its argument limit', () => {
    const payload = runHook({
      session_id: 's1',
      hook_event_name: 'UserPromptSubmit',
      cwd: '/work',
      prompt: `/rename ${'x'.repeat(50_000)}`,
    });
    expect((payload.session_name as string).length).toBe(200);
  });

  it('does not send git_action on PreToolUse', () => {
    // The server plays these effects only from handlePostToolUse, so sending a
    // verdict on PreToolUse would announce a commit that has not happened.
    const payload = runHook({
      session_id: 's1',
      hook_event_name: 'PreToolUse',
      cwd: '/work',
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m wip' },
    });
    expect(payload).not.toHaveProperty('git_action');
  });

  it('derives git_action without forwarding the command', () => {
    const committed = runHook({
      session_id: 's1',
      hook_event_name: 'PostToolUse',
      cwd: '/work',
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "internal release notes"' },
    });
    expect(committed.git_action).toBe('commit');
    expect(JSON.stringify(committed)).not.toContain('internal release notes');

    const merged = runHook({
      session_id: 's1',
      hook_event_name: 'PostToolUse',
      cwd: '/work',
      tool_name: 'Bash',
      tool_input: { command: 'gh pr merge 12 --squash' },
    });
    expect(merged.git_action).toBe('pr_merge');

    const neither = runHook({
      session_id: 's1',
      hook_event_name: 'PostToolUse',
      cwd: '/work',
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
    });
    expect(neither).not.toHaveProperty('git_action');
  });

  it('keeps worktree and subagent fields', () => {
    const worktree = runHook({
      session_id: 's1',
      hook_event_name: 'WorktreeCreate',
      cwd: '/work',
      tool_input: { name: 'claude/payments' },
    });
    expect(worktree.session_name).toBe('claude/payments');

    const subagent = runHook({
      session_id: 's1',
      hook_event_name: 'SubagentStart',
      cwd: '/work',
      agent_id: 'a1',
      agent_type: 'Explore',
    });
    expect(subagent.agent_id).toBe('a1');
    expect(subagent.agent_type).toBe('Explore');
  });

  it('sends nothing at all if the filter fails', () => {
    // A malformed payload must be dropped, not fall back to forwarding the raw
    // input -- that fallback is the exact outcome this guard exists to prevent.
    const home = mkdtempSync(join(tmpdir(), 'af-hook-'));
    const binDir = join(home, 'bin');
    mkdirSync(binDir, { recursive: true });
    const capture = join(home, 'payload.json');
    writeFileSync(join(binDir, 'curl'), `#!/bin/bash\ntouch ${JSON.stringify(capture)}\nexit 0\n`);
    chmodSync(join(binDir, 'curl'), 0o755);

    execFileSync('bash', [HOOK], {
      input: 'this is not json at all',
      env: { ...process.env, HOME: home, PATH: `${binDir}:${process.env.PATH}` },
    });
    execFileSync('sleep', ['0.5']);
    expect(() => readFileSync(capture, 'utf8')).toThrow();
  });
});
