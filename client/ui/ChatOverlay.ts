import type { ChatMessage } from '@shared/types';

const MAX_DOM_MESSAGES = 100;
const USER_COLORS = 8;

export class ChatOverlay {
  private container: HTMLDivElement;
  private messageList: HTMLDivElement;
  private emptyEl: HTMLDivElement;
  private userColorMap = new Map<string, number>();
  private nextColorIndex = 0;

  constructor() {
    this.container = this.createDOM();
    this.messageList = this.container.querySelector('.chat-messages')!;
    this.emptyEl = this.container.querySelector('.chat-empty')!;
    document.body.appendChild(this.container);
  }

  /** Returns the container element so CommandInput can embed its input row */
  getContainer(): HTMLDivElement {
    return this.container;
  }

  addMessage(chat: ChatMessage) {
    // Hide empty placeholder
    this.emptyEl.style.display = 'none';

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

    while (this.messageList.children.length > MAX_DOM_MESSAGES + 1) {
      // +1 for the empty placeholder
      this.messageList.removeChild(this.messageList.children[1]!);
    }

    const { scrollHeight, scrollTop, clientHeight } = this.messageList;
    if (scrollHeight - scrollTop - clientHeight < 30) {
      this.messageList.scrollTop = scrollHeight;
    }
  }

  private getUserColor(username: string): number {
    if (!this.userColorMap.has(username)) {
      this.userColorMap.set(username, this.nextColorIndex % USER_COLORS);
      this.nextColorIndex++;
    }
    return this.userColorMap.get(username)!;
  }

  private highlightMessage(text: string): string {
    let safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    safe = safe.replace(/(\/\w+)/g, '<span class="hl-cmd">$1</span>');
    safe = safe.replace(/:(\w+):/g, '<span class="hl-emote">:$1:</span>');
    safe = safe.replace(/@(\w+)/g, '<span class="hl-mention">@$1</span>');
    return safe;
  }

  private createDOM(): HTMLDivElement {
    const existing = document.getElementById('chat-panel');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = 'chat-panel';
    el.innerHTML = `
      <div class="chat-header">
        <span class="chat-label">chat</span>
        <span>/ for commands</span>
      </div>
      <div class="chat-messages">
        <div class="chat-empty">no messages yet — say something!</div>
      </div>
    `;
    return el;
  }
}
