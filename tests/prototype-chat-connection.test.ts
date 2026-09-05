import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { watchBoardData, sendFactoryChat, type BoardData } from '../client/prototypes/factory25dBoardData';
import { StateManager } from '../server/state';
import { DEFAULT_AVATAR } from '../shared/constants';

class FactorySocket {
  static OPEN = 1;
  static instances: FactorySocket[] = [];
  readyState = 1;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
  sent: unknown[] = [];
  constructor(readonly url: URL) { FactorySocket.instances.push(this); }
  send(value: string) { this.sent.push(JSON.parse(value)); }
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
  close() { this.readyState = 3; this.onclose?.(); }
}
let stop: (() => void) | undefined;
let changes: BoardData[];
const chat = { username: 'Ada', message: 'existing conversation', timestamp: 42 };
const snapshot = (revision: number, messages = [chat]) => ({ agents: [], chat: messages, revision });
const latest = () => changes.at(-1)!;

beforeEach(() => {
  vi.useFakeTimers(); FactorySocket.instances = []; changes = [];
  vi.stubGlobal('WebSocket', FactorySocket);
  vi.stubGlobal('location', { hostname: 'factory.example', origin: 'https://factory.example' });
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
  vi.stubGlobal('window', Object.assign(new EventTarget(), { setTimeout, setInterval }));
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
});
afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

it('uses snapshots and ordered deltas, asks for missing history, and keeps messages on disconnect', () => {
  stop = watchBoardData(data => changes.push(data));
  const socket = FactorySocket.instances[0];
  socket.receive({ type: 'world_snapshot', snapshot: snapshot(10) });
  expect(latest().chat).toEqual([chat]);
  const next = { ...chat, message: 'second message', timestamp: 43 };
  socket.receive({ type: 'world_delta', delta: { previousRevision: 10, revision: 11, changes: [{ kind: 'chat_append', chat: next }] } });
  expect(latest().chat).toEqual([chat, next]);
  socket.receive({ type: 'world_delta', delta: { previousRevision: 12, revision: 13, changes: [{ kind: 'chat_append', chat: next }] } });
  expect(socket.sent).toEqual([{ type: 'request_state' }]);
  expect(latest().chat).toHaveLength(2);
  socket.close();
  expect(latest()).toMatchObject({ connected: false, canChat: false, chat: [chat, next] });
  vi.advanceTimersByTime(1000);
  FactorySocket.instances[1].receive({ type: 'world_snapshot', snapshot: snapshot(13, [chat, next]) });
  expect(latest()).toMatchObject({ connected: true, chat: [chat, next] });
});

it('sends the current site chat message shape only after same-origin browser authentication', () => {
  stop = watchBoardData(data => changes.push(data));
  const socket = FactorySocket.instances[0];
  socket.receive({ type: 'world_snapshot', snapshot: snapshot(1) });
  expect(sendFactoryChat('hello')).toBe(false);
  socket.receive({ type: 'auth_result', success: true, username: 'Ada', ownerId: 'ada' });
  expect(sendFactoryChat('  hello  ')).toBe(true);
  expect(socket.sent).toEqual([{ type: 'chat', message: 'hello' }]);
  expect(latest().chat).toEqual([chat]); // Wait for the authoritative echo.
  socket.close();
  expect(sendFactoryChat('keep my draft')).toBe(false);
});

it('reads live history from localhost without using remote login cookies or sending chat', () => {
  vi.stubGlobal('location', { hostname: 'localhost', origin: 'http://localhost:5173' });
  stop = watchBoardData(data => changes.push(data));
  const socket = FactorySocket.instances[0];
  expect(socket.url.href).toBe('wss://fluid-factory.onrender.com/ws');
  socket.receive({ type: 'world_snapshot', snapshot: snapshot(1) });
  socket.receive({ type: 'auth_result', success: true });
  expect(latest().chat).toEqual([chat]);
  expect(sendFactoryChat('hello')).toBe(false);
  expect(fetch).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ credentials: 'omit' }));
});

it('picks up a changed same-origin login on return to the tab', async () => {
  stop = watchBoardData(data => changes.push(data));
  const socket = FactorySocket.instances[0];
  socket.receive({ type: 'world_snapshot', snapshot: snapshot(1) });
  vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ authenticated: true, username: 'Ada', ownerId: 'ada' }) } as Response);
  window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(0);
  expect(socket.readyState).toBe(3);
  expect(latest().chat).toEqual([chat]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(FactorySocket.instances).toHaveLength(2);
});

it('keeps customized agents, children and station changes in the same revision stream as chat', () => {
  const state = new StateManager('factory25d', () => 1000);
  state.handleHookEvent({hook_event_name:'SessionStart',session_id:'ada',username:'Ada',ownerId:'owner',cwd:'/work',avatar:{...DEFAULT_AVATAR,shirtColor:'#ff9900'}});
  stop = watchBoardData(data => changes.push(data));
  const socket = FactorySocket.instances[0], initial = state.getSnapshot();
  socket.receive({type:'world_snapshot',snapshot:initial});
  expect(latest().world?.agents[0].avatar.shirtColor).toBe('#ff9900');
  state.onStateChange(event => { if(event.type==='delta') socket.receive({type:'world_delta',delta:event.delta}); });
  state.handleHookEvent({hook_event_name:'SubagentStart',session_id:'ada',username:'Ada',cwd:'/work',agent_id:'child',agent_type:'research'});
  state.assignWorkstation('ada',17);
  state.appendChat(chat);
  expect(latest().world?.agents[0].subagents[0].agentId).toBe('child');
  expect(latest().world?.agents[0].world.slotIndex).toBe(17);
  expect(latest().world?.chat).toEqual(latest().chat);
  socket.close();
  vi.advanceTimersByTime(1000);
  FactorySocket.instances[1].receive({type:'world_snapshot',snapshot:state.getSnapshot()});
  expect(latest().world?.agents).toEqual(state.getSnapshot().agents);
  expect(latest().chat).toEqual([chat]);
});
