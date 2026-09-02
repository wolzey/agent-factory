import type { HookPayload } from '../shared/types.js';

/**
 * Normalize an inbound hook payload down to the fields the server actually uses.
 *
 * The hook script already sends an allowlist, but this is the server's own
 * boundary and it cannot assume the sender is a current hook. Older installs --
 * and `agent-factory update` did not rewrite the hook script before v1, so there
 * are plenty -- still POST the raw Claude/Codex payload, which carries prompt
 * text, whole Bash command lines, the file contents handed to Write/Edit, and
 * tool output. Anything not returned here is dropped at ingest, so it is never
 * stored in libSQL and never broadcast to a viewer.
 *
 * Legacy senders are kept working rather than silently degraded: the two derived
 * fields are reconstructed here from the raw shape when they are absent, so an
 * old hook still renames sessions and still triggers the commit effects.
 */

const MAX_DERIVED_LENGTH = 200;

const WORKTREE_EVENTS = new Set(['WorktreeCreate', 'WorktreeRemove']);
const WORKTREE_TOOLS = new Set(['EnterWorktree', 'ExitWorktree']);

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value.slice(0, MAX_DERIVED_LENGTH) : undefined;
}

function deriveSessionName(raw: Record<string, unknown>, isWorktree: boolean): string | undefined {
  const existing = str(raw.session_name);
  if (existing) return existing;

  const prompt = raw.user_prompt ?? raw.prompt;
  if (typeof prompt === 'string') {
    const match = prompt.match(/^\/rename\s+(.+)/);
    if (match) {
      const name = match[1].trim();
      if (name) return name.slice(0, MAX_DERIVED_LENGTH);
    }
  }

  if (isWorktree) {
    const toolInput = raw.tool_input;
    if (toolInput && typeof toolInput === 'object') {
      const name = str((toolInput as Record<string, unknown>).name);
      if (name) return name;
    }
    return str(raw.name);
  }

  return undefined;
}

function deriveGitAction(raw: Record<string, unknown>): HookPayload['git_action'] {
  const existing = raw.git_action;
  if (existing === 'commit' || existing === 'pr_merge') return existing;

  // Matches only where the server plays the effect: PostToolUse on Bash.
  if (raw.hook_event_name !== 'PostToolUse' || raw.tool_name !== 'Bash') return undefined;

  const toolInput = raw.tool_input;
  if (!toolInput || typeof toolInput !== 'object') return undefined;
  const command = String((toolInput as Record<string, unknown>).command ?? '');

  if (/git\s+commit\b/.test(command)) return 'commit';
  if (/gh\s+pr\s+merge\b|git\s+merge\b/.test(command)) return 'pr_merge';
  return undefined;
}

export function normalizeHookPayload(input: unknown): HookPayload | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;

  const sessionId = typeof raw.session_id === 'string' ? raw.session_id : undefined;
  const eventName = typeof raw.hook_event_name === 'string' ? raw.hook_event_name : undefined;
  if (!sessionId || !eventName) return null;

  const toolName = str(raw.tool_name);
  const isWorktree = WORKTREE_EVENTS.has(eventName) || (!!toolName && WORKTREE_TOOLS.has(toolName));

  const normalized: HookPayload = {
    session_id: sessionId,
    hook_event_name: eventName,
    cwd: typeof raw.cwd === 'string' ? raw.cwd : '',
    username: str(raw.username) ?? 'anonymous',
    avatar: (raw.avatar && typeof raw.avatar === 'object' && !Array.isArray(raw.avatar)
      ? raw.avatar
      : {}) as HookPayload['avatar'],
  };

  const optional: Record<string, unknown> = {
    tool_name: toolName,
    reason: str(raw.reason),
    agent_id: str(raw.agent_id),
    agent_type: str(raw.agent_type),
    source: str(raw.source),
    message: str(raw.message),
    session_name: deriveSessionName(raw, isWorktree),
    git_action: deriveGitAction(raw),
  };

  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) (normalized as Record<string, unknown>)[key] = value;
  }

  return normalized;
}

/**
 * Strip fields that earlier versions persisted before they were removed. A
 * restored snapshot is otherwise cloned wholesale, so a `currentToolInput`
 * captured months ago would keep being rebroadcast and re-persisted forever.
 */
export function scrubLegacyAgentFields<T>(agent: T): T {
  const record = agent as unknown as Record<string, unknown>;
  delete record.currentToolInput;
  delete record.lastPrompt;
  return agent;
}
