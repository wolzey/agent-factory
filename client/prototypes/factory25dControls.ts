import * as THREE from 'three';
import { intersectFactoryFloor } from './factory25dPatioPicking';
import type { Position, WSMessageToServer } from '@shared/types';
import { toFactoryWorld, fromFactoryWorld, WORKSTATIONS } from '@shared/factory25d-layout';
import { nearestWorkstationSlot, slotPosition } from '@shared/world-layouts';
import { AuthManager } from '../auth/AuthManager';
import { GrabManager } from '../grab/GrabManager';
import { FactoryControlState, factoryControlPhase } from './factory25dControlState';
import { factoryHost, forgetFactoryLogin, onFactoryConnection, onFactoryMessage, sendFactoryCommand, type BoardData,
  isControlPreview, onControlPreview, connectControlPreview, logoutControlPreview, previewAvatar } from './factory25dBoardData';
import type { createLiveAgents } from './factory25dLiveAgents';
import { createAvatarEditor, type AvatarScenePreview } from './factory25dAvatarEditor';
import { createEmoteBar } from './factory25dEmoteBar';
import './factory25dControls.css';

export function createFactoryControls(canvas: HTMLCanvasElement, agents: ReturnType<typeof createLiveAgents>,
  camera: () => THREE.Camera, available: () => boolean, visit: (patio: boolean) => void, avatarScene: AvatarScenePreview) {
  const state = new FactoryControlState(sendFactoryCommand);
  const preview = isControlPreview();
  const abort = new AbortController(), options = { signal: abort.signal };
  let data: BoardData = { agents: [], connected: false, merges: null };
  const panel = document.createElement('details'); panel.className = 'factory-controls pixel-island';
  panel.innerHTML = `<summary role="button" aria-label="Agent controls">agents <span class="factory-connection">connecting</span></summary>
    <div class="factory-control-content"><p class="factory-auth"></p><p class="factory-step-help"></p><div class="factory-session-actions"></div>
    <section class="factory-connect-guide" hidden><p>on the computer running your agents:</p><code>agent-factory login</code><button class="factory-copy-login">copy command</button><p>open the connection link it gives you, then return here.</p></section>
    <section class="factory-agent-section" hidden><label>your agent <select aria-label="Choose your agent"></select></label>
    <div class="factory-action-row"><button class="factory-claim">take control</button><button class="factory-release" hidden>release</button><button class="factory-visit">find agent</button></div>
    <details class="factory-station-section"><summary>move to a workstation</summary><label>workstation <select class="factory-station" aria-label="Choose a workstation"></select></label><button class="factory-place">place at station</button></details>
    <div class="factory-movement" aria-label="Movement controls"><button data-direction="up" aria-label="Move up">↑</button><button data-direction="left" aria-label="Move left">←</button><button data-direction="down" aria-label="Move down">↓</button><button data-direction="right" aria-label="Move right">→</button></div>
    <div class="factory-action-row factory-play-actions"><button class="factory-shoot">shoot</button><button class="factory-open-emotes">emotes · B</button></div>
    <p class="factory-key-help">W A S D to walk · space to shoot<br>B for emotes · escape to release</p></section><p class="factory-control-status" role="status" aria-live="polite"></p></div>`;
  document.body.append(panel);
  const picker = panel.querySelector<HTMLSelectElement>('select')!;
  const claim = panel.querySelector<HTMLButtonElement>('.factory-claim')!;
  const release = panel.querySelector<HTMLButtonElement>('.factory-release')!;
  const status = panel.querySelector<HTMLElement>('.factory-control-status')!;
  const emoteBar = createEmoteBar(emote => { state.emote(emote); }, () => { state.stop(); panel.open = false; });
  const auth = new AuthManager();
  let signature = '', connectionError = '', avatarNotice = '', connecting = false;
  let placement: { sessionId: string; x: number; y: number; workstationSlot: number } | undefined;
  const stationPicker = panel.querySelector<HTMLSelectElement>('.factory-station')!;
  const placeButton = panel.querySelector<HTMLButtonElement>('.factory-place')!;
  for (const [index, station] of WORKSTATIONS.entries()) { const option = document.createElement('option'); option.value = String(index); option.textContent = `${station.room === 'patio' ? 'patio' : 'indoors'} · ${station.label} ${Number(station.id.split('-').at(-1)) + 1}`; stationPicker.add(option); }
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
  const avatarEditor = createAvatarEditor(
    () => preview || factoryHost() === location.origin ? data.principal : undefined,
    () => { state.release(); grab.release(); avatarNotice = ''; paint(); },
    () => { avatarNotice = preview ? 'avatar saved in this playground' : 'avatar saved for your agents'; paint(); },
    avatarScene, preview ? previewAvatar : undefined);
  const editAvatar = document.createElement('button'); editAvatar.textContent = 'edit avatar';
  editAvatar.className = 'factory-edit-avatar';
  panel.querySelector('.factory-session-actions')!.append(editAvatar);
  editAvatar.addEventListener('click', () => { void avatarEditor.open(); }, options);
  function paint() {
    const phase = factoryControlPhase(state, data.connected, connecting, connectionError);
    if (panel.dataset.state !== phase) panel.dataset.state = phase;
    panel.querySelector('.factory-connection')!.textContent = state.active ? 'you’re in control' : data.connected ? `${data.agents.length} ${preview ? 'sample' : 'live'}` : 'reconnecting';
    panel.querySelector('.factory-auth')!.textContent = data.principal ? `connected as ${data.principal.username}` : preview ? 'watching the local playground' : 'watching the shared factory';
    const help = {
      watching: 'look around, or connect to join with your agents.',
      connecting: 'connect once to unlock your agents in this browser.',
      empty: 'you’re connected. your agents will appear here when you start a session.',
      ready: 'choose an agent, then take control to walk around.',
      claiming: 'waiting for the factory to hand you the controls…',
      controlling: 'you’re in. walk around or pick a reaction from the emote bar.',
      reconnecting: 'reconnecting to the factory. movement is paused.',
      error: 'we couldn’t finish that step. you can try again.',
    };
    panel.querySelector('.factory-step-help')!.textContent = help[phase];
    panel.querySelector<HTMLElement>('.factory-connect-guide')!.hidden = !connecting || !!data.principal;
    const list = state.owned(), next = JSON.stringify(list.map(a => [a.sessionId, a.sessionName, a.activity]));
    if (next !== signature) {
      const selected = picker.value; picker.replaceChildren(); signature = next;
      for (const agent of list) { const option = document.createElement('option'); option.value = agent.sessionId; option.textContent = `${agent.sessionName || agent.cwd.split('/').filter(Boolean).at(-1) || agent.username} · ${agent.activity}`; picker.add(option); }
      if (list.some(a => a.sessionId === selected)) picker.value = selected;
    }
    picker.disabled = list.length === 0 || !data.connected;
    panel.querySelector<HTMLElement>('.factory-agent-section')!.hidden = picker.disabled;
    const occupied = new Set(data.world?.agents.filter(a => a.world.zone === 'work' && a.sessionId !== picker.value).map(a => a.world.slotIndex));
    for (const tombstone of data.world?.tombstones ?? []) if (tombstone.sessionId !== picker.value) occupied.add(tombstone.slotIndex);
    for (const option of stationPicker.options) option.disabled = occupied.has(Number(option.value));
    if (stationPicker.selectedOptions[0]?.disabled) stationPicker.value = [...stationPicker.options].find(option => !option.disabled)?.value ?? '';
    stationPicker.disabled = !data.canChat || data.world?.environment !== 'factory25d';
    placeButton.disabled = picker.disabled || stationPicker.disabled || !!placement || !stationPicker.selectedOptions.length || stationPicker.selectedOptions[0]?.disabled === true;
    claim.disabled = picker.disabled || !!state.pending || picker.value === state.active;
    claim.textContent = state.pending ? 'connecting…' : state.active === picker.value ? 'controlling' : 'take control';
    release.disabled = !state.active && !state.pending;
    release.hidden = release.disabled;
    claim.hidden = !!state.active && picker.value === state.active;
    release.textContent = state.pending ? 'cancel' : 'release';
    for (const button of panel.querySelectorAll<HTMLButtonElement>('.factory-movement button, .factory-shoot, .factory-open-emotes')) button.disabled = !state.active;
    status.textContent = connectionError || state.error;
    panel.classList.toggle('is-controlling', !!state.active);
    editAvatar.hidden = !data.principal;
    editAvatar.disabled = !data.principal || (!preview && factoryHost() !== location.origin);
    editAvatar.title = editAvatar.disabled ? 'Connect this browser at the factory to edit your avatar' : 'Customize the look of your agents';
    if (avatarNotice && !connectionError && !state.error) status.textContent = avatarNotice;
    emoteBar.sync(!!state.active, available());
  }
  function findAgent() {
    const entry = agents.entries.get(state.active ?? picker.value); if (entry) visit(entry.mesh.position.x > 8);
  }
  claim.addEventListener('click', () => { state.claim(picker.value); findAgent(); (document.activeElement as HTMLElement)?.blur(); paint(); }, options);
  release.addEventListener('click', () => { state.release(); paint(); }, options);
  picker.addEventListener('change', () => { state.release(); state.error = ''; paint(); }, options);
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
  panel.querySelector('.factory-open-emotes')!.addEventListener('click', () => emoteBar.open(), options);
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
    else if (event.code === 'KeyB' && !event.repeat) { event.preventDefault(); emoteBar.open(); }
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
  const stopConnection = onFactoryConnection(connected => { placement = undefined; state.reset(); grab.handleConnected(); if (!connected) held.clear(); data = { ...data, connected }; paint(); });
  const ray = new THREE.Raycaster(), point = new THREE.Vector3();
  function pointer(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), camera());
    if (!intersectFactoryFloor(ray.ray, point)) return null;
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
  async function logOut() {
    if (preview) { avatarEditor.invalidate(); state.release(); grab.handleLoggedOut(); held.clear(); logoutControlPreview(); return true; }
    if (factoryHost() !== location.origin) return false;
    avatarEditor.invalidate();
    state.release(); grab.handleLoggedOut(); held.clear();
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Logout failed');
      connectionError = '';
      sendFactoryCommand({ type: 'logout' });
      forgetFactoryLogin();
      return true;
    } catch {
      connectionError = 'Couldn’t disconnect. Check your connection and try again.'; paint();
      return false;
    }
  }
  login.addEventListener('click', () => {
    connectionError = ''; state.error = ''; connecting = true;
    if (preview) { connectControlPreview(); paint(); return; }
    if (factoryHost() !== location.origin) {
      const link = document.createElement('a'); link.href = new URL('/', factoryHost()).href; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'connect at the live factory ↗';
      sessionActions.append(link); login.hidden = true;
    }
    paint();
  }, options);
  panel.querySelector('.factory-copy-login')!.addEventListener('click', () => {
    void navigator.clipboard.writeText('agent-factory login').then(() => {
      status.textContent = 'copied. paste it in the terminal where your agents run.';
    }).catch(() => { status.textContent = 'select the command above to copy it.'; });
  }, options);
  logout.addEventListener('click', () => { void logOut(); }, options);
  const exchangeHandoff = () => {
    if (preview || factoryHost() !== location.origin) return;
    const fragment = new URLSearchParams(location.hash.slice(1)), code = fragment.get('handoff');
    if (code) {
      fragment.delete('handoff'); history.replaceState(null, '', `${location.pathname}${location.search}${fragment.size ? `#${fragment}` : ''}`);
      void auth.exchangeHandoff(code).then(ok => { if (ok) { connectionError = ''; window.dispatchEvent(new Event('focus')); } else { panel.open = true; connectionError = 'That connection link expired. Run agent-factory login again.'; paint(); } });
    }
  };
  window.addEventListener('hashchange', exchangeHandoff, options); exchangeHandoff();
  function syncData(next: BoardData) {
    if (data.principal?.ownerId !== next.principal?.ownerId) { avatarNotice = ''; if (next.principal) { connecting = false; connectionError = ''; state.error = ''; } }
    data = next; state.sync(next.world?.agents ?? [], next.principal?.ownerId); avatarEditor.sync();
    login.hidden = !!next.principal; login.disabled = !next.connected;
    logout.hidden = !next.principal; paint();
  }
  const stopPreview = onControlPreview((scenario, next) => {
    state.reset(); state.error = ''; connectionError = ''; connecting = scenario === 'connecting' || scenario === 'expired';
    avatarEditor.invalidate(); visit(false); syncData(next);
    panel.querySelector<HTMLDetailsElement>('.factory-station-section')!.open = false;
    if (scenario === 'expired') connectionError = 'That connection link expired. Connect again to get a fresh link.';
    if (['claiming', 'controlling', 'error'].includes(scenario)) state.claim(picker.value);
    paint();
  });
  paint();
  return {
    state,
    getTargetSessionId() {
      const target = state.active ?? picker.value;
      return state.owned().some(agent => agent.sessionId === target) ? target : null;
    },
    logout: logOut,
    guideMovement() {
      panel.open = true;
      if (state.active) { (document.activeElement as HTMLElement)?.blur(); return 'Use W/A/S/D or the arrow buttons to step onto a key'; }
      return data.principal ? 'Choose your agent and take control to walk on the keys' : 'Connect your browser to walk your agent on the keys';
    },
    sync(next: BoardData) {
      if (next === data) return;
      syncData(next);
    },
    update() {
      emoteBar.sync(!!state.active, available());
      if (!available()) stop();
      grab.update();
      for (const [id, pointer] of held) {
        const entry = agents.entries.get(id); if (!entry) continue;
        const target = fromFactoryWorld(pointer); agents.placeOverride(id, target);
      }
    },
    dispose() { avatarEditor.dispose(); emoteBar.dispose(); stop(); state.release(); grab.destroy(); clearInterval(heartbeat); stopMessages(); stopConnection(); stopPreview(); abort.abort(); panel.remove(); },
  };
}
