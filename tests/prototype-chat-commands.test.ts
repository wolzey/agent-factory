import { describe, expect, it, vi } from 'vitest';
import {
  CHAT_HELP, ChatCommandHistory, chatSuggestions, completeChatSuggestion, executeChatCommand, parseChatCommand,
  type ChatCommandActions, type ChatCommandContext,
} from '../client/prototypes/factory25dChatCommands';

function fixture(overrides: Partial<ChatCommandContext> = {}) {
  const context: ChatCommandContext = {
    connected: true, authenticated: true, sameOrigin: true, ownerId: 'owner-a',
    agents: [
      { sessionId: 'my-first', ownerId: 'owner-a', activity: 'idle' },
      { sessionId: 'my-selected', ownerId: 'owner-a', activity: 'reading' },
      { sessionId: 'their-agent', ownerId: 'owner-b', activity: 'idle' },
      { sessionId: 'ended', ownerId: 'owner-a', activity: 'stopped' },
    ],
    targetSessionId: 'my-selected', ...overrides,
  };
  const actions: ChatCommandActions = {
    send: vi.fn(() => true), local: vi.fn(), vortex: vi.fn(async () => true), logout: vi.fn(async () => true),
  };
  return { context, actions, execute: (text: string) => executeChatCommand(text, context, actions) };
}

describe('lounge chat commands', () => {
  it('keeps slash commands out of public chat, including malformed and unknown commands', async () => {
    const { execute, actions } = fixture();
    for (const command of ['/unknown', '/emote', '/emote invalid', '/vortex extra', '/logout extra', '/chat', '/help extra']) {
      expect(parseChatCommand(command).kind).toBe('error');
      expect((await execute(command)).clear).toBe(true);
    }
    expect(actions.send).not.toHaveBeenCalled();
    expect(actions.vortex).not.toHaveBeenCalled();
    expect(actions.logout).not.toHaveBeenCalled();
  });
  it('normalizes commands and preserves chat text while respecting the server length limit', () => {
    expect(parseChatCommand('  /EMOTE Wave ')).toEqual({ kind: 'emote', emote: 'wave' });
    expect(parseChatCommand('/CHAT  Hi, @name!')).toEqual({ kind: 'chat', message: 'Hi, @name!' });
    expect(parseChatCommand('/chat /help')).toEqual({ kind: 'chat', message: '/help' });
    expect(parseChatCommand('a'.repeat(520))).toEqual({ kind: 'chat', message: 'a'.repeat(500) });
  });
  it('shows help locally even when signed out or offline', async () => {
    const { execute, actions } = fixture({ authenticated: false, connected: false });
    expect((await execute('/help')).clear).toBe(true);
    expect(actions.local).toHaveBeenCalledWith(CHAT_HELP);
    expect(actions.send).not.toHaveBeenCalled();
  });
  it.each([
    { authenticated: false }, { sameOrigin: false }, { connected: false },
  ])('preserves drafts and blocks mutations without an authenticated same-origin connection: %j', async restriction => {
    const { execute, actions } = fixture(restriction);
    for (const command of ['hello', '/chat hi', '/emote wave', '/vortex']) expect((await execute(command)).clear).toBe(false);
    expect(actions.send).not.toHaveBeenCalled();
    expect(actions.vortex).not.toHaveBeenCalled();
  });
  it('sends plain text and /chat through the existing transport with no local duplicate echo', async () => {
    const { execute, actions } = fixture();
    expect(await execute('hello')).toEqual({ clear: true, status: 'sending…' });
    expect(await execute('/chat same conversation')).toEqual({ clear: true, status: 'sending…' });
    expect(actions.send).toHaveBeenNthCalledWith(1, { type: 'chat', message: 'hello' });
    expect(actions.send).toHaveBeenNthCalledWith(2, { type: 'chat', message: 'same conversation' });
    expect(actions.local).not.toHaveBeenCalled();
  });
  it('sends emotes only to an owned active target and rejects stale or other-owner selections', async () => {
    const { execute, actions, context } = fixture();
    expect((await execute('/emote dance')).clear).toBe(true);
    expect(actions.send).toHaveBeenCalledExactlyOnceWith({ type: 'emote', emote: 'dance', sessionId: 'my-selected' });
    for (const target of ['their-agent', 'ended', 'missing']) {
      context.targetSessionId = target; expect((await execute('/emote wave')).clear).toBe(false);
    }
    expect(actions.send).toHaveBeenCalledTimes(1);
    context.targetSessionId = undefined; await execute('/emote wave');
    expect(actions.send).toHaveBeenLastCalledWith({ type: 'emote', emote: 'wave', sessionId: 'my-first' });
  });
  it('keeps the draft on a transport failure', async () => {
    const { execute, actions } = fixture(); vi.mocked(actions.send).mockReturnValue(false);
    expect((await execute('keep me')).clear).toBe(false);
    expect(actions.local).toHaveBeenCalledWith(expect.stringContaining('not sent'));
    vi.mocked(actions.send).mockImplementationOnce(() => { throw new Error('socket closed'); });
    expect((await execute('keep this too')).clear).toBe(false);
  });
  it('reports vortex activation only after confirmation and preserves the command on request failure', async () => {
    const { execute, actions } = fixture();
    let confirm!: (value: boolean) => void;
    vi.mocked(actions.vortex).mockReturnValueOnce(new Promise(resolve => { confirm = resolve; }));
    const pending = execute('/vortex'); expect(actions.local).not.toHaveBeenCalled();
    confirm(true); expect((await pending).clear).toBe(true);
    expect(actions.local).toHaveBeenLastCalledWith('Vortex activated!');
    vi.mocked(actions.vortex).mockResolvedValueOnce(false); expect((await execute('/vortex')).clear).toBe(false);
    expect(actions.local).toHaveBeenLastCalledWith(expect.stringContaining('could not start'));
    vi.mocked(actions.vortex).mockRejectedValueOnce(new Error('offline')); expect((await execute('/vortex')).clear).toBe(false);
    expect(actions.send).not.toHaveBeenCalled();
  });
  it('confirms logout without requiring a live socket and surfaces a failed sign-out', async () => {
    const { execute, actions } = fixture({ connected: false });
    expect((await execute('/logout')).clear).toBe(true);
    expect(actions.logout).toHaveBeenCalledTimes(1);
    expect(actions.local).toHaveBeenLastCalledWith('This browser is signed out.');
    vi.mocked(actions.logout).mockResolvedValueOnce(false); expect((await execute('/logout')).clear).toBe(false);
    expect(actions.local).toHaveBeenLastCalledWith(expect.stringContaining('could not be confirmed'));
  });
});

describe('command completion and history', () => {
  it('completes commands and valid emotes, never arguments of plain chat', () => {
    expect(chatSuggestions('/')).toHaveLength(5);
    const emote = chatSuggestions('/EM')[0]; expect(completeChatSuggestion(emote)).toBe('/emote ');
    const wave = chatSuggestions('/emote wa')[0]; expect(completeChatSuggestion(wave)).toBe('/emote wave');
    expect(chatSuggestions('/chat /')).toEqual([]);
    expect(chatSuggestions('normal text')).toEqual([]);
    expect(chatSuggestions('/emote wave extra')).toEqual([]);
  });
  it('recalls input in order, restores the unsent draft, and bounds history without losing the newest entries', () => {
    const history = new ChatCommandHistory();
    history.remember('/help'); history.remember('hello'); history.remember('hello');
    expect(history.previous('unfinished thought')).toBe('hello');
    expect(history.previous('hello')).toBe('/help');
    expect(history.next()).toBe('hello'); expect(history.next()).toBe('unfinished thought');
    history.editing(); expect(history.previous('new draft')).toBe('hello'); expect(history.next()).toBe('new draft');
    for (let i = 0; i < 60; i++) history.remember(`message ${i}`);
    expect(history.previous('draft')).toBe('message 59');
    for (let i = 0; i < 60; i++) history.previous('ignored');
    expect(history.previous('ignored')).toBe('message 10');
  });
});
