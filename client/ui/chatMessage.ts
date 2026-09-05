import type { ChatMessage } from '@shared/types';

export function chatUserColor(username: string): number {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = ((hash << 5) - hash + username.charCodeAt(i)) | 0;
  return Math.abs(hash) % 8;
}

export function highlightChatMessage(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/(\/\w+)/g, '<span class="hl-cmd">$1</span>')
    .replace(/:(\w+):/g, '<span class="hl-emote">:$1:</span>')
    .replace(/@(\w+)/g, '<span class="hl-mention">@$1</span>');
}

/** Both the current factory and the lounge board display the same message contract. */
export function createChatMessage(chat: ChatMessage): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'chat-msg';
  if (chat.username === 'system') {
    row.classList.add('system-msg');
    row.textContent = chat.message;
    return row;
  }
  const time = document.createElement('span');
  time.className = 'chat-time';
  const date = new Date(chat.timestamp);
  time.textContent = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const name = document.createElement('span');
  name.className = `chat-name user-color-${chatUserColor(chat.username)}`;
  name.textContent = chat.username;
  const text = document.createElement('span');
  text.className = 'chat-text';
  text.innerHTML = highlightChatMessage(chat.message);
  row.append(time, name, document.createTextNode(': '), text);
  return row;
}
