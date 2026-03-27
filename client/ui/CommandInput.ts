import type { AuthManager } from '../auth/AuthManager';
import type { SocketClient } from '../network/socket';
import type { ChatMessage } from '@shared/types';
import { VALID_EMOTES } from '@shared/constants';

interface CommandDef {
  cmd: string;
  desc: string;
  hasArg?: boolean;
}

const COMMANDS: CommandDef[] = [
  { cmd: '/emote', desc: 'trigger an emote', hasArg: true },
  { cmd: '/chat', desc: 'send a chat message', hasArg: true },
  { cmd: '/help', desc: 'show available commands' },
  { cmd: '/logout', desc: 'log out' },
];

const EMOTE_DESCRIPTIONS: Record<string, string> = {
  dance: 'rainbow sway', jump: 'bounce!', guitar: 'rock out',
  gun: 'pew pew', laugh: 'haha', wave: 'say hi',
  sleep: 'zzz', explode: 'kaboom', dizzy: 'spinning',
  flex: 'show off', rage: 'angry stomp', fart: 'toot',
};

const HELP_TEXT = [
  'Commands:',
  '  /emote <name> — trigger an emote (dance, jump, guitar, gun, laugh, wave, sleep, explode, dizzy, flex, rage, fart)',
  '  /chat <msg> — send a chat message',
  '  /help — show this help',
  '  /logout — log out',
  '  (bare text is sent as chat)',
].join('\n');

export class CommandInput {
  private container: HTMLDivElement;
  private input: HTMLInputElement;
  private suggestionsEl: HTMLDivElement;
  private history: string[] = [];
  private historyIndex = -1;
  private suggestions: { text: string; desc: string }[] = [];
  private activeIndex = -1;

  constructor(
    private auth: AuthManager,
    private socket: SocketClient,
    private onChat: (chat: ChatMessage) => void,
    private onLogout: () => void,
  ) {
    this.container = this.createDOM();
    this.input = this.container.querySelector('input') as HTMLInputElement;
    this.suggestionsEl = this.createSuggestionsEl();
    document.body.appendChild(this.container);
    document.body.appendChild(this.suggestionsEl);
    this.hide();
  }

  show(): void {
    this.container.style.display = 'flex';
  }

  hide(): void {
    this.container.style.display = 'none';
    this.hideSuggestions();
  }

  private createSuggestionsEl(): HTMLDivElement {
    const el = document.createElement('div');
    el.id = 'command-suggestions';
    el.addEventListener('mousedown', (e) => e.preventDefault());
    return el;
  }

  private createDOM(): HTMLDivElement {
    const el = document.createElement('div');
    el.id = 'command-input';
    el.innerHTML = `<span class="prompt-char">&gt;</span><input type="text" placeholder="message or /command..." autocomplete="off" spellcheck="false" /><span class="hint">Tab ↹</span>`;

    const input = el.querySelector('input') as HTMLInputElement;

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();

      if (e.key === 'Enter') {
        if (this.activeIndex >= 0 && this.suggestions.length > 0) {
          this.applySuggestion(this.suggestions[this.activeIndex]);
          e.preventDefault();
          return;
        }
        const value = input.value.trim();
        if (value) {
          this.handleCommand(value);
          this.history.push(value);
          this.historyIndex = this.history.length;
          input.value = '';
          this.hideSuggestions();
        }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (this.suggestions.length > 0) {
          const idx = this.activeIndex >= 0 ? this.activeIndex : 0;
          this.applySuggestion(this.suggestions[idx]);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.suggestions.length > 0) {
          this.activeIndex = this.activeIndex <= 0 ? this.suggestions.length - 1 : this.activeIndex - 1;
          this.renderSuggestions();
        } else if (this.historyIndex > 0) {
          this.historyIndex--;
          input.value = this.history[this.historyIndex];
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.suggestions.length > 0) {
          this.activeIndex = this.activeIndex >= this.suggestions.length - 1 ? 0 : this.activeIndex + 1;
          this.renderSuggestions();
        } else if (this.historyIndex < this.history.length - 1) {
          this.historyIndex++;
          input.value = this.history[this.historyIndex];
        } else {
          this.historyIndex = this.history.length;
          input.value = '';
        }
      } else if (e.key === 'Escape') {
        this.hideSuggestions();
      }
    });

    input.addEventListener('input', () => this.updateSuggestions());
    input.addEventListener('keyup', (e) => e.stopPropagation());
    input.addEventListener('keypress', (e) => e.stopPropagation());

    return el;
  }

  private updateSuggestions(): void {
    const value = this.input.value;

    if (!value.startsWith('/')) {
      this.hideSuggestions();
      return;
    }

    const parts = value.split(' ');
    const cmd = parts[0].toLowerCase();

    if (parts.length === 1) {
      this.suggestions = COMMANDS
        .filter(c => c.cmd.startsWith(cmd))
        .map(c => ({ text: c.cmd, desc: c.desc }));
    } else if (cmd === '/emote' && parts.length === 2) {
      const partial = parts[1].toLowerCase();
      this.suggestions = (VALID_EMOTES as string[])
        .filter(e => e.startsWith(partial))
        .map(e => ({ text: `/emote ${e}`, desc: EMOTE_DESCRIPTIONS[e] || '' }));
    } else {
      this.hideSuggestions();
      return;
    }

    if (this.suggestions.length === 0) {
      this.hideSuggestions();
      return;
    }

    this.activeIndex = 0;
    this.renderSuggestions();
    this.suggestionsEl.style.display = 'block';
  }

  private renderSuggestions(): void {
    this.suggestionsEl.innerHTML = '';

    // Header
    const value = this.input.value;
    const isEmoteSub = value.startsWith('/emote ');
    const header = document.createElement('div');
    header.className = 'suggestions-header';
    header.textContent = isEmoteSub ? 'emotes' : 'commands';
    this.suggestionsEl.appendChild(header);

    this.suggestions.forEach((s, i) => {
      const div = document.createElement('div');
      div.className = 'suggestion' + (i === this.activeIndex ? ' active' : '');
      div.innerHTML = `<span class="cmd">${s.text}</span><span class="desc">${s.desc}</span>`;
      div.addEventListener('click', () => this.applySuggestion(s));
      this.suggestionsEl.appendChild(div);
    });

    const active = this.suggestionsEl.querySelector('.active') as HTMLElement;
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  private applySuggestion(s: { text: string; desc: string }): void {
    const cmd = COMMANDS.find(c => s.text.startsWith(c.cmd));
    if (cmd?.hasArg && s.text === cmd.cmd) {
      this.input.value = s.text + ' ';
      this.updateSuggestions();
    } else {
      this.input.value = s.text;
      this.hideSuggestions();
    }
    this.input.focus();
  }

  private hideSuggestions(): void {
    this.suggestionsEl.style.display = 'none';
    this.suggestions = [];
    this.activeIndex = -1;
  }

  private handleCommand(value: string): void {
    if (value.startsWith('/emote ')) {
      const emote = value.slice(7).trim();
      if (VALID_EMOTES.includes(emote as never)) {
        this.socket.send({ type: 'emote', emote });
      } else {
        this.showLocalMessage(`Unknown emote. Valid: ${VALID_EMOTES.join(', ')}`);
      }
    } else if (value.startsWith('/chat ')) {
      const message = value.slice(6).trim();
      if (message) {
        this.socket.send({ type: 'chat', message });
      }
    } else if (value === '/help') {
      this.showLocalMessage(HELP_TEXT);
    } else if (value === '/logout') {
      this.auth.logout();
      this.hide();
      this.onLogout();
    } else if (value.startsWith('/')) {
      this.showLocalMessage(`Unknown command. Type /help for available commands.`);
    } else {
      this.socket.send({ type: 'chat', message: value });
    }
  }

  private showLocalMessage(text: string): void {
    this.onChat({
      username: 'system',
      message: text,
      timestamp: Date.now(),
    });
  }
}
