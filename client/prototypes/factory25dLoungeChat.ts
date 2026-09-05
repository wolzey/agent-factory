import * as THREE from 'three';
import { propPart, standard } from './factory25dProps';
import { factoryHost, sendFactoryChat, type BoardData } from './factory25dBoardData';
import { blendCamera, cameraPose, type CameraPose } from './factory25dCameraMotion';
import { createChatMessage } from '../ui/chatMessage';

/** The native scrollable conversation is projected onto the real board face. */
export function createLoungeChat(
  parent: THREE.Group,
  canvas: HTMLCanvasElement,
  roomCamera: THREE.OrthographicCamera,
  renderer: THREE.WebGLRenderer,
) {
  const board = new THREE.Group();
  board.position.set(4.65, 0.99, 3.84);
  parent.add(board);
  propPart(board, [1.77, 1.02, 0.065], [0, 0, 0], standard('#856b54', 1));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.66, 0.91),
    new THREE.MeshBasicMaterial({ color: '#293e3f' }));
  face.position.z = 0.034;
  board.add(face);
  // A little ledge and a chalk stub make this feel like furniture in the lounge.
  propPart(board, [1.78, 0.045, 0.11], [0, -0.5, 0.025], standard('#72523f', 1));
  propPart(board, [0.11, 0.018, 0.022], [-0.58, -0.467, 0.061], standard('#e0dfc7', 1));

  const button = document.createElement('button');
  button.type = 'button'; button.className = 'lounge-chat';
  button.setAttribute('aria-label', 'Open lounge chat');
  canvas.parentElement!.append(button);
  const view = document.createElement('section');
  view.className = 'lounge-chat-view';
  view.setAttribute('aria-hidden', 'true');
  view.setAttribute('aria-labelledby', 'lounge-chat-heading');
  const sheet = document.createElement('div'); sheet.className = 'lounge-chat-sheet'; sheet.inert = true;
  const heading = document.createElement('h2');
  heading.id = 'lounge-chat-heading'; heading.textContent = 'lounge chat';
  const list = document.createElement('div'); list.className = 'lounge-messages';
  list.setAttribute('role', 'log'); list.setAttribute('aria-label', 'Factory messages');
  list.setAttribute('aria-live', 'polite'); list.tabIndex = 0;
  const count = document.createElement('span'); count.className = 'lounge-chat-count';
  sheet.append(heading, list, count);
  const dock = document.createElement('div'); dock.className = 'lounge-chat-dock pixel-island'; dock.hidden = true;
  const back = document.createElement('button'); back.type = 'button'; back.textContent = '← lounge';
  const form = document.createElement('form');
  const input = document.createElement('input');
  input.type = 'text'; input.maxLength = 500; input.placeholder = 'say something…';
  input.autocomplete = 'off'; input.setAttribute('aria-label', 'Message to the factory');
  const send = document.createElement('button'); send.type = 'submit'; send.textContent = 'send';
  form.append(input, send);
  const status = document.createElement('span'); status.className = 'lounge-chat-status';
  status.setAttribute('role', 'status');
  const login = document.createElement('a'); login.href = factoryHost();
  login.target = '_blank'; login.rel = 'noopener'; login.textContent = 'sign in at the factory ↗';
  dock.append(back, form, status, login);
  view.append(sheet, dock); canvas.parentElement!.append(view);
  const soundPanel = document.querySelector<HTMLElement>('.scene-sound');
  const soundParent = soundPanel?.parentElement;
  const soundSibling = soundPanel?.nextSibling;
  form.addEventListener('submit', event => {
    event.preventDefault();
    const message = input.value.trim().replace(/^\/chat\s+/i, '');
    if (!message) return;
    if (sendFactoryChat(message)) {
      input.value = '';
      // The server's broadcast adds the message; never insert a second local echo.
      status.textContent = 'sending…';
    } else status.textContent = 'Disconnected. Your draft is still here.';
  });

  const camera = roomCamera.clone();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let open = false, active = false, canOpen = false;
  let started = 0, moving = false;
  let from = cameraPose(roomCamera), room = cameraPose(roomCamera);
  let lastWidth = 0, lastHeight = 0;
  let signature = '', stateSignature = '';
  let lastData: BoardData | null = null;
  let layoutWidth = Math.max(320, Math.min(900, window.innerWidth * 0.86));
  const focus = new THREE.Vector3();

  function fit() {
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const pixels = Math.min(1280, Math.max(360, canvas.clientWidth));
    renderer.setSize(pixels, Math.round(pixels / aspect), false);
    lastWidth = canvas.clientWidth; lastHeight = canvas.clientHeight;
  }
  function closePose(): CameraPose {
    board.updateWorldMatrix(true, false);
    board.localToWorld(focus.set(0, 0, 0.04));
    const position = focus.clone().add(new THREE.Vector3(0, 0, 0.7));
    const facing = camera.clone(); facing.position.copy(position); facing.lookAt(focus);
    const pixelHeight = Math.max(1, canvas.clientHeight);
    const footer = pixelHeight - dock.getBoundingClientRect().top + 16;
    const available = Math.max(0.25, (pixelHeight - footer - 28) / pixelHeight);
    const height = Math.max(1.12 / available, 1.91 / (canvas.clientWidth / pixelHeight));
    // Center the board in the area above the composer, even when it wraps on phones.
    position.y -= (footer / pixelHeight) * height / 2;
    return { position, quaternion: facing.quaternion.clone(), height };
  }
  function enter() {
    if (active || !canOpen) return;
    room = cameraPose(roomCamera); from = cameraPose(roomCamera);
    const previousHeight = canvas.clientHeight;
    open = active = moving = true; started = performance.now();
    document.body.classList.add('chat-open');
    view.removeAttribute('aria-hidden'); view.setAttribute('role', 'dialog'); view.setAttribute('aria-modal', 'true');
    // Keep the global mute within the modal's accessible content while reading.
    if (soundPanel) view.append(soundPanel);
    dock.hidden = false; sheet.inert = true;
    dock.dataset.instant = String(reduced.matches);
    fit(); from.height *= canvas.clientHeight / Math.max(1, previousHeight);
    layoutWidth = Math.max(320, Math.min(900, 1.66 / closePose().height * canvas.clientHeight));
    blendCamera(camera, from, closePose(), 0, canvas.clientWidth / Math.max(1, canvas.clientHeight));
    list.scrollTop = list.scrollHeight;
    back.focus({ preventScroll: true });
  }
  function exit() {
    if (!open) return;
    from = cameraPose(camera); open = false; moving = true; started = performance.now();
    sheet.inert = true;
  }
  function finishExit() {
    active = moving = false; dock.hidden = true;
    view.setAttribute('aria-hidden', 'true'); view.removeAttribute('role'); view.removeAttribute('aria-modal');
    if (soundPanel && soundParent) soundParent.insertBefore(soundPanel, soundSibling ?? null);
    document.body.classList.remove('chat-open');
    renderer.setSize(800, 564, false);
    button.hidden = false; button.focus({ preventScroll: true });
  }
  button.addEventListener('click', enter); back.addEventListener('click', exit);
  document.querySelector('#mobile-chat')?.addEventListener('click', enter);
  document.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape') { event.preventDefault(); exit(); }
    if (event.key === 'Tab') {
      const soundControls = [...document.querySelectorAll<HTMLElement>('#scene-sound-toggle, #scene-volume, #scene-sound-credits')];
      const controls = [list, back, input, send, login, ...soundControls].filter(el => !el.closest('[hidden], [inert]') && !(el instanceof HTMLInputElement && el.disabled) && !(el instanceof HTMLButtonElement && el.disabled));
      const index = controls.indexOf(document.activeElement as typeof controls[number]);
      if (index < 0 || (event.shiftKey && index === 0) || (!event.shiftKey && index === controls.length - 1)) {
        event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
      }
    }
  });

  function refresh(data: BoardData) {
    const messages = data.chat ?? [];
    const next = JSON.stringify(messages);
    const changedState = `${data.connected}:${data.canChat}`;
    if (next !== signature) {
      const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
      // Retain nodes/selection/scroll on every agent-only update and append in order.
      const old = signature ? JSON.parse(signature) as unknown[] : [];
      const appended = old.length <= messages.length && JSON.stringify(messages.slice(0, old.length)) === signature;
      if (!appended || old.length === 0) list.replaceChildren();
      for (const message of messages.slice(appended ? old.length : 0)) list.append(createChatMessage(message));
      if (!messages.length) list.textContent = data.connected ? 'no messages yet — say hello' : 'connecting to the factory…';
      if (atBottom) list.scrollTop = list.scrollHeight;
      signature = next;
      status.textContent = data.canChat ? 'live from the factory' : data.connected ? 'read along here' : 'reconnecting…';
    }
    if (stateSignature !== changedState) {
      stateSignature = changedState;
      input.disabled = send.disabled = !data.canChat || !data.connected;
      login.hidden = Boolean(data.canChat);
      status.textContent = !data.connected ? 'reconnecting · keeping your messages' : data.canChat ? 'live from the factory' : 'read along here';
      if (!messages.length) list.textContent = data.connected ? 'no messages yet — say hello' : 'connecting to the factory…';
    }
    count.textContent = `${messages.length} ${messages.length === 1 ? 'message' : 'messages'} · ${data.connected ? 'live from the factory' : 'reconnecting…'}`;
  }
  const project = (x: number, y: number, viewCamera: THREE.Camera) => {
    const point = board.localToWorld(new THREE.Vector3(x, y, 0.039)).project(viewCamera);
    return { x: (point.x + 1) * canvas.clientWidth / 2, y: (1 - point.y) * canvas.clientHeight / 2 };
  };
  return {
    camera,
    isActive: () => active,
    focusPoint: () => board.localToWorld(focus.set(0, 0, 0.04)),
    update(now: number, data: BoardData, visible: boolean) {
      if (data !== lastData) { lastData = data; refresh(data); }
      canOpen = visible && !document.body.classList.contains('inspect-open');
      button.hidden = active || !canOpen;
      board.updateWorldMatrix(true, false);
      if (active) {
        if (lastWidth !== canvas.clientWidth || lastHeight !== canvas.clientHeight) {
          fit();
          if (open) layoutWidth = Math.max(320, Math.min(900, 1.66 / closePose().height * canvas.clientHeight));
        }
        const t = reduced.matches || !moving ? 1 : THREE.MathUtils.clamp((now - started) / 720, 0, 1);
        const viewport = canvas.closest('.slice-viewport')!.getBoundingClientRect();
        const restoredHeight = Math.min(viewport.height, viewport.width * 141 / 200) - 2;
        const to = open ? closePose() : { ...room, height: room.height * canvas.clientHeight / Math.max(1, restoredHeight) };
        blendCamera(camera, from, to, t, canvas.clientWidth / Math.max(1, canvas.clientHeight));
        sheet.inert = !open || t < 1;
        if (t === 1) {
          moving = false;
          if (!open) { finishExit(); canOpen = true; }
        }
      }
      sheet.hidden = !active && !canOpen;
      if (!sheet.hidden) {
        const viewCamera = active ? camera : roomCamera;
        const tl = project(-0.83, 0.455, viewCamera), tr = project(0.83, 0.455, viewCamera), bl = project(-0.83, -0.455, viewCamera);
        const width = layoutWidth, height = width * 0.91 / 1.66;
        sheet.style.width = `${width}px`; sheet.style.height = `${height}px`;
        sheet.style.transform = `matrix(${(tr.x - tl.x) / width},${(tr.y - tl.y) / width},${(bl.x - tl.x) / height},${(bl.y - tl.y) / height},${tl.x},${tl.y})`;
      }
      if (!active && canOpen) {
        const tl = project(-0.885, 0.51, roomCamera), br = project(0.885, -0.51, roomCamera);
        Object.assign(button.style, { left: `${tl.x}px`, top: `${tl.y}px`, width: `${Math.max(44, br.x - tl.x)}px`, height: `${Math.max(44, br.y - tl.y)}px` });
      }
    },
  };
}
