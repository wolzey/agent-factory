import * as THREE from 'three';
import { lastSeenLabel, type TeamMember, type TeamSnapshot } from '@shared/team';
import { parseAvatarConfig } from '@shared/avatar-customization';
import { avatarSheet } from './factory25dAvatar';
import { factoryHost, onFactoryConnection } from './factory25dBoardData';
import { blendCamera, cameraPose, type CameraPose } from './factory25dCameraMotion';
import { propPart, standard } from './factory25dProps';
import './factory25dTeamDesk.css';

// One physical display size drives the model, camera framing and live UI projection.
const DISPLAY = { width: .686, height: .486, frameWidth: .74, frameHeight: .54, faceZ: .024 };
const ZOOM_DURATION = 900;

export function createTeamDesk(parent: THREE.Group, canvas: HTMLCanvasElement,
  roomCamera: THREE.OrthographicCamera, renderer: THREE.WebGLRenderer, onOpen: () => void) {
  const abort = new AbortController(), events = { signal: abort.signal };
  const terminal = new THREE.Group(); terminal.position.set(-3.2, .53, 4.66); parent.add(terminal);
  const casing = standard('#364344', .7), edge = standard('#566363', .6);
  // A weighted foot rests on the counter; the short neck supports a tilted tablet.
  propPart(terminal, [.34, .028, .25], [0, .014, .012], casing);
  propPart(terminal, [.085, .17, .065], [0, .108, 0], edge);
  const desk = new THREE.Group(); desk.position.y = .37; desk.rotation.x = -.22; terminal.add(desk);
  propPart(desk, [DISPLAY.frameWidth, DISPLAY.frameHeight, .045], [0, 0, 0], casing);
  propPart(desk, [DISPLAY.width + .012, DISPLAY.height + .012, .003], [0, 0, .023], edge);
  propPart(desk, [.012, .005, .003], [.30, -.257, .023], standard('#9fbead', .7, '#37533f'));
  const paper = document.createElement('canvas'); paper.width = 360; paper.height = 255;
  const ink = paper.getContext('2d')!;
  const texture = new THREE.CanvasTexture(paper); texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(DISPLAY.width, DISPLAY.height), new THREE.MeshBasicMaterial({ map: texture }));
  face.position.z = DISPLAY.faceZ + .001; desk.add(face);
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'team-desk-hotspot';
  trigger.setAttribute('aria-label', 'Open the front desk team screen'); trigger.title = 'See who’s here'; canvas.parentElement!.append(trigger);
  const dialog = document.createElement('dialog'); dialog.className = 'team-desk-dialog';
  dialog.setAttribute('aria-labelledby', 'team-desk-heading');
  dialog.innerHTML = `<section class="team-desk-sheet"><header><div><p>FRONT COUNTER</p><h2 id="team-desk-heading">our people</h2></div><span class="team-desk-count"></span></header><div class="team-desk-members" tabindex="0" role="list" aria-label="Team presence"></div><footer class="team-desk-status" role="status"></footer></section><nav class="team-desk-dock pixel-island"><button type="button">← room</button></nav>`;
  document.body.append(dialog);
  const sheet = dialog.querySelector<HTMLElement>('.team-desk-sheet')!;
  const list = dialog.querySelector<HTMLElement>('.team-desk-members')!;
  const count = dialog.querySelector<HTMLElement>('.team-desk-count')!;
  const status = dialog.querySelector<HTMLElement>('.team-desk-status')!;
  const back = dialog.querySelector<HTMLButtonElement>('button')!;
  const soundPanel = document.querySelector<HTMLElement>('.scene-sound');
  const soundParent = soundPanel?.parentElement, soundSibling = soundPanel?.nextSibling;
  const restoreSound = () => { if (soundPanel && soundParent) soundParent.insertBefore(soundPanel, soundSibling ?? null); };
  const camera = roomCamera.clone(), reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let active = false, open = false, moving = false, canOpen = false, started = 0, exitOpacity = 0;
  let from = cameraPose(roomCamera), room = cameraPose(roomCamera);
  let width = 0, height = 0, lastPoll = -Infinity, previousTime = 0;
  let data: TeamSnapshot | undefined, unavailable = false, signature = '';
  let request: AbortController | undefined;
  const portraits = new Map<string, { signature: string; canvas: HTMLCanvasElement }>();
  function portrait(member: TeamMember) {
    const signature = JSON.stringify(member.avatar), previous = portraits.get(member.id);
    if (previous?.signature === signature) return previous.canvas;
    const image = document.createElement('canvas'); image.width = image.height = 48;
    const context = image.getContext('2d')!; context.imageSmoothingEnabled = false;
    context.drawImage(avatarSheet(member.avatar).canvas, 0, 0, 32, 32, 0, 0, 48, 48);
    portraits.set(member.id, { signature, canvas: image }); return image;
  }
  function paint() {
    const members = data?.members ?? [], now = Date.now() + (data ? data.serverTime - previousTime : 0);
    const online = members.filter(member => member.online).length;
    count.textContent = unavailable ? 'reconnecting' : `${online} here · ${members.length} ${members.length === 1 ? 'person' : 'people'}`;
    status.textContent = unavailable ? 'reconnecting · showing the last update'
      : data?.historyAvailable === false ? 'live now · visit history is waiting to save'
      : 'people join this list when they connect';
    const next = JSON.stringify(members.map(member => [member.id, member.name, member.avatar, member.online, member.agents, lastSeenLabel(member.lastSeen, now)])) + unavailable;
    if (signature !== next) {
      signature = next; const scroll = list.scrollTop; list.replaceChildren();
      for (const member of members) {
        const row = document.createElement('div'); row.className = 'team-person'; row.setAttribute('role', 'listitem');
        row.dataset.online = String(member.online && !unavailable);
        const image = document.createElement('span'); image.className = 'team-person-portrait'; image.setAttribute('aria-hidden', 'true');
        image.append(portrait(member).cloneNode());
        const imageCanvas = image.firstChild as HTMLCanvasElement;
        imageCanvas.getContext('2d')!.drawImage(portrait(member), 0, 0);
        const details = document.createElement('div'), name = document.createElement('strong'), seen = document.createElement('span');
        name.textContent = member.name;
        seen.textContent = unavailable ? 'connection unavailable' : member.online
          ? member.agents ? `here · ${member.agents} ${member.agents === 1 ? 'agent' : 'agents'}` : 'here · in the room'
          : lastSeenLabel(member.lastSeen, now);
        const dot = document.createElement('span'); dot.className = 'team-person-dot'; dot.setAttribute('aria-hidden', 'true');
        details.append(name, seen); row.append(image, details, dot); list.append(row);
      }
      if (!members.length) { const empty = document.createElement('p'); empty.className = 'team-desk-empty'; empty.textContent = unavailable ? 'the team list is temporarily unavailable' : data ? 'the first person to connect will appear here' : 'checking who’s here…'; list.append(empty); }
      list.scrollTop = scroll;
      ink.fillStyle = '#182629'; ink.fillRect(0, 0, paper.width, paper.height);
      ink.fillStyle = '#d8e6df'; ink.font = '22px "Geist Pixel", monospace'; ink.fillText('our people', 22, 33);
      ink.fillStyle = '#8ab8a1'; ink.font = '12px "Geist Pixel", monospace'; ink.fillText(unavailable ? 'reconnecting' : `${online} here`, 245, 31);
      members.slice(0, 3).forEach((member, index) => {
        const y = 53 + index * 48;
        ink.globalAlpha = member.online && !unavailable ? 1 : .4; ink.drawImage(portrait(member), 18, y, 42, 42); ink.globalAlpha = 1;
        ink.fillStyle = member.online && !unavailable ? '#d8e6df' : '#91a09e'; ink.font = '15px "Geist Pixel", monospace';
        ink.fillText(member.name, 72, y + 18, 235);
        ink.font = '10px "Geist Pixel", monospace'; ink.fillStyle = '#889f9a';
        ink.fillText(unavailable ? 'reconnecting' : member.online ? 'here now' : lastSeenLabel(member.lastSeen, now), 72, y + 34, 240);
      });
      ink.fillStyle = '#304541'; ink.fillRect(18, 220, 324, 1);
      ink.fillStyle = '#9fbead'; ink.font = '11px "Geist Pixel", monospace';
      ink.fillText('tap to see the team', 22, 242);
      texture.needsUpdate = true;
    }
  }
  async function refresh() {
    if (request || document.hidden || abort.signal.aborted) return;
    const controller = new AbortController(); request = controller; lastPoll = performance.now();
    try {
      const response = await fetch(new URL('/api/team', factoryHost()), { cache: 'no-store', credentials: 'omit', signal: AbortSignal.any([controller.signal, abort.signal, AbortSignal.timeout(8000)]) });
      if (!response.ok) throw new Error('Team unavailable');
      const value = await response.json() as TeamSnapshot;
      if (!Array.isArray(value.members) || !Number.isFinite(value.serverTime)) throw new Error('Invalid team');
      value.members = value.members.filter(member => typeof member.id === 'string' && typeof member.name === 'string' && Number.isFinite(member.lastSeen) && typeof member.online === 'boolean' && Number.isInteger(member.agents) && !!parseAvatarConfig(member.avatar));
      if (abort.signal.aborted) return;
      data = value; previousTime = Date.now(); unavailable = false;
    } catch { if (!abort.signal.aborted) unavailable = true; }
    finally { if (request === controller) request = undefined; if (!abort.signal.aborted) paint(); }
  }
  const stopConnection = onFactoryConnection(connected => { unavailable = !connected; if (connected) void refresh(); else paint(); });
  function fit() {
    width = canvas.clientWidth; height = canvas.clientHeight;
    const pixels = Math.min(1280, Math.max(360, width)); renderer.setSize(pixels, pixels * height / Math.max(1, width), false);
  }
  const focus = new THREE.Vector3();
  function closePose(): CameraPose {
    desk.updateWorldMatrix(true, false); desk.localToWorld(focus.set(0, 0, DISPLAY.faceZ));
    const quaternion = desk.getWorldQuaternion(new THREE.Quaternion());
    const position = focus.clone().add(new THREE.Vector3(0, 0, .85).applyQuaternion(quaternion));
    const availableWidth = Math.max(1, Math.min(840, width - 48));
    const availableHeight = Math.max(1, height - 160);
    const span = Math.max(DISPLAY.height * height / availableHeight, DISPLAY.width * height / availableWidth);
    position.add(new THREE.Vector3(0, -.045 * span, 0).applyQuaternion(quaternion));
    return { position, quaternion, height: span };
  }
  function enter() {
    if (active || !canOpen) return;
    onOpen(); room = cameraPose(roomCamera); from = cameraPose(roomCamera); const oldHeight = canvas.clientHeight;
    active = open = moving = true; started = performance.now(); document.body.classList.add('team-open');
    sheet.style.opacity = '0'; sheet.inert = true;
    if (soundPanel) dialog.append(soundPanel);
    dialog.showModal(); fit(); from.height *= height / Math.max(1, oldHeight);
    blendCamera(camera, from, closePose(), 0, width / Math.max(1, height)); back.focus(); void refresh();
  }
  function exit() {
    if (!open) return;
    exitOpacity = Number(sheet.style.opacity); from = cameraPose(camera);
    open = false; moving = true; started = performance.now(); sheet.inert = true;
  }
  function finishExit() {
    active = moving = false; dialog.close(); restoreSound(); document.body.classList.remove('team-open'); renderer.setSize(800, 564, false);
    trigger.hidden = false; trigger.focus({ preventScroll: true });
  }
  trigger.addEventListener('click', enter, events); back.addEventListener('click', exit, events);
  dialog.addEventListener('cancel', event => { event.preventDefault(); exit(); }, events);
  dialog.addEventListener('keydown', event => event.stopPropagation(), events);
  const project = (x: number, y: number, view: THREE.Camera) => {
    const p = desk.localToWorld(new THREE.Vector3(x, y, DISPLAY.faceZ + .002)).project(view);
    return { x: (p.x + 1) * canvas.clientWidth / 2, y: (1 - p.y) * canvas.clientHeight / 2 };
  };
  paint(); void refresh();
  return {
    camera, isActive: () => active, focusPoint: () => desk.localToWorld(focus.set(0, 0, DISPLAY.faceZ)),
    update(now: number, visible: boolean) {
      canOpen = visible && !document.body.classList.contains('inspect-open'); trigger.hidden = active || !canOpen;
      if (now - lastPoll > (active ? 10_000 : 30_000)) void refresh();
      desk.updateWorldMatrix(true, false);
      if (active) {
        if (width !== canvas.clientWidth || height !== canvas.clientHeight) fit();
        const t = reduced.matches || !moving ? 1 : THREE.MathUtils.clamp((now - started) / ZOOM_DURATION, 0, 1);
        const viewport = canvas.closest('.slice-viewport')!.getBoundingClientRect();
        const restored = Math.min(viewport.height, viewport.width * 141 / 200) - 2;
        const to = open ? closePose() : { ...room, height: room.height * height / Math.max(1, restored) };
        blendCamera(camera, from, to, t, width / Math.max(1, height)); sheet.inert = !open || t < 1;
        sheet.style.opacity = String(open ? THREE.MathUtils.smoothstep(t, .68, .96) : exitOpacity * (1 - THREE.MathUtils.smoothstep(t, 0, .35)));
        const tl = project(-DISPLAY.width / 2, DISPLAY.height / 2, camera);
        const tr = project(DISPLAY.width / 2, DISPLAY.height / 2, camera);
        const bl = project(-DISPLAY.width / 2, -DISPLAY.height / 2, camera);
        // Lay out at the display's pixel size once close, keeping text crisp and
        // avoiding a scaled opaque layer painting over the tablet's lower bezel.
        const w = Math.max(320, Math.min(840, Math.hypot(tr.x - tl.x, tr.y - tl.y))), h = w * DISPLAY.height / DISPLAY.width;
        sheet.style.width = `${w}px`; sheet.style.height = `${h}px`;
        sheet.style.setProperty('--team-ui-scale', String(Math.max(1, w / 560)));
        sheet.style.transform = `matrix(${(tr.x - tl.x) / w},${(tr.y - tl.y) / w},${(bl.x - tl.x) / h},${(bl.y - tl.y) / h},${tl.x},${tl.y})`;
        if (t === 1) { moving = false; if (!open) finishExit(); }
      } else if (canOpen) {
        const corners = [-1, 1].flatMap(x => [-1, 1].map(y => project(x * DISPLAY.frameWidth / 2, y * DISPLAY.frameHeight / 2, roomCamera)));
        const left = Math.min(...corners.map(p => p.x)), right = Math.max(...corners.map(p => p.x));
        const top = Math.min(...corners.map(p => p.y)), bottom = Math.max(...corners.map(p => p.y));
        const hitWidth = Math.max(44, right - left), hitHeight = Math.max(44, bottom - top);
        Object.assign(trigger.style, { left: `${(left + right - hitWidth) / 2}px`, top: `${(top + bottom - hitHeight) / 2}px`, width: `${hitWidth}px`, height: `${hitHeight}px` });
      }
    },
    dispose() { abort.abort(); request?.abort(); stopConnection(); restoreSound(); dialog.remove(); trigger.remove(); document.body.classList.remove('team-open'); texture.dispose(); },
  };
}
