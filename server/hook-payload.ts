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
// Identity and paths are capped too: every allowlisted string becomes a curl
// argument on the way here, and an unbounded one can exceed the OS argument
// limit and silently lose the event.
const MAX_FIELD_LENGTH = 512;

// The avatar is the one nested object that survives normalization, so it is
// validated rather than trusted -- otherwise it is an open channel for storing
// and broadcasting arbitrary data under an allowlisted key.
const AVATAR_FIELDS: Record<string, 'string' | 'number' | 'boolean' | 'nullable-string'> = {
  spriteIndex: 'number',
  color: 'string',
  hat: 'nullable-string',
  trail: 'nullable-string',
  graphicDeath: 'boolean',
  hairStyle: 'number',
  hairColor: 'string',
  skinTone: 'string',
  shirtColor: 'string',
  pantsColor: 'string',
  shoeColor: 'string',
  facialHair: 'number',
  mouthStyle: 'number',
  faceAccessory: 'number',
  headAccessory: 'number',
  shirtDesign: 'number',
};

function sanitizeAvatar(value: unknown): HookPayload['avatar'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {} as unknown as HookPayload['avatar'];
  const raw = value as Record<string, unknown>;
  const avatar: Record<string, unknown> = {};

  for (const [key, kind] of Object.entries(AVATAR_FIELDS)) {
    const candidate = raw[key];
    if (candidate === undefined) continue;
    if (kind === 'number' && typeof candidate === 'number' && Number.isFinite(candidate)) {
      avatar[key] = candidate;
    } else if (kind === 'boolean' && typeof candidate === 'boolean') {
      avatar[key] = candidate;
    } else if (kind === 'string' && typeof candidate === 'string') {
      avatar[key] = candidate.slice(0, MAX_FIELD_LENGTH);
    } else if (kind === 'nullable-string') {
      if (candidate === null) avatar[key] = null;
      else if (typeof candidate === 'string') avatar[key] = candidate.slice(0, MAX_FIELD_LENGTH);
    }
  }

  return avatar as unknown as HookPayload['avatar'];
}

const WORKTREE_EVENTS = new Set(['WorktreeCreate', 'WorktreeRemove']);
const WORKTREE_TOOLS = new Set(['EnterWorktree', 'ExitWorktree']);

function str(value: unknown, limit = MAX_DERIVED_LENGTH): string | undefined {
  return typeof value === 'string' ? value.slice(0, limit) : undefined;
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
  // The context check applies to a value the sender supplied too, not just to
  // one derived here. Otherwise any caller can POST git_action on an unrelated
  // event and fire the effect.
  if (raw.hook_event_name !== 'PostToolUse' || raw.tool_name !== 'Bash') return undefined;

  const existing = raw.git_action;
  if (existing === 'commit' || existing === 'pr_merge') return existing;

  const toolInput = raw.tool_input;
  if (!toolInput || typeof toolInput !== 'object') return undefined;
  // Deliberately not String(): a command of {"toString":null,"valueOf":null} is
  // valid JSON that throws on coercion, turning a hook post into a 500.
  const command = (toolInput as Record<string, unknown>).command;
  if (typeof command !== 'string') return undefined;

  if (/git\s+commit\b/.test(command)) return 'commit';
  if (/gh\s+pr\s+merge\b|git\s+merge\b/.test(command)) return 'pr_merge';
  return undefined;
}

export function normalizeHookPayload(input: unknown): HookPayload | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;

  const sessionId = str(raw.session_id, MAX_FIELD_LENGTH);
  const eventName = str(raw.hook_event_name, MAX_FIELD_LENGTH);
  if (!sessionId || !eventName) return null;

  const toolName = str(raw.tool_name, MAX_FIELD_LENGTH);
  const isWorktree = WORKTREE_EVENTS.has(eventName) || (!!toolName && WORKTREE_TOOLS.has(toolName));

  const normalized: HookPayload = {
    session_id: sessionId,
    hook_event_name: eventName,
    cwd: str(raw.cwd, MAX_FIELD_LENGTH) ?? '',
    username: str(raw.username, MAX_FIELD_LENGTH) ?? 'anonymous',
    avatar: sanitizeAvatar(raw.avatar),
  };

  const optional: Record<string, unknown> = {
    tool_name: toolName,
    reason: str(raw.reason),
    agent_id: str(raw.agent_id, MAX_FIELD_LENGTH),
    agent_type: str(raw.agent_type, MAX_FIELD_LENGTH),
    source: str(raw.source, MAX_FIELD_LENGTH),
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
