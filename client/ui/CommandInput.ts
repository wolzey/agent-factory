import type { AuthManager } from '../auth/AuthManager';
import type { SocketClient } from '../network/socket';
import type { ChatMessage } from '@shared/types';
import { VALID_EMOTES } from '@shared/constants';

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
  private history: string[] = [];
  private historyIndex = -1;

  constructor(
    private auth: AuthManager,
    private socket: SocketClient,
    private onChat: (chat: ChatMessage) => void,
    private onLogout: () => void,
  ) {
    this.container = this.createDOM();
    this.input = this.container.querySelector('input') as HTMLInputElement;
    document.body.appendChild(this.container);
    this.hide();
  }

  show(): void {
    this.container.style.display = 'flex';
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  private createDOM(): HTMLDivElement {
    const el = document.createElement('div');
    el.id = 'command-input';
    el.innerHTML = `<span class="prompt-char">&gt;</span><input type="text" placeholder="Type a command or message..." autocomplete="off" spellcheck="false" />`;

    const input = el.querySelector('input') as HTMLInputElement;

    // Prevent Phaser from capturing keystrokes
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();

      if (e.key === 'Enter') {
        const value = input.value.trim();
        if (value) {
          this.handleCommand(value);
          this.history.push(value);
          this.historyIndex = this.history.length;
          input.value = '';
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.historyIndex > 0) {
          this.historyIndex--;
          input.value = this.history[this.historyIndex];
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.historyIndex < this.history.length - 1) {
          this.historyIndex++;
          input.value = this.history[this.historyIndex];
        } else {
          this.historyIndex = this.history.length;
          input.value = '';
        }
      }
    });

    // Also stop keyup/keypress propagation
    input.addEventListener('keyup', (e) => e.stopPropagation());
    input.addEventListener('keypress', (e) => e.stopPropagation());

    return el;
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
      // Bare text = chat
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
