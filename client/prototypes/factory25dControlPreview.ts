import { DEFAULT_AVATAR, VALID_EMOTES } from '@shared/constants';
import { constrainFactoryStep, toFactoryWorld, WORKSTATIONS } from '@shared/factory25d-layout';
import { slotPosition } from '@shared/world-layouts';
import type { AvatarConfig, ControlInputState, WorldAgent, WorldSnapshot, WSMessageToClient, WSMessageToServer } from '@shared/types';
import { boardDataFromSnapshot, type BoardData } from './factory25dBoardData';
import './factory25dControlPreview.css';

const SCENARIOS = ['watching', 'connecting', 'empty', 'ready', 'claiming', 'controlling', 'reconnecting', 'expired', 'error'] as const;
type Scenario = typeof SCENARIOS[number];
const emptyInput = (): ControlInputState => ({ up: false, down: false, left: false, right: false });

/** Development-only in-memory transport. No sockets, login, hooks or persistent writes. */
export function createControlPreview(publish: (data: BoardData) => void,
  receive: (message: WSMessageToClient) => void, connection: (connected: boolean) => void,
  scenarioChanged: (scenario: Scenario, data: BoardData) => void) {
  const tools = document.createElement('details'); tools.className = 'factory-preview-tools pixel-island';
  const mobile = window.matchMedia('(max-width: 600px)'); tools.open = !mobile.matches;
  tools.setAttribute('aria-label', 'Local control preview');
  tools.innerHTML = '<summary>local playground</summary><p>sample agents · nothing is sent live</p><label>jump to a state <select aria-label="Preview control state"></select></label><p class="preview-current" role="status"></p><div class="preview-actions"><button class="preview-reset">reset</button><button class="preview-finish">finish connecting</button></div><a href="?">leave playground ↗</a>';
  const picker = tools.querySelector('select')!, finish = tools.querySelector<HTMLButtonElement>('.preview-finish')!;
  for (const scenario of SCENARIOS) picker.add(new Option(scenario === 'empty' ? 'connected · no agents' : scenario === 'error' ? 'claim denied' : scenario, scenario));
  document.body.append(tools);
  const controlPanel = document.querySelector<HTMLElement>('.factory-controls')!;
  const observer = new MutationObserver(() => {
    tools.querySelector('.preview-current')!.textContent = `now · ${controlPanel.dataset.state}`;
  });
  observer.observe(controlPanel, { attributes: true, attributeFilter: ['data-state'] });
  const previewHelp = document.createElement('p');
  previewHelp.textContent = 'in this playground, use “finish connecting” above. no terminal needed.';
  controlPanel.querySelector('.factory-connect-guide')!.append(previewHelp);
  const abort = new AbortController(), events = { signal: abort.signal };
  mobile.addEventListener('change', event => { tools.open = !event.matches; }, events);
  let scenario: Scenario = 'watching', epoch = 0, selected: string | undefined;
  let input = emptyInput(), world: WorldSnapshot;
  let look: AvatarConfig = { ...DEFAULT_AVATAR };
  const timers = new Set<ReturnType<typeof setTimeout>>();
  function later(fn: () => void, delay = 700) {
    const generation = epoch;
    const timer = setTimeout(() => { timers.delete(timer); if (generation === epoch) fn(); }, delay); timers.add(timer);
  }
  function connected() { return scenario !== 'reconnecting'; }
  function authenticated() { return !['watching', 'connecting', 'expired'].includes(scenario) && connected(); }
  function data(): BoardData {
    return { ...boardDataFromSnapshot(world), connected: connected(), world,
      canChat: authenticated(), principal: authenticated() ? { ownerId: 'preview-owner', username: 'you · preview' } : undefined };
  }
  function update() {
    world = { ...world, revision: world.revision + 1, serverTime: Date.now(), agents: [...world.agents] };
    publish(data());
  }
  function sample(id: string, slot: number, mine: boolean): WorldAgent {
    const position = slotPosition('factory25d', 'work', slot);
    return { sessionId: id, sessionName: mine ? slot === 1 ? 'your agent · preview' : 'patio agent · preview' : 'teammate · preview',
      username: mine ? 'you · preview' : 'teammate · preview', ownerId: mine ? 'preview-owner' : 'preview-teammate',
      avatar: mine ? { ...look } : { ...DEFAULT_AVATAR, color: '#cf945f', shirtColor: '#cf945f', hairStyle: 2 },
      cwd: '/local-playground', activity: 'reading', currentTool: null, subagents: [], startedAt: Date.now(), lastEventAt: Date.now(),
      world: { zone: 'work', slotIndex: slot, position, facing: 'down' } };
  }
  function reset(next: Scenario) {
    epoch++; for (const timer of timers) clearTimeout(timer); timers.clear();
    selected = undefined; input = emptyInput(); scenario = next; picker.value = next;
    finish.hidden = next !== 'connecting';
    world = { schemaVersion: 1, revision: 1, serverTime: Date.now(), environment: 'factory25d',
      agents: [sample('preview-teammate', 4, false), ...(next === 'empty' ? [] : [sample('preview-mine', 1, true), sample('preview-patio', 2, true)])],
      tombstones: [], chat: [], events: [] };
    connection(connected()); update(); scenarioChanged(next, data());
    const panel = document.querySelector<HTMLDetailsElement>('.factory-controls'); if (panel) panel.open = true;
  }
  picker.addEventListener('change', () => reset(picker.value as Scenario), events);
  tools.querySelector('.preview-reset')!.addEventListener('click', () => reset(scenario), events);
  finish.addEventListener('click', () => reset('ready'), events);
  const start = new URLSearchParams(location.search).get('controlsPreview');
  later(() => reset(SCENARIOS.includes(start as Scenario) ? start as Scenario : 'watching'), 0);
  let lastTick = Date.now();
  const tick = setInterval(() => {
    const now = Date.now(), dt = Math.min((now - lastTick) / 1000, 0.1); lastTick = now;
    if (!selected || !connected() || document.hidden) return;
    const agent = world.agents.find(agent => agent.sessionId === selected); if (!agent?.manualControl) return;
    const x = Number(input.right) - Number(input.left), y = Number(input.down) - Number(input.up);
    const distance = Math.hypot(x, y), before = agent.world.position;
    if (distance) {
      const position = constrainFactoryStep(before, { x: Math.max(8, Math.min(1272, before.x + x / distance * dt * 65)), y: Math.max(8, Math.min(728, before.y + y / distance * dt * 65)) });
      agent.world = { zone: 'manual', position, facing: x ? x > 0 ? 'right' : 'left' : y > 0 ? 'down' : 'up' };
      agent.manualControl = { ...position, facing: agent.world.facing, moving: position.x !== before.x || position.y !== before.y };
      update();
    } else if (agent.manualControl.moving) { agent.manualControl = { ...agent.manualControl, moving: false }; update(); }
  }, 50);
  return {
    connect() { reset('connecting'); },
    logout() { reset('watching'); },
    avatar(method: 'GET' | 'PUT', avatar?: AvatarConfig) {
      if (method === 'PUT' && avatar) {
        look = { ...avatar }; world.agents = world.agents.map(agent => agent.ownerId === 'preview-owner' ? { ...agent, avatar: { ...look } } : agent); update();
      }
      return { avatar: { ...look } };
    },
    send(message: WSMessageToServer): boolean {
      if (!authenticated()) return false;
      if (message.type === 'logout') { reset('watching'); return true; }
      if (message.type === 'chat') {
        world = { ...world, chat: [...world.chat, { username: 'you · preview', message: message.message, timestamp: Date.now() }] }; update(); return true;
      }
      if (!('sessionId' in message)) return false;
      const agent = world.agents.find(agent => agent.sessionId === message.sessionId && agent.ownerId === 'preview-owner');
      if (!agent) return false;
      if (message.type === 'control_claim') {
        if (scenario === 'claiming') return true;
        later(() => {
          if (scenario === 'error') { receive({ type: 'control_result', action: 'claim', sessionId: agent.sessionId, success: false, error: 'This agent is being controlled in another browser. Choose another agent or try again.' }); return; }
          selected = agent.sessionId;
          const position = agent.world.zone === 'work' ? toFactoryWorld({ x: WORKSTATIONS[agent.world.slotIndex!].x, z: WORKSTATIONS[agent.world.slotIndex!].z + 0.8 }) : agent.world.position;
          agent.world = { zone: 'manual', position, facing: 'down' };
          agent.manualControl = { ...position, facing: 'down', moving: false }; update();
          receive({ type: 'control_result', action: 'claim', sessionId: selected, success: true });
        });
      } else if (message.type === 'control_release') {
        epoch++; input = emptyInput(); selected = undefined; delete agent.manualControl; update();
        later(() => receive({ type: 'control_result', action: 'release', sessionId: agent.sessionId, success: true }), 0);
      } else if (message.type === 'control_input' && selected === agent.sessionId) input = { ...message.input };
      else if (message.type === 'emote' && VALID_EMOTES.includes(message.emote as never)) receive({ type: 'effect', effect: 'emote', sessionId: agent.sessionId, data: { emote: message.emote } });
      else if (message.type === 'shoot') receive({ type: 'effect', effect: 'shoot', sessionId: agent.sessionId, data: { facing: agent.world.facing } });
      else if (message.type === 'grab_start') later(() => receive({ type: 'grab_result', action: 'start', sessionId: agent.sessionId, success: true }), 0);
      else if (message.type === 'grab_end') {
        agent.world = { zone: message.workstationSlot === undefined ? 'manual' : 'work', slotIndex: message.workstationSlot, position: { x: message.x, y: message.y }, facing: 'down' };
        update(); later(() => receive({ type: 'grab_result', action: 'end', sessionId: agent.sessionId, success: true }), 0);
      }
      return true;
    },
    dispose() { epoch++; for (const timer of timers) clearTimeout(timer); clearInterval(tick); observer.disconnect(); previewHelp.remove(); abort.abort(); tools.remove(); },
  };
}
