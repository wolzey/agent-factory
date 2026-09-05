import { VALID_EMOTES } from '@shared/constants';
import type { WSMessageToServer } from '@shared/types';

export const CHAT_COMMANDS = [
  { text: '/emote', description: 'trigger an emote', argument: true },
  { text: '/vortex', description: 'swirl all agents in a vortex' },
  { text: '/chat', description: 'send a chat message', argument: true },
  { text: '/help', description: 'show available commands' },
  { text: '/logout', description: 'log out' },
] as const;
const EMOTE_DESCRIPTIONS: Record<string, string> = {
  dance: 'rainbow sway', jump: 'bounce!', guitar: 'rock out', gun: 'pew pew',
  laugh: 'haha', wave: 'say hi', sleep: 'zzz', explode: 'kaboom', dizzy: 'spinning',
  flex: 'show off', rage: 'angry stomp', fart: 'toot',
};
export const CHAT_HELP = [
  '/emote <name> — animate your selected agent',
  '/vortex — swirl all agents in a vortex',
  '/chat <message> — send a chat message',
  '/help — show these commands',
  '/logout — disconnect this browser',
  'Plain text sends chat. Tab completes commands; ↑/↓ recall history. C opens chat.',
].join('\n');
export interface ChatSuggestion { text: string; description: string; }
export function chatSuggestions(value: string): ChatSuggestion[] {
  const parts = value.trimStart().toLowerCase().split(/\s+/);
  if (!parts[0].startsWith('/')) return [];
  if (parts.length === 1) return CHAT_COMMANDS.filter(command => command.text.startsWith(parts[0]));
  if (parts[0] === '/emote' && parts.length === 2)
    return VALID_EMOTES.filter(emote => emote.startsWith(parts[1])).map(emote => ({
      text: `/emote ${emote}`, description: EMOTE_DESCRIPTIONS[emote] ?? '',
    }));
  return [];
}
export function completeChatSuggestion(suggestion: ChatSuggestion) {
  const command = CHAT_COMMANDS.find(command => command.text === suggestion.text);
  return command && 'argument' in command ? `${suggestion.text} ` : suggestion.text;
}
export type ChatCommand =
  | { kind: 'empty' | 'help' | 'vortex' | 'logout' }
  | { kind: 'chat'; message: string }
  | { kind: 'emote'; emote: string }
  | { kind: 'error'; message: string };
/** Unknown slash commands are local errors; they can never become public chat. */
export function parseChatCommand(value: string): ChatCommand {
  const text = value.trim();
  if (!text) return { kind: 'empty' };
  if (!text.startsWith('/')) return { kind: 'chat', message: text.slice(0, 500) };
  const space = text.search(/\s/), name = (space < 0 ? text : text.slice(0, space)).toLowerCase();
  const argument = space < 0 ? '' : text.slice(space).trim();
  if (name === '/chat') return argument ? { kind: 'chat', message: argument.slice(0, 500) } : { kind: 'error', message: 'Type /chat followed by your message.' };
  if (name === '/emote') return VALID_EMOTES.includes(argument.toLowerCase() as never)
    ? { kind: 'emote', emote: argument.toLowerCase() }
    : { kind: 'error', message: `Choose an emote: ${VALID_EMOTES.join(', ')}.` };
  if (['/help', '/vortex', '/logout'].includes(name)) return argument
    ? { kind: 'error', message: `${name} does not take an argument.` }
    : { kind: name.slice(1) as 'help' | 'vortex' | 'logout' };
  return { kind: 'error', message: 'Unknown command. Type /help for available commands.' };
}

export class ChatCommandHistory {
  private entries: string[] = [];
  private index = 0;
  private draft = '';
  remember(value: string) {
    if (value.trim() && this.entries.at(-1) !== value) this.entries.push(value);
    this.entries = this.entries.slice(-50); this.index = this.entries.length; this.draft = '';
  }
  previous(current: string) {
    if (this.index === this.entries.length) this.draft = current;
    this.index = Math.max(0, this.index - 1);
    return this.entries[this.index] ?? current;
  }
  next() { this.index = Math.min(this.entries.length, this.index + 1); return this.entries[this.index] ?? this.draft; }
  editing() { this.index = this.entries.length; }
}
export interface ChatCommandContext {
  connected: boolean;
  authenticated: boolean;
  sameOrigin: boolean;
  ownerId?: string;
  targetSessionId?: string | null;
  agents: { sessionId: string; ownerId?: string; activity: string }[];
}
export interface ChatCommandActions {
  send: (message: WSMessageToServer) => boolean;
  local: (message: string) => void;
  vortex: () => Promise<boolean>;
  logout: () => Promise<boolean>;
}
export interface ChatCommandResult { clear: boolean; status: string; }
export async function executeChatCommand(value: string, context: ChatCommandContext, actions: ChatCommandActions): Promise<ChatCommandResult> {
  const command = parseChatCommand(value);
  const local = (message: string, clear = true) => { actions.local(message); return { clear, status: 'only visible to you' }; };
  if (command.kind === 'empty') return { clear: false, status: '' };
  if (command.kind === 'help') return local(CHAT_HELP);
  if (command.kind === 'error') return local(command.message);
  if (!context.authenticated || !context.sameOrigin) return local('Connect this browser at the factory to chat or use that command. Your draft is still here.', false);
  if (!context.connected && command.kind !== 'logout') return local('The factory is disconnected. Your draft is still here.', false);
  const send = (message: WSMessageToServer) => { try { return actions.send(message); } catch { return false; } };
  if (command.kind === 'chat') return send({ type: 'chat', message: command.message })
    ? { clear: true, status: 'sending…' } // Only the server broadcast creates the visible chat message.
    : local('That message was not sent. Your draft is still here.', false);
  if (command.kind === 'emote') {
    const owned = context.agents.filter(agent => agent.ownerId === context.ownerId && context.ownerId && agent.activity !== 'stopped');
    const target = context.targetSessionId ? owned.find(agent => agent.sessionId === context.targetSessionId) : owned[0];
    if (!target) return local('Choose one of your active agents in agent controls first.', false);
    return send({ type: 'emote', emote: command.emote, sessionId: target.sessionId })
      ? { clear: true, status: `${command.emote} requested` }
      : local('The emote could not be sent. Try again when connected.', false);
  }
  try {
    const ok = command.kind === 'vortex' ? await actions.vortex() : await actions.logout();
    if (!ok) return local(command.kind === 'vortex' ? 'The vortex could not start. Try again.' : 'Sign out could not be confirmed. Please try again.', false);
    return local(command.kind === 'vortex' ? 'Vortex activated!' : 'This browser is signed out.');
  } catch {
    return local(command.kind === 'vortex' ? 'The vortex could not start. Your connection may be offline.' : 'Sign out could not be confirmed. Please try again.', false);
  }
}
