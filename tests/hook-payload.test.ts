import { describe, expect, it } from 'vitest';
import { normalizeHookPayload, scrubLegacyAgentFields } from '../server/hook-payload';

const BASE = { session_id: 's1', hook_event_name: 'PreToolUse', cwd: '/work', username: 'tester', avatar: {} };

describe('normalizeHookPayload', () => {
  it('strips everything an old hook still sends raw', () => {
    // Until every install has updated, the server receives the full Claude
    // payload from older hook scripts. It must not reach state, libSQL, or a
    // browser just because the sender is out of date.
    const payload = normalizeHookPayload({
      ...BASE,
      tool_name: 'Bash',
      tool_input: { command: 'psql -c "SELECT email FROM users"' },
      tool_response: { output: 'DB_PASSWORD=hunter2' },
      prompt: 'rotate AKIAIOSFODNN7EXAMPLE',
      transcript_path: '/home/tester/.claude/transcript.jsonl',
    });

    expect(payload).not.toBeNull();
    expect(Object.keys(payload!).sort()).toEqual(
      ['avatar', 'cwd', 'hook_event_name', 'session_id', 'tool_name', 'username'].sort(),
    );
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('SELECT email');
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(serialized).not.toContain('transcript');
  });

  it('keeps an old hook working by deriving what it did not send', () => {
    const renamed = normalizeHookPayload({
      ...BASE,
      hook_event_name: 'UserPromptSubmit',
      prompt: '/rename payments  ',
    });
    expect(renamed!.session_name).toBe('payments');

    const committed = normalizeHookPayload({
      ...BASE,
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "internal notes"' },
    });
    expect(committed!.git_action).toBe('commit');
    expect(JSON.stringify(committed)).not.toContain('internal notes');
  });

  it('derives git_action only where the server acts on it', () => {
    const pre = normalizeHookPayload({
      ...BASE,
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m wip' },
    });
    expect(pre!.git_action).toBeUndefined();

    const notBash = normalizeHookPayload({
      ...BASE,
      hook_event_name: 'PostToolUse',
      tool_name: 'Read',
      tool_input: { command: 'git commit -m wip' },
    });
    expect(notBash!.git_action).toBeUndefined();
  });

  it('reads tool_input.name only for worktree events', () => {
    const worktree = normalizeHookPayload({
      ...BASE,
      hook_event_name: 'WorktreeCreate',
      tool_input: { name: 'claude/payments' },
    });
    expect(worktree!.session_name).toBe('claude/payments');

    const other = normalizeHookPayload({
      ...BASE,
      tool_name: 'Write',
      tool_input: { name: 'internal-codename' },
    });
    expect(other!.session_name).toBeUndefined();
  });

  it('passes a current hook payload through unchanged', () => {
    const payload = normalizeHookPayload({
      ...BASE,
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      session_name: 'already derived',
      git_action: 'pr_merge',
    });
    expect(payload!.session_name).toBe('already derived');
    expect(payload!.git_action).toBe('pr_merge');
  });

  it('rejects a payload with nothing to identify it', () => {
    expect(normalizeHookPayload(null)).toBeNull();
    expect(normalizeHookPayload('a string')).toBeNull();
    expect(normalizeHookPayload([1, 2, 3])).toBeNull();
    expect(normalizeHookPayload({ hook_event_name: 'Stop' })).toBeNull();
    expect(normalizeHookPayload({ session_id: 's1' })).toBeNull();
  });

  it('refuses an invented git_action', () => {
    const payload = normalizeHookPayload({ ...BASE, git_action: 'rm -rf' });
    expect(payload!.git_action).toBeUndefined();
  });

  it('rejects a pre-derived git_action on the wrong event or tool', () => {
    // The hook derives this correctly, but the server cannot assume the sender
    // is the hook. Without the context check, any caller fires the effect.
    const wrongTool = normalizeHookPayload({
      ...BASE,
      hook_event_name: 'PostToolUse',
      tool_name: 'Read',
      git_action: 'commit',
    });
    expect(wrongTool!.git_action).toBeUndefined();

    const wrongEvent = normalizeHookPayload({
      ...BASE,
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      git_action: 'commit',
    });
    expect(wrongEvent!.git_action).toBeUndefined();
  });

  it('survives a command that throws on string coercion', () => {
    // Valid JSON, but String() on it raises TypeError, which would turn a hook
    // post into a 500.
    expect(() =>
      normalizeHookPayload({
        ...BASE,
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: { toString: null, valueOf: null } },
      }),
    ).not.toThrow();
  });

  it('validates the avatar rather than storing whatever arrives', () => {
    // avatar is the one nested object that survives, so it would otherwise be an
    // open channel for persisting and broadcasting arbitrary data.
    const payload = normalizeHookPayload({
      ...BASE,
      avatar: {
        spriteIndex: 3,
        color: '#fff',
        hat: null,
        exfiltrated: { prompt: 'the password is hunter2' },
        hairStyle: 'not a number',
      },
    });

    expect(payload!.avatar).toEqual({ spriteIndex: 3, color: '#fff', hat: null });
    expect(JSON.stringify(payload)).not.toContain('hunter2');
  });

  it('caps identity fields, not just derived ones', () => {
    const payload = normalizeHookPayload({
      ...BASE,
      session_id: 'x'.repeat(50_000),
      cwd: '/'.repeat(50_000),
    });
    expect(payload!.session_id.length).toBe(512);
    expect(payload!.cwd.length).toBe(512);
  });

  it('caps long strings', () => {
    const payload = normalizeHookPayload({ ...BASE, reason: 'x'.repeat(50_000) });
    expect(payload!.reason!.length).toBe(200);
  });
});

describe('scrubLegacyAgentFields', () => {
  it('removes fields persisted before they were dropped from the type', () => {
    // A restored snapshot is cloned wholesale. Without this, a tool_input
    // captured under an older version would be rebroadcast indefinitely.
    const restored = scrubLegacyAgentFields({
      sessionId: 's1',
      currentTool: null,
      currentToolInput: { command: 'psql -c "SELECT email FROM users"' },
      lastPrompt: 'the password is hunter2',
    } as Record<string, unknown>);

    expect(restored).not.toHaveProperty('currentToolInput');
    expect(restored).not.toHaveProperty('lastPrompt');
    expect(restored.sessionId).toBe('s1');
  });
});
