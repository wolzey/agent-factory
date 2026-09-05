import type { ChatMessage } from '@shared/types';
import { createChatMessage } from './chatMessage';

const MAX_DOM_MESSAGES = 100;

export class ChatOverlay {
  private container: HTMLDivElement;
  private messageList: HTMLDivElement;
  private emptyEl: HTMLDivElement;
  private visible = false;
  private toggleBtn: HTMLButtonElement;

  constructor() {
    this.container = this.createDOM();
    this.container.classList.add('chat-hidden');
    this.messageList = this.container.querySelector('.chat-messages')!;
    this.emptyEl = this.container.querySelector('.chat-empty')!;
    document.body.appendChild(this.container);

    this.toggleBtn = this.createToggleButton();
    document.body.appendChild(this.toggleBtn);
    this.toggleBtn.addEventListener('click', () => this.toggle());
    this.setupKeyboardShortcut();
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.classList.toggle('chat-hidden', !this.visible);
    this.toggleBtn.classList.toggle('chat-visible', this.visible);
    this.updateToggleContent();
  }

  private createToggleButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = 'chat-toggle';
    this.updateToggleContent(btn);
    return btn;
  }

  private updateToggleContent(btn?: HTMLButtonElement): void {
    const el = btn || this.toggleBtn;
    if (this.visible) {
      el.innerHTML = '&#x203a;';
    } else {
      el.innerHTML = 'CHAT<span class="toggle-hint">[C]</span>';
    }
  }

  private setupKeyboardShortcut(): void {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'c' || e.key === 'C') {
        this.toggle();
      }
    });
  }

  /** Returns the container element so CommandInput can embed its input row */
  getContainer(): HTMLDivElement {
    return this.container;
  }

  replaceMessages(messages: ChatMessage[]): void {
    for (const message of Array.from(this.messageList.querySelectorAll('.chat-msg'))) {
      message.remove();
    }
    this.emptyEl.style.display = messages.length === 0 ? '' : 'none';
    for (const message of messages) this.addMessage(message);
  }

  addMessage(chat: ChatMessage) {
    // Hide empty placeholder
    this.emptyEl.style.display = 'none';

    const atBottom = this.messageList.scrollHeight - this.messageList.scrollTop - this.messageList.clientHeight < 30;
    const el = createChatMessage(chat);

    this.messageList.appendChild(el);

    while (this.messageList.children.length > MAX_DOM_MESSAGES + 1) {
      // +1 for the empty placeholder
      this.messageList.removeChild(this.messageList.children[1]!);
    }

    if (atBottom) {
      this.messageList.scrollTop = this.messageList.scrollHeight;
    }
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
