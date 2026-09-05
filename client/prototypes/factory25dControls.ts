import * as THREE from 'three';
import type { Position, WSMessageToServer } from '@shared/types';
import { VALID_EMOTES } from '@shared/constants';
import { toFactoryWorld, fromFactoryWorld, WORKSTATIONS } from '@shared/factory25d-layout';
import { nearestWorkstationSlot, slotPosition } from '@shared/world-layouts';
import { AuthManager } from '../auth/AuthManager';
import { GrabManager } from '../grab/GrabManager';
import { FactoryControlState } from './factory25dControlState';
import { factoryHost, onFactoryConnection, onFactoryMessage, sendFactoryCommand, type BoardData } from './factory25dBoardData';
import type { createLiveAgents } from './factory25dLiveAgents';

export function createFactoryControls(canvas: HTMLCanvasElement, agents: ReturnType<typeof createLiveAgents>,
  camera: () => THREE.Camera, available: () => boolean, visit: (patio: boolean) => void) {
  const state = new FactoryControlState(sendFactoryCommand);
  const abort = new AbortController(), options = { signal: abort.signal };
  let data: BoardData = { agents: [], connected: false, merges: null };
  const panel = document.createElement('details'); panel.className = 'factory-controls pixel-island';
  panel.innerHTML = `<summary role="button" aria-label="Agent controls">agents <span class="factory-connection">connecting</span></summary>
    <div class="factory-control-content"><p class="factory-auth"></p><div class="factory-session-actions"></div>
    <label>your agent <select aria-label="Choose your agent"></select></label>
    <div class="factory-action-row"><button class="factory-claim">take control</button><button class="factory-release">release</button><button class="factory-visit">find agent</button></div>
    <label>workstation <select class="factory-station" aria-label="Choose a workstation"></select></label><button class="factory-place">place at station</button>
    <div class="factory-movement" aria-label="Movement controls"><button data-direction="up" aria-label="Move up">↑</button><button data-direction="left" aria-label="Move left">←</button><button data-direction="down" aria-label="Move down">↓</button><button data-direction="right" aria-label="Move right">→</button></div>
    <div class="factory-action-row"><button class="factory-shoot">shoot</button><select class="factory-emote" aria-label="Choose an emote"></select><button class="factory-express">emote</button></div>
    <p class="factory-key-help">wasd to move · space to shoot · escape to release<br>drag an avatar to a free station</p><p class="factory-control-status" role="status"></p></div>`;
  document.body.append(panel);
  const picker = panel.querySelector<HTMLSelectElement>('select')!;
  const claim = panel.querySelector<HTMLButtonElement>('.factory-claim')!;
  const release = panel.querySelector<HTMLButtonElement>('.factory-release')!;
  const status = panel.querySelector<HTMLElement>('.factory-control-status')!;
  const emotes = panel.querySelector<HTMLSelectElement>('.factory-emote')!;
  for (const emote of VALID_EMOTES) { const option = document.createElement('option'); option.value = option.textContent = emote; emotes.add(option); }
  const auth = new AuthManager();
  let signature = '', connectionError = '';
  let placement: { sessionId: string; x: number; y: number; workstationSlot: number } | undefined;
  const stationPicker = panel.querySelector<HTMLSelectElement>('.factory-station')!;
  const placeButton = panel.querySelector<HTMLButtonElement>('.factory-place')!;
  for (const [index, station] of WORKSTATIONS.entries()) { const option = document.createElement('option'); option.value = String(index); option.textContent = `${station.room === 'patio' ? 'patio' : 'indoors'} · ${station.label} ${station.id.split('-').at(-1)}`; stationPicker.add(option); }
  const held = new Map<string, Position>();
  const listeners = new Map<string, Set<(...args: never[]) => void>>();
  const input = {
    on(name: string, fn: (...args: never[]) => void) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(fn); },
    off(name: string, fn: (...args: never[]) => void) { listeners.get(name)?.delete(fn); },
  };
  const emit = (name: string, ...args: unknown[]) => listeners.get(name)?.forEach(fn => fn(...args as never[]));
  const grab = new GrabManager({ input }, { get isLoggedIn() { return !!data.canChat && data.world?.environment === 'factory25d'; } },
    { send: message => { sendFactoryCommand(message as WSMessageToServer); } }, {
      get isVortexActive() { return data.world?.events.some(event => event.effect === 'vortex' && event.expiresAt > Date.now()) ?? false; },
      resolveGrabTarget(object) { const id = (object as unknown as THREE.Object3D).userData.sessionId; return id ? { sessionId: id } : null; },
      hasGrabTarget: target => agents.entries.has(target.sessionId),
      beginGrab(target, pointer) { held.set(target.sessionId, pointer); return true; },
      applyRemoteGrab: (target, pointer) => { held.set(target.sessionId, pointer); },
      moveGrab: (target, pointer) => { held.set(target.sessionId, pointer); },
      releaseGrab: target => { held.delete(target.sessionId); },
      workstationDropSlot: target => { const pointer = held.get(target.sessionId); return pointer && data.world ? nearestWorkstationSlot(data.world.environment, pointer, 36) : undefined; },
      showGrabHint: (_target, text) => { status.textContent = text; },
    });
  function paint() {
    panel.querySelector('.factory-connection')!.textContent = data.connected ? `${data.agents.length} live` : 'reconnecting';
    panel.querySelector('.factory-auth')!.textContent = data.principal ? `connected as ${data.principal.username}` : 'watching the shared factory';
    const list = state.owned(), next = JSON.stringify(list.map(a => [a.sessionId, a.sessionName, a.activity]));
    if (next !== signature) {
      const selected = picker.value; picker.replaceChildren(); signature = next;
      for (const agent of list) { const option = document.createElement('option'); option.value = agent.sessionId; option.textContent = `${agent.sessionName || agent.cwd.split('/').filter(Boolean).at(-1) || agent.username} · ${agent.sessionId.slice(-7)} · ${agent.activity}`; picker.add(option); }
      if (list.some(a => a.sessionId === selected)) picker.value = selected;
    }
    picker.disabled = list.length === 0 || !data.connected;
    const occupied = new Set(data.world?.agents.filter(a => a.world.zone === 'work' && a.sessionId !== picker.value).map(a => a.world.slotIndex));
    for (const tombstone of data.world?.tombstones ?? []) if (tombstone.sessionId !== picker.value) occupied.add(tombstone.slotIndex);
    for (const option of stationPicker.options) option.disabled = occupied.has(Number(option.value));
    stationPicker.disabled = !data.canChat || data.world?.environment !== 'factory25d';
    placeButton.disabled = picker.disabled || stationPicker.disabled || !!placement || stationPicker.selectedOptions[0]?.disabled === true;
    claim.disabled = picker.disabled || !!state.pending || picker.value === state.active;
    claim.textContent = state.pending ? 'connecting…' : state.active === picker.value ? 'controlling' : 'take control';
    release.disabled = !state.active && !state.pending;
    for (const button of panel.querySelectorAll<HTMLButtonElement>('.factory-movement button, .factory-shoot, .factory-express')) button.disabled = !state.active;
    status.textContent = connectionError || state.error || (state.active ? 'you’re in control' : data.principal && list.length === 0 ? 'your agents will appear here when they connect' : '');
    panel.classList.toggle('is-controlling', !!state.active);
  }
  function findAgent() {
    const entry = agents.entries.get(state.active ?? picker.value); if (entry) visit(entry.mesh.position.x > 8);
  }
  claim.addEventListener('click', () => { state.claim(picker.value); findAgent(); (document.activeElement as HTMLElement)?.blur(); paint(); }, options);
  release.addEventListener('click', () => { state.release(); paint(); }, options);
  picker.addEventListener('change', paint, options);
  stationPicker.addEventListener('change', paint, options);
  placeButton.addEventListener('click', () => {
    if (!data.world || !state.owned().some(a => a.sessionId === picker.value)) return;
    const slot = Number(stationPicker.value), point = slotPosition(data.world.environment, 'work', slot);
    state.release(); placement = { sessionId: picker.value, ...point, workstationSlot: slot };
    if (!sendFactoryCommand({ type: 'grab_start', sessionId: picker.value, ...point })) placement = undefined;
    paint();
  }, options);
  panel.querySelector('.factory-visit')!.addEventListener('click', findAgent, options);
  panel.querySelector('.factory-shoot')!.addEventListener('click', () => state.shoot(), options);
  panel.querySelector('.factory-express')!.addEventListener('click', () => state.emote(emotes.value), options);
  for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-direction]')) {
    const key = button.dataset.direction as 'up' | 'down' | 'left' | 'right';
    let pressedAt = 0;
    button.addEventListener('pointerdown', event => { pressedAt = performance.now(); event.preventDefault(); button.setPointerCapture(event.pointerId); state.move(key, true); }, options);
    button.addEventListener('keydown', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); state.move(key, true); } }, options);
    button.addEventListener('keyup', event => { if (event.key === ' ' || event.key === 'Enter') state.move(key, false); }, options);
    // A quick tap must span a server tick; assistive clicks have no pointerdown.
    button.addEventListener('click', event => {
      const heldFor = event.detail === 0 || !pressedAt ? 0 : performance.now() - pressedAt;
      if (heldFor < 140) { state.move(key, true); setTimeout(() => state.move(key, false), 140 - heldFor); }
      pressedAt = 0;
    }, options);
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, () => state.move(key, false), options);
  }
  const movementKeys: Record<string, 'up' | 'down' | 'left' | 'right'> = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };
  document.addEventListener('keydown', event => {
    if (!state.active || !available() || (event.target as HTMLElement)?.closest('input,textarea,select,button,[contenteditable="true"]')) return;
    const key = movementKeys[event.code];
    if (key) { event.preventDefault(); state.move(key, true); }
    else if (event.code === 'Space' && !event.repeat) { event.preventDefault(); state.shoot(); }
    else if (event.code === 'KeyB' && !event.repeat) { event.preventDefault(); panel.open = true; emotes.focus(); }
    else if (event.code === 'Escape') { event.preventDefault(); state.release(); paint(); }
  }, options);
  document.addEventListener('keyup', event => { const key = movementKeys[event.code]; if (key) state.move(key, false); }, options);
  const stop = () => { state.stop(); grab.release(); };
  window.addEventListener('blur', stop, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); }, options);
  const heartbeat = setInterval(() => { if (document.hidden || !available()) stop(); else state.heartbeat(); }, 500);
  const stopMessages = onFactoryMessage(message => {
    if (message.type === 'grab_result' && placement && message.sessionId === placement.sessionId) {
      if (message.success && message.action === 'start') sendFactoryCommand({ type: 'grab_end', ...placement });
      else { if (!message.success) state.error = message.error || 'That station is unavailable.'; else visit(WORKSTATIONS[placement.workstationSlot].room === 'patio'); placement = undefined; }
    }
    state.handle(message); grab.handleMessage(message); paint(); });
  const stopConnection = onFactoryConnection(connected => { placement = undefined; state.reset(); grab.handleConnected(); if (!connected) held.clear(); paint(); });
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point = new THREE.Vector3();
  function pointer(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), camera());
    if (!ray.ray.intersectPlane(plane, point)) return null;
    const world = toFactoryWorld(point); return { id: event.pointerId, worldX: world.x, worldY: world.y };
  }
  let dragPointer: number | undefined;
  const pointerOptions = { ...options, capture: true };
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !available()) return;
    const p = pointer(event); if (!p) return;
    const hit = ray.intersectObjects([...agents.entries.values()].map(entry => entry.mesh), false)[0];
    if (!hit) return;
    dragPointer = event.pointerId; event.preventDefault(); event.stopImmediatePropagation();
    state.stop(); canvas.setPointerCapture(event.pointerId); emit('gameobjectdown', p, hit.object);
  }, pointerOptions);
  canvas.addEventListener('pointermove', event => { if (dragPointer !== event.pointerId) return; event.stopImmediatePropagation(); const p = pointer(event); if (p) emit('pointermove', p); }, pointerOptions);
  canvas.addEventListener('pointerup', event => { if (dragPointer !== event.pointerId) return; dragPointer = undefined; event.stopImmediatePropagation(); const p = pointer(event); if (p) emit('pointerup', p); if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); }, pointerOptions);
  canvas.addEventListener('pointercancel', () => { dragPointer = undefined; grab.release(); }, options);
  const sessionActions = panel.querySelector('.factory-session-actions')!;
  const login = document.createElement('button'); login.textContent = 'connect this browser'; sessionActions.append(login);
  const logout = document.createElement('button'); logout.textContent = 'disconnect'; logout.hidden = true; sessionActions.append(logout);
  login.addEventListener('click', () => {
    if (factoryHost() !== location.origin) {
      const link = document.createElement('a'); link.href = new URL('/', factoryHost()).href; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'connect at the live factory ↗';
      sessionActions.append(link); login.hidden = true;
    } else status.textContent = 'Run agent-factory login on the machine whose agents you want to control, then return here.';
  }, options);
  logout.addEventListener('click', async () => { state.release(); grab.handleLoggedOut(); await auth.logout(); window.dispatchEvent(new Event('focus')); }, options);
  const exchangeHandoff = () => {
    if (factoryHost() !== location.origin) return;
    const fragment = new URLSearchParams(location.hash.slice(1)), code = fragment.get('handoff');
    if (code) {
      fragment.delete('handoff'); history.replaceState(null, '', `${location.pathname}${location.search}${fragment.size ? `#${fragment}` : ''}`);
      void auth.exchangeHandoff(code).then(ok => { if (ok) { connectionError = ''; window.dispatchEvent(new Event('focus')); } else { panel.open = true; connectionError = 'That connection link expired. Run agent-factory login again.'; paint(); } });
    }
  };
  window.addEventListener('hashchange', exchangeHandoff, options); exchangeHandoff();
  paint();
  return {
    state,
    guideMovement() {
      panel.open = true;
      if (state.active) { (document.activeElement as HTMLElement)?.blur(); return 'Use W/A/S/D or the arrow buttons to step onto a key'; }
      return data.principal ? 'Choose your agent and take control to walk on the keys' : 'Connect your browser to walk your agent on the keys';
    },
    sync(next: BoardData) {
      if (next === data) return;
      data = next; state.sync(next.world?.agents ?? [], next.principal?.ownerId);
      login.hidden = !!next.principal; logout.hidden = !next.principal; paint();
    },
    update() {
      if (!available()) stop();
      grab.update();
      for (const [id, pointer] of held) {
        const entry = agents.entries.get(id); if (!entry) continue;
        const target = fromFactoryWorld(pointer); agents.placeOverride(id, target);
      }
    },
    dispose() { stop(); state.release(); grab.destroy(); clearInterval(heartbeat); stopMessages(); stopConnection(); abort.abort(); panel.remove(); },
  };
}
