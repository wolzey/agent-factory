import type { ChatMessage } from '@shared/types';
import { CHAT_FADE_TIMEOUT_MS } from '@shared/constants';

const MAX_DOM_MESSAGES = 100;
const USER_COLORS = 8;

export class ChatOverlay {
  private container: HTMLDivElement;
  private messageList: HTMLDivElement;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private hovered = false;
  private userColorMap = new Map<string, number>();
  private nextColorIndex = 0;

  constructor() {
    this.container = this.createDOM();
    this.messageList = this.container.querySelector('.chat-messages')!;
    document.body.appendChild(this.container);

    this.container.addEventListener('mouseenter', () => {
      this.hovered = true;
      if (this.fadeTimer) clearTimeout(this.fadeTimer);
    });

    this.container.addEventListener('mouseleave', () => {
      this.hovered = false;
      this.resetFadeTimer();
    });
  }

  addMessage(chat: ChatMessage) {
    const el = document.createElement('div');
    el.className = 'chat-msg';

    const isSystem = chat.username === 'system';

    if (isSystem) {
      el.classList.add('system-msg');
      el.textContent = chat.message;
    } else {
      // Timestamp
      const time = document.createElement('span');
      time.className = 'chat-time';
      const d = new Date(chat.timestamp);
      time.textContent = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      el.appendChild(time);

      // Username with consistent color
      const nameSpan = document.createElement('span');
      nameSpan.className = `chat-name user-color-${this.getUserColor(chat.username)}`;
      nameSpan.textContent = chat.username;
      el.appendChild(nameSpan);

      el.appendChild(document.createTextNode(': '));

      // Message with syntax highlights
      const textSpan = document.createElement('span');
      textSpan.className = 'chat-text';
      textSpan.innerHTML = this.highlightMessage(chat.message);
      el.appendChild(textSpan);
    }

    this.messageList.appendChild(el);

    while (this.messageList.children.length > MAX_DOM_MESSAGES) {
      this.messageList.removeChild(this.messageList.firstChild!);
    }

    const { scrollHeight, scrollTop, clientHeight } = this.messageList;
    if (scrollHeight - scrollTop - clientHeight < 30) {
      this.messageList.scrollTop = scrollHeight;
    }

    this.show();
    this.resetFadeTimer();
  }

  private getUserColor(username: string): number {
    if (!this.userColorMap.has(username)) {
      this.userColorMap.set(username, this.nextColorIndex % USER_COLORS);
      this.nextColorIndex++;
    }
    return this.userColorMap.get(username)!;
  }

  private highlightMessage(text: string): string {
    // Escape HTML
    let safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Highlight /commands
    safe = safe.replace(/(\/\w+)/g, '<span class="hl-cmd">$1</span>');

    // Highlight :emotes:
    safe = safe.replace(/:(\w+):/g, '<span class="hl-emote">:$1:</span>');

    // Highlight @mentions
    safe = safe.replace(/@(\w+)/g, '<span class="hl-mention">@$1</span>');

    return safe;
  }

  private show() {
    this.container.classList.remove('chat-hidden');
    this.container.classList.add('chat-visible');
  }

  private hide() {
    this.container.classList.remove('chat-visible');
    this.container.classList.add('chat-hidden');
  }

  private resetFadeTimer() {
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    if (this.hovered) return;
    this.fadeTimer = setTimeout(() => this.hide(), CHAT_FADE_TIMEOUT_MS);
  }

  private createDOM(): HTMLDivElement {
    const existing = document.getElementById('chat-overlay');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = 'chat-overlay';
    el.className = 'chat-hidden';
    el.innerHTML = `
      <div class="chat-header">
        <span class="chat-label">chat</span>
        <span>tab to focus</span>
      </div>
      <div class="chat-messages"></div>
    `;
    return el;
  }
}
