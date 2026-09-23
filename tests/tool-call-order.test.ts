import { describe, expect, it } from 'vitest';
import { StateManager } from '../server/state.js';
import type { HookPayload } from '../shared/types.js';

/** Async hooks give no delivery order, so the server pairs tool events by tool_use_id. */
function session() {
  const state = new StateManager('factory25d', () => 1_000);
  const send = (hook_event_name: string, extra: Partial<HookPayload> = {}) =>
    state.handleHookEvent({ hook_event_name, session_id: 's', cwd: '/work', username: 'ada', avatar: {} as HookPayload['avatar'], ...extra });
  send('SessionStart');
  send('UserPromptSubmit');
  return { state, send, agent: () => state.get('s')! };
}

describe('tool events paired by tool_use_id', () => {
  it('ignores a start that arrives after its own end', () => {
    const { send, agent } = session();
    send('PostToolUse', { tool_name: 'Read', tool_use_id: 'a' });
    send('PreToolUse', { tool_name: 'Read', tool_use_id: 'a' });
    expect(agent()).toMatchObject({ activity: 'thinking', currentTool: null, toolUseCount: 1 });
  });

  it('keeps a parallel call running until its own end arrives', () => {
    const { send, agent } = session();
    send('PreToolUse', { tool_name: 'Grep', tool_use_id: 'a' });
    send('PreToolUse', { tool_name: 'Bash', tool_use_id: 'b' });
    const running = agent().activity;
    send('PostToolUse', { tool_name: 'Grep', tool_use_id: 'a' });
    expect(agent()).toMatchObject({ activity: running, currentTool: 'Bash' });
    send('PostToolUse', { tool_name: 'Bash', tool_use_id: 'b' });
    expect(agent()).toMatchObject({ activity: 'thinking', currentTool: null });
  });

  it('does not wake an agent when a tool end arrives after Stop', () => {
    const { send, agent } = session();
    send('PreToolUse', { tool_name: 'Edit', tool_use_id: 'a' });
    send('Stop');
    send('PostToolUse', { tool_name: 'Edit', tool_use_id: 'a' });
    expect(agent().activity).toBe('idle');
  });

  it('treats events without an id exactly as before', () => {
    const { send, agent } = session();
    send('PreToolUse', { tool_name: 'Read' });
    send('PostToolUse', { tool_name: 'Read' });
    expect(agent()).toMatchObject({ activity: 'thinking', currentTool: null });
    send('PostToolUse', { tool_name: 'Read' });
    send('PreToolUse', { tool_name: 'Read' });
    expect(agent().currentTool).toBe('Read');
  });
});
