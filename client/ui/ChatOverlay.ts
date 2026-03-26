import type { ChatMessage } from '@shared/types';
import { CHAT_FADE_TIMEOUT_MS } from '@shared/constants';

const MAX_DOM_MESSAGES = 100;

export class ChatOverlay {
  private container: HTMLDivElement;
  private messageList: HTMLDivElement;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private hovered = false;

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

    const nameSpan = document.createElement('span');
    nameSpan.className = 'chat-name';
    nameSpan.textContent = chat.username;

    el.appendChild(nameSpan);
    el.appendChild(document.createTextNode(': ' + chat.message));

    this.messageList.appendChild(el);

    // Prune old messages from DOM
    while (this.messageList.children.length > MAX_DOM_MESSAGES) {
      this.messageList.removeChild(this.messageList.firstChild!);
    }

    // Auto-scroll to bottom if already near bottom
    const { scrollHeight, scrollTop, clientHeight } = this.messageList;
    if (scrollHeight - scrollTop - clientHeight < 30) {
      this.messageList.scrollTop = scrollHeight;
    }

    this.show();
    this.resetFadeTimer();
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
    el.innerHTML = '<div class="chat-messages"></div>';
    return el;
  }
}
