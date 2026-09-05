import type { AvatarConfig, ChatMessage } from '@shared/types';
import { readAvatar } from './factory25dAvatar';

/** Only public display fields are retained; no credentials or agent controls. */
export interface BoardAgent {
  id: string;
  name: string;
  owner: string;
  task: string | null;
  project: string | null;
  tool: string | null;
  startedAt: number | null;
  activity: string;
  tools: number | null;
  avatar?: AvatarConfig;
  slot?: number | null;
}
export interface BoardData {
  agents: BoardAgent[];
  merges: number | null;
  connected: boolean;
  chat?: ChatMessage[];
  canChat?: boolean;
}
const count = (value: unknown): number | null =>
  Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
const label = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 500) : null;
export const BOARD_COLUMNS = [
  { id: 'thinking', label: 'THINKING', color: '#287e9d', paper: '#a7d8e2' },
  { id: 'coding', label: 'CODING', color: '#67469e', paper: '#c9b0ea' },
  { id: 'reading', label: 'READING', color: '#99741c', paper: '#ede09c' },
] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number]['id'];
export function boardColumn(activity: string): BoardColumn | null {
  if (['thinking', 'planning', 'chatting', 'compacting'].includes(activity)) return 'thinking';
  if (['writing', 'running'].includes(activity)) return 'coding';
  if (['reading', 'searching'].includes(activity)) return 'reading';
  return null;
}
export function sessionAge(startedAt: number | null, now: number): string {
  if (startedAt === null || startedAt > now) return '';
  const minutes = Math.floor((now - startedAt) / 60000);
  return minutes < 1 ? '<1m' : minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`;
}
export function boardDataFromSnapshot(value: unknown): BoardData {
  if (!value || typeof value !== 'object' || !('agents' in value) || !Array.isArray(value.agents))
    throw new Error('No factory snapshot');
  const agents: BoardAgent[] = value.agents.flatMap((agent) => {
    if (
      !agent ||
      typeof agent !== 'object' ||
      typeof agent.sessionId !== 'string' ||
      typeof agent.username !== 'string'
    )
      return [];
    return [
      {
        id: agent.sessionId,
        name: label(agent.sessionName) ?? agent.username,
        owner: agent.username,
        task: label(agent.taskDescription) ?? label(agent.sessionName),
        project: label(agent.cwd)?.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? null,
        tool: label(agent.currentTool),
        startedAt: count(agent.startedAt),
        activity: typeof agent.activity === 'string' ? agent.activity : 'unknown',
        tools: count(agent.toolUseCount),
        avatar: readAvatar(agent.avatar),
        slot: count(agent.world?.slotIndex),
      },
    ];
  });
  return { agents, merges: count('mergeCount' in value ? value.mergeCount : null), connected: true,
    chat: readChat('chat' in value ? value.chat : []) };
}
export function rankBoardAgents(agents: BoardAgent[]): BoardAgent[] {
  return [...agents].sort(
    (a, b) => (b.tools ?? -1) - (a.tools ?? -1) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}
export function readChat(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const username = label(item.username), message = label(item.message), timestamp = count(item.timestamp);
    return username && message && timestamp !== null ? [{ username, message, timestamp }] : [];
  }).slice(-100);
}

export function applyBoardChanges(data: BoardData, changes: unknown): BoardData {
  if (!Array.isArray(changes)) return data;
  let agents = [...data.agents], chat = [...(data.chat ?? [])], merges = data.merges;
  for (const change of changes) {
    if (!change || typeof change !== 'object') continue;
    if (change.kind === 'agent_upsert') {
      const agent = boardDataFromSnapshot({ agents: [change.agent] }).agents[0];
      if (agent) { agents = agents.filter(a => a.id !== agent.id); agents.push(agent); }
    } else if (change.kind === 'agent_remove') agents = agents.filter(a => a.id !== change.sessionId);
    else if (change.kind === 'chat_append') chat = [...chat, ...readChat([change.chat])].slice(-100);
    else if (change.kind === 'merge_count_set') merges = count(change.count) ?? merges;
  }
  return { ...data, agents, chat, merges };
}

export function factoryHost() {
  return ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'https://fluid-factory.onrender.com' : location.origin;
}
let chatSocket: WebSocket | null = null;
let maySendChat = false;
export function sendFactoryChat(message: string): boolean {
  const text = message.trim().slice(0, 500);
  if (!text || !maySendChat || chatSocket?.readyState !== WebSocket.OPEN) return false;
  chatSocket.send(JSON.stringify({ type: 'chat', message: text }));
  return true;
}

export function watchBoardData(onChange: (data: BoardData) => void) {
  const host = factoryHost();
  let previous: BoardData = { agents: [], merges: null, connected: false, chat: [] };
  let request: AbortController | null = null, socket: WebSocket | null = null;
  let stopped = false, revision: number | null = null, generation = 0;
  let identity = '', checkingLogin = false;
  let retry = 0, delay = 1000;
  const publish = () => { if (!stopped) onChange({ ...previous, canChat: maySendChat }); };
  async function refresh() {
    if (document.hidden || request || stopped || (socket?.readyState === WebSocket.OPEN && revision !== null)) return;
    const controller = new AbortController(), start = generation;
    request = controller;
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(new URL('/api/state', host), {
        signal: controller.signal, credentials: 'omit', cache: 'no-store',
      });
      if (!response.ok) throw new Error('Factory unavailable');
      const result = boardDataFromSnapshot(await response.json());
      if (start === generation) previous = result;
    } catch {
      if (start === generation) previous = { ...previous, connected: false };
    } finally { clearTimeout(timeout); request = null; }
    publish();
  }
  function connect() {
    if (stopped) return;
    const url = new URL('/ws', host); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(url); chatSocket = socket;
    socket.onopen = () => { delay = 1000; };
    socket.onmessage = event => {
      if (stopped) return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'auth_result') {
          maySendChat = host === location.origin && message.success === true;
          identity = maySendChat ? `${message.ownerId}:${message.username}` : '';
        } else if (message.type === 'world_snapshot') {
          previous = boardDataFromSnapshot(message.snapshot);
          revision = count(message.snapshot.revision); generation++;
        } else if (message.type === 'world_delta') {
          if (revision === null || message.delta?.previousRevision !== revision) {
            socket?.send(JSON.stringify({ type: 'request_state' })); return;
          }
          previous = applyBoardChanges(previous, message.delta.changes);
          revision = count(message.delta.revision); generation++;
        } else return;
        publish();
      } catch { /* An incomplete frame does not replace the last valid snapshot. */ }
    };
    socket.onerror = () => socket?.close();
    socket.onclose = () => {
      maySendChat = false; revision = null;
      previous = { ...previous, connected: false }; publish();
      if (!stopped) { retry = window.setTimeout(connect, delay); delay = Math.min(30000, delay * 2); }
    };
  }
  async function checkLogin() {
    // A sign-in in the existing factory tab becomes available when returning here.
    // Local previews never copy or proxy the live site's browser session.
    if (host !== location.origin || document.hidden || stopped || checkingLogin) return;
    checkingLogin = true;
    try {
      const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
      if (stopped || (!response.ok && response.status !== 401)) return;
      const session = await response.json();
      if (stopped) return;
      const next = response.ok && session.authenticated ? `${session.ownerId}:${session.username}` : '';
      if (next !== identity) {
        identity = next; maySendChat = false; publish();
        socket?.close(); // The next connection uses the current HttpOnly cookie.
      }
    } catch { /* Keep the last valid conversation during a network interruption. */ }
    finally { checkingLogin = false; }
  }
  const visible = () => { if (!document.hidden) { void refresh(); void checkLogin(); } };
  document.addEventListener('visibilitychange', visible);
  window.addEventListener('focus', visible);
  const timer = window.setInterval(() => void refresh(), 30000);
  connect(); void refresh();
  return () => {
    stopped = true; request?.abort(); clearTimeout(retry); clearInterval(timer);
    maySendChat = false; socket?.close(); chatSocket = null;
    document.removeEventListener('visibilitychange', visible);
    window.removeEventListener('focus', visible);
  };
}
