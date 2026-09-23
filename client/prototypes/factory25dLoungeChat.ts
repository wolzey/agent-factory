import * as THREE from 'three';
import { factoryHost, onFactoryConnection, onFactoryMessage, sendFactoryCommand, type BoardData } from './factory25dBoardData';
import type { AvatarConfig, ChatMessage } from '@shared/types';
import { CHAT_MESSAGE_MAX_LENGTH } from '@shared/constants';
import type { TeamMember } from '@shared/team';
import { ChatCommandHistory, chatSuggestions, completeChatSuggestion, executeChatCommand, type ChatSuggestion } from './factory25dChatCommands';
import './factory25dChatCommands.css';
import { blendCamera, cameraPose, type CameraPose } from './factory25dCameraMotion';
import { createPhoneMessage } from './factory25dPhoneMessages';
import { avatarPortrait, createProfilePortrait } from './factory25dPortrait';
import { createLoungePhone, phoneCameraPose, PHONE } from './factory25dLoungePhone';
import { minimizedPlayerBounds } from './factory25dPlayerSpace';
import { PhoneMessageArrivals, PhoneUnreadReminders } from './factory25dPhoneNotifications';
import './factory25dLoungePhone.css';

export interface LoungeChatCommands {
  getTargetSessionId: () => string | null | undefined;
  logout: () => Promise<boolean>;
  /** Return false when another focused view must be closed first. */
  requestRoom: () => boolean;
}
export interface PhoneNotificationSounds { buzz?: () => void; stop?: () => void }

/** The existing live conversation is projected onto the phone on the lounge table. */
export function createLoungeChat(
  parent: THREE.Group,
  canvas: HTMLCanvasElement,
  roomCamera: THREE.OrthographicCamera,
  renderer: THREE.WebGLRenderer,
  getMembers: () => readonly TeamMember[],
) {
  const abort = new AbortController(), options = { signal: abort.signal };
  let integration: LoungeChatCommands | undefined;
  let queuedEntry = false, focusComposer = false, submitting = false;
  let focusInputOnArrival = false;
  let localMessages: ChatMessage[] = [];
  const history = new ChatCommandHistory();
  let suggestions: ChatSuggestion[] = [], activeSuggestion = -1;
  const handset = createLoungePhone(parent), board = handset.phone;

  const button = document.createElement('button');
  button.type = 'button'; button.className = 'lounge-chat';
  button.setAttribute('aria-label', 'Open lounge chat'); button.title = 'Open the lounge phone (C)';
  canvas.parentElement!.append(button);
  const view = document.createElement('section');
  view.className = 'lounge-chat-view';
  view.setAttribute('aria-hidden', 'true');
  view.setAttribute('aria-labelledby', 'lounge-chat-heading');
  const sheet = document.createElement('div'); sheet.className = 'lounge-chat-sheet lounge-phone'; sheet.inert = true;
  const header = document.createElement('header'); header.className = 'phone-header';
  const groupFaces = document.createElement('div'); groupFaces.className = 'phone-group-faces'; groupFaces.setAttribute('aria-hidden', 'true');
  const heading = document.createElement('h2');
  heading.id = 'lounge-chat-heading'; heading.textContent = 'the lounge';
  const list = document.createElement('div'); list.className = 'lounge-messages';
  list.setAttribute('role', 'log'); list.setAttribute('aria-label', 'Factory messages');
  list.setAttribute('aria-live', 'polite'); list.tabIndex = 0;
  const count = document.createElement('span'); count.className = 'lounge-chat-count';
  header.append(groupFaces, heading, count); sheet.append(header, list);
  const dock = document.createElement('div'); dock.className = 'lounge-chat-dock pixel-island'; dock.hidden = true;
  const back = document.createElement('button'); back.type = 'button'; back.textContent = '← lounge';
  const form = document.createElement('form');
  const input = document.createElement('input');
  input.type = 'text'; input.maxLength = CHAT_MESSAGE_MAX_LENGTH + '/chat '.length; // The server keeps 200 characters. input.placeholder = 'message the lounge';
  input.autocomplete = 'off'; input.spellcheck = false; input.setAttribute('aria-label', 'Message to the factory');
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', 'lounge-chat-suggestions'); input.setAttribute('aria-expanded', 'false');
  try { input.value = sessionStorage.getItem('factory-chat-draft') ?? ''; } catch { /* Storage may be unavailable. */ }
  const saveDraft = () => { try { if (input.value) sessionStorage.setItem('factory-chat-draft', input.value); else sessionStorage.removeItem('factory-chat-draft'); } catch { /* Keep the in-memory draft. */ } };
  const suggestionsEl = document.createElement('div'); suggestionsEl.className = 'lounge-chat-suggestions';
  suggestionsEl.id = 'lounge-chat-suggestions'; suggestionsEl.hidden = true;
  suggestionsEl.setAttribute('role', 'listbox'); suggestionsEl.setAttribute('aria-label', 'Chat commands');
  const send = document.createElement('button'); send.type = 'submit'; send.textContent = '↑'; send.setAttribute('aria-label', 'Send message');
  form.append(input, send);
  const status = document.createElement('span'); status.className = 'lounge-chat-status';
  status.setAttribute('role', 'status');
  const login = document.createElement('a'); login.href = factoryHost();
  login.target = '_blank'; login.rel = 'noopener'; login.textContent = 'sign in at the factory ↗';
  const composer = document.createElement('footer'); composer.className = 'phone-composer'; composer.append(form, status, login);
  sheet.append(composer); dock.append(back);
  view.append(sheet, dock, suggestionsEl); canvas.parentElement!.append(view);
  const soundPanel = document.querySelector<HTMLElement>('.scene-sound');
  // The island may adopt the panel after this module is built; read its home when borrowing it.
  function hideSuggestions() {
    suggestions = []; activeSuggestion = -1; suggestionsEl.hidden = true;
    input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
  }
  function positionSuggestions() {
    const rect = form.getBoundingClientRect();
    Object.assign(suggestionsEl.style, { left: `${rect.left}px`, bottom: `${window.innerHeight - rect.top + 8}px`, width: `${rect.width}px` });
  }
  function applySuggestion(suggestion: ChatSuggestion) {
    input.value = completeChatSuggestion(suggestion); saveDraft(); input.focus();
    if (input.value.endsWith(' ')) updateSuggestions(); else hideSuggestions();
  }
  function renderSuggestions() {
    suggestionsEl.replaceChildren();
    suggestions.forEach((suggestion, index) => {
      const option = document.createElement('button'); option.type = 'button'; option.tabIndex = -1;
      option.id = `lounge-chat-option-${index}`; option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(index === activeSuggestion));
      const name = document.createElement('span'); name.textContent = suggestion.text;
      const description = document.createElement('small'); description.textContent = suggestion.description;
      option.append(name, description); option.addEventListener('click', () => applySuggestion(suggestion), options);
      suggestionsEl.append(option);
    });
    input.setAttribute('aria-activedescendant', `lounge-chat-option-${activeSuggestion}`);
    suggestionsEl.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  function updateSuggestions() {
    suggestions = chatSuggestions(input.value);
    if (!suggestions.length) { hideSuggestions(); return; }
    activeSuggestion = 0; suggestionsEl.hidden = false;
    input.setAttribute('aria-expanded', 'true'); positionSuggestions(); renderSuggestions();
  }
  function showLocal(message: string) {
    localMessages = [...localMessages, { username: 'system', message, timestamp: Date.now() }].slice(-50);
    if (lastData) refresh(lastData);
    list.scrollTop = list.scrollHeight;
  }
  suggestionsEl.addEventListener('pointerdown', event => event.preventDefault(), options);
  input.addEventListener('input', () => { history.editing(); saveDraft(); updateSuggestions(); }, options);
  input.addEventListener('focus', positionSuggestions, options);
  input.addEventListener('blur', () => { hideSuggestions(); saveDraft(); }, options);
  window.addEventListener('pagehide', saveDraft, options);
  window.addEventListener('factory-before-refresh', saveDraft, options);
  input.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'Escape') {
      if (suggestions.length) { event.preventDefault(); event.stopPropagation(); hideSuggestions(); }
      return;
    }
    if (suggestions.length && (event.key === 'Tab' || event.key === 'Enter' && activeSuggestion >= 0)) {
      event.preventDefault(); event.stopPropagation(); applySuggestion(suggestions[Math.max(0, activeSuggestion)]); return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault(); event.stopPropagation();
      if (suggestions.length) {
        activeSuggestion = (activeSuggestion + (event.key === 'ArrowUp' ? -1 : 1) + suggestions.length) % suggestions.length; renderSuggestions();
      } else { input.value = event.key === 'ArrowUp' ? history.previous(input.value) : history.next(); saveDraft(); }
    }
  }, options);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const value = input.value;
    if (!value.trim() || submitting) return;
    submitting = true; send.disabled = true; hideSuggestions();
    const data = lastData;
    const result = await executeChatCommand(value, {
      connected: !!data?.connected, authenticated: !!data?.canChat, sameOrigin: factoryHost() === location.origin,
      ownerId: data?.principal?.ownerId, agents: data?.world?.agents ?? [], targetSessionId: integration?.getTargetSessionId(),
    }, {
      send: sendFactoryCommand, local: showLocal,
      vortex: async () => {
        const response = await fetch('/api/vortex', { method: 'POST', credentials: 'same-origin', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]) });
        if (!response.ok) return false;
        const result = await response.json(); return result.ok === true;
      },
      logout: () => integration?.logout() ?? Promise.resolve(false),
    });
    if (abort.signal.aborted) return;
    submitting = false; send.disabled = false; history.remember(value);
    if (result.clear && input.value === value) input.value = '';
    saveDraft(); status.textContent = result.status;
  }, options);

  const camera = roomCamera.clone();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let open = false, active = false, canOpen = false;
  let started = 0, moving = false;
  let from = cameraPose(roomCamera), room = cameraPose(roomCamera);
  let lastWidth = 0, lastHeight = 0;
  let signature = '', stateSignature = '', portraitSignature = '';
  let lastMembers: readonly TeamMember[] | undefined;
  let renderedMessages: ChatMessage[] = [];
  let lastData: BoardData | null = null;
  let layoutWidth = 360, panelProgress = 0, panelFrom = 0;
  const focus = new THREE.Vector3();
  const arrivals = new PhoneMessageArrivals();
  const reminders = new PhoneUnreadReminders();
  let notificationSounds: PhoneNotificationSounds = {};
  let notificationPlaying = false;
  function cancelNotification() {
    handset.updateNotification(performance.now(), reduced.matches, false);
    if (notificationPlaying) notificationSounds.stop?.();
    notificationPlaying = false; button.dataset.notification = 'false';
  }
  function notify(now: number) {
    if (handset.notify(now)) { notificationPlaying = true; notificationSounds.buzz?.(); }
  }
  const stopMessages = onFactoryMessage(message => {
    const incoming = arrivals.receive(message);
    if (!incoming || active) return;
    const now = performance.now(), eligible = canOpen && !document.hidden;
    reminders.arrive(now, eligible);
    if (eligible) notify(now);
  });
  const stopConnection = onFactoryConnection(connected => {
    if (!connected) { arrivals.disconnect(); reminders.pause(); cancelNotification(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { reminders.pause(); cancelNotification(); } }, options);

  function fit() {
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const pixels = Math.min(1280, Math.max(360, canvas.clientWidth));
    renderer.setSize(pixels, Math.round(pixels / aspect), false);
    lastWidth = canvas.clientWidth; lastHeight = canvas.clientHeight;
  }
  function closePose(): CameraPose {
    board.updateWorldMatrix(true, false); board.localToWorld(focus.set(0, 0, PHONE.faceZ));
    const player = minimizedPlayerBounds(), width = canvas.clientWidth, height = canvas.clientHeight;
    // Portrait screens stack the phone below the player. Short screens use
    // the space beside it. The original iframe stays mounted and visible.
    const insets = player && width < 1000
      ? height >= 650 ? { top: player.bottom + 16 }
        : (player.left + player.right) / 2 < width / 2 ? { left: player.right + 16 } : { right: width - player.left + 16 }
      : {};
    return phoneCameraPose(board, width, height, insets);
  }
  function enter() {
    if (active || !canOpen) return;
    reminders.read(); cancelNotification();
    room = cameraPose(roomCamera); from = cameraPose(roomCamera);
    const previousHeight = canvas.clientHeight;
    panelFrom = panelProgress;
    open = active = moving = true; started = performance.now();
    document.body.classList.add('chat-open');
    view.removeAttribute('aria-hidden'); view.setAttribute('role', 'dialog'); view.setAttribute('aria-modal', 'true');
    // Keep the global mute within the modal's accessible content while reading.
    soundPanel?.closest('details')?.removeAttribute('open');
    dock.hidden = false; sheet.inert = true;
    dock.dataset.instant = String(reduced.matches);
    fit(); from.height *= canvas.clientHeight / Math.max(1, previousHeight);
    layoutWidth = PHONE.screenWidth / closePose().height * canvas.clientHeight;
    blendCamera(camera, from, closePose(), 0, canvas.clientWidth / Math.max(1, canvas.clientHeight), focus);
    list.scrollTop = list.scrollHeight;
    focusInputOnArrival = focusComposer; back.focus({ preventScroll: true }); focusComposer = false;
  }
  function exit() {
    if (!open) return;
    queuedEntry = false; focusInputOnArrival = false; hideSuggestions(); saveDraft();
    panelFrom = panelProgress;
    from = cameraPose(camera); open = false; moving = true; started = performance.now();
    sheet.inert = true;
  }
  function finishExit() {
    active = moving = false; dock.hidden = true;
    view.setAttribute('aria-hidden', 'true'); view.removeAttribute('role'); view.removeAttribute('aria-modal');
    document.body.classList.remove('chat-open');
    renderer.setSize(800, 564, false);
    button.hidden = false; button.focus({ preventScroll: true });
  }
  function requestEntry() {
    if (queuedEntry) { queuedEntry = false; focusComposer = false; return; }
    if (active) { if (open) input.focus({ preventScroll: true }); return; }
    if (integration && !integration.requestRoom()) return;
    focusComposer = true; queuedEntry = true;
    if (canOpen) { queuedEntry = false; enter(); }
  }
  button.addEventListener('click', requestEntry, options); back.addEventListener('click', exit, options);
  document.querySelector('#mobile-chat')?.addEventListener('click', requestEntry, options);
  document.addEventListener('keydown', event => {
    const target = event.target instanceof Element ? event.target : null;
    const editable = target?.closest('input, textarea, select, [contenteditable="true"]');
    if (queuedEntry && !active && event.key === 'Escape') { event.preventDefault(); queuedEntry = false; focusComposer = false; return; }
    if (!active && event.key.toLowerCase() === 'c' && !editable && !event.altKey && !event.ctrlKey && !event.metaKey && !event.repeat) {
      event.preventDefault(); requestEntry(); return;
    }
    if (!active) return;
    if (!editable && event.key.toLowerCase() === 'c' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.repeat) { event.preventDefault(); exit(); return; }
    if (event.key === 'Escape') { event.preventDefault(); exit(); }
    if (event.key === 'Tab') {
      const soundControls = [...document.querySelectorAll<HTMLElement>('#scene-sound-toggle, #scene-volume, #scene-sound-credits')];
      const toolbarControls = [...document.querySelectorAll<HTMLButtonElement>('.factory-toolbar-actions button')];
      const controls = [list, input, send, login, ...soundControls, ...toolbarControls].filter(el => !el.closest('[hidden], [inert]') && !(el instanceof HTMLInputElement && el.disabled) && !(el instanceof HTMLButtonElement && el.disabled));
      const index = controls.indexOf(document.activeElement as typeof controls[number]);
      if (index < 0 || (event.shiftKey && index === 0) || (!event.shiftKey && index === controls.length - 1)) {
        event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
      }
    }
  }, options);

  function refresh(data: BoardData) {
    const sharedMessages = data.chat ?? [];
    const messages = [...sharedMessages, ...localMessages].sort((a, b) => a.timestamp - b.timestamp);
    const next = JSON.stringify(messages);
    const members = getMembers();
    const avatarFor = (name: string): AvatarConfig | undefined => members.find(member => member.name.toLowerCase() === name.toLowerCase())?.avatar
      ?? data.agents.find(agent => agent.owner.toLowerCase() === name.toLowerCase())?.avatar;
    const profiles = JSON.stringify([data.principal?.username, members.map(member => [member.name, member.avatar]), [...new Map(data.agents.map(agent => [agent.owner, agent.avatar]))]]);
    const profilesChanged = profiles !== portraitSignature;
    const changedState = `${data.connected}:${data.canChat}`;
    if (next !== signature || profilesChanged) {
      const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
      // Retain nodes/selection/scroll on agent-only updates and append the server echo exactly once.
      const appended = !profilesChanged && renderedMessages.length > 0 && JSON.stringify(messages.slice(0, renderedMessages.length)) === signature;
      if (!appended) list.replaceChildren();
      for (const message of messages.slice(appended ? renderedMessages.length : 0)) list.append(createPhoneMessage(message, data.principal?.username, avatarFor(message.username)));
      if (!messages.length) list.textContent = data.connected ? 'no messages yet — say hello' : 'connecting to the factory…';
      if (atBottom) list.scrollTop = list.scrollHeight;
      signature = next; renderedMessages = messages;
      portraitSignature = profiles;
      groupFaces.replaceChildren();
      const faces = members.length ? [...members].sort((a, b) => Number(b.online) - Number(a.online)).slice(0, 3).map(member => member.avatar)
        : [...new Map(data.agents.filter(agent => agent.avatar).map(agent => [agent.owner, agent.avatar!])).values()].slice(0, 3);
      for (const avatar of faces) groupFaces.append(createProfilePortrait(avatar));
      const ink = handset.preview.getContext('2d')!; ink.imageSmoothingEnabled = false;
      ink.fillStyle = '#131a27'; ink.fillRect(0, 0, 144, 268);
      faces.forEach((avatar, i) => ink.drawImage(avatarPortrait(avatar), 40 + i * 22, 12, 28, 28));
      ink.font = '10px "Geist Pixel", monospace'; ink.fillStyle = '#dce9eb'; ink.fillText('the lounge', 39, 54);
      messages.filter(message => message.username !== 'system').slice(-3).forEach((message, i) => {
        const own = message.username === data.principal?.username, y = 78 + i * 49;
        ink.fillStyle = own ? '#357ae9' : '#303b50'; ink.fillRect(own ? 34 : 11, y, 100, 34);
        ink.fillStyle = '#e5ecf9'; ink.font = '8px "Geist Pixel", monospace';
        ink.fillText(message.message.slice(0, 18), own ? 40 : 17, y + 20, 87);
      });
      ink.fillStyle = '#303b50'; ink.fillRect(12, 240, 120, 16); handset.texture.needsUpdate = true;
      if (!submitting) status.textContent = data.canChat ? 'live from the factory' : data.connected ? 'read along here · /help for commands' : 'reconnecting…';
    }
    if (stateSignature !== changedState) {
      stateSignature = changedState;
      input.disabled = false; send.disabled = submitting;
      login.hidden = Boolean(data.canChat);
      status.textContent = !data.connected ? 'reconnecting · keeping your messages' : data.canChat ? 'live from the factory' : 'read along here';
      if (!messages.length) list.textContent = data.connected ? 'no messages yet — say hello' : 'connecting to the factory…';
    }
    count.textContent = `${members.length || new Set(data.agents.map(agent => agent.owner)).size} people · ${data.connected ? 'group chat' : 'reconnecting…'}`;
  }
  const project = (x: number, y: number, viewCamera: THREE.Camera) => {
    const point = board.localToWorld(new THREE.Vector3(x, y, PHONE.faceZ + .0005)).project(viewCamera);
    return { x: (point.x + 1) * canvas.clientWidth / 2, y: (1 - point.y) * canvas.clientHeight / 2 };
  };
  return {
    camera,
    configureCommands(commands: LoungeChatCommands) { integration = commands; },
    configureNotifications(sounds: PhoneNotificationSounds) { notificationSounds = sounds; },
    dispose() { saveDraft(); cancelNotification(); stopMessages(); stopConnection(); abort.abort(); handset.dispose(); document.body.classList.remove('chat-open'); view.remove(); button.remove(); },
    isActive: () => active,
    focusPoint: () => board.localToWorld(focus.set(0, 0, PHONE.faceZ)),
    update(now: number, data: BoardData, visible: boolean) {
      arrivals.setOwnUsername(data.principal?.username);
      if (data.connected) arrivals.seed(data.world?.revision, data.chat ?? []);
      const members = getMembers();
      if (data !== lastData || members !== lastMembers) { lastData = data; lastMembers = members; refresh(data); }
      canOpen = visible && !document.body.classList.contains('inspect-open');
      if (notificationPlaying && (active || !canOpen || document.hidden)) cancelNotification();
      if (reminders.update(now, data.connected && canOpen && !active && !document.hidden)) notify(now);
      notificationPlaying = handset.updateNotification(now, reduced.matches, canOpen && !active && !document.hidden);
      button.dataset.notification = String(notificationPlaying);
      button.dataset.unread = String(reminders.unread);
      button.title = reminders.unread ? 'New lounge messages · open the phone (C)' : 'Open the lounge phone (C)';
      if (queuedEntry && document.body.matches('.board-open, .weather-open, .inspect-open')) { queuedEntry = false; focusComposer = false; }
      if (queuedEntry && canOpen) { queuedEntry = false; enter(); }
      button.hidden = active || !canOpen;
      board.updateWorldMatrix(true, false);
      if (active) {
        if (lastWidth !== canvas.clientWidth || lastHeight !== canvas.clientHeight) {
          fit(); positionSuggestions();
        }
        const t = reduced.matches || !moving ? 1 : THREE.MathUtils.clamp((now - started) / 720, 0, 1);
        panelProgress = THREE.MathUtils.lerp(panelFrom, open ? 1 : 0, t * t * (3 - 2 * t));
        const viewport = canvas.closest('.slice-viewport')!.getBoundingClientRect();
        const restoredHeight = Math.min(viewport.height, viewport.width * 141 / 200) - 2;
        const to = open ? closePose() : { ...room, height: room.height * canvas.clientHeight / Math.max(1, restoredHeight) };
        if (open) {
          // Use screen pixels for text and touch targets, even in a smaller phone.
          layoutWidth = PHONE.screenWidth / to.height * canvas.clientHeight;
          sheet.dataset.compact = String(layoutWidth < 280);
        }
        blendCamera(camera, from, to, t, canvas.clientWidth / Math.max(1, canvas.clientHeight), focus);
        sheet.inert = !open || t < 1;
        if (t === 1) {
          moving = false;
          if (open && focusInputOnArrival) { input.focus({ preventScroll: true }); focusInputOnArrival = false; }
          if (!open) { finishExit(); canOpen = true; }
        }
      }
      sheet.hidden = !active;
      if (!sheet.hidden) {
        const viewCamera = active ? camera : roomCamera;
        const tl = project(-PHONE.screenWidth / 2, PHONE.screenHeight / 2, viewCamera), tr = project(PHONE.screenWidth / 2, PHONE.screenHeight / 2, viewCamera), bl = project(-PHONE.screenWidth / 2, -PHONE.screenHeight / 2, viewCamera);
        // On phones, grow the projected glass into a readable panel instead of
        // constraining the conversation to the physical handset aspect ratio.
        const mobile = canvas.clientWidth <= 600;
        sheet.dataset.mobile = String(mobile);
        let width = layoutWidth, height = width * PHONE.screenHeight / PHONE.screenWidth;
        if (mobile) {
          const player = minimizedPlayerBounds();
          const visual = window.visualViewport;
          const top = Math.max(12, player ? player.bottom + 12 : 12, visual?.offsetTop ?? 0);
          const bottom = Math.min(canvas.clientHeight, (visual?.offsetTop ?? 0) + (visual?.height ?? canvas.clientHeight)) - 76;
          width = canvas.clientWidth - 24;
          height = Math.max(1, bottom - top);
          sheet.dataset.compact = String(height < 440);
          for (const [point, x, y] of [[tl, 12, top], [tr, 12 + width, top], [bl, 12, top + height]] as const) {
            point.x = THREE.MathUtils.lerp(point.x, x, panelProgress);
            point.y = THREE.MathUtils.lerp(point.y, y, panelProgress);
          }
        }
        sheet.style.width = `${width}px`; sheet.style.height = `${height}px`;
        sheet.style.transform = `matrix(${(tr.x - tl.x) / width},${(tr.y - tl.y) / width},${(bl.x - tl.x) / height},${(bl.y - tl.y) / height},${tl.x},${tl.y})`;
      }
      if (!active && canOpen) {
        const corners = [-1, 1].flatMap(x => [-1, 1].map(y => project(x * PHONE.width / 2, y * PHONE.height / 2, roomCamera)));
        const left = Math.min(...corners.map(p => p.x)), right = Math.max(...corners.map(p => p.x));
        const top = Math.min(...corners.map(p => p.y)), bottom = Math.max(...corners.map(p => p.y));
        const width = Math.max(44, right - left), height = Math.max(44, bottom - top);
        Object.assign(button.style, { left: `${(left + right - width) / 2}px`, top: `${(top + bottom - height) / 2}px`, width: `${width}px`, height: `${height}px` });
      }
    },
  };
}
