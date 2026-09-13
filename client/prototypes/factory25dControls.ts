import { sharedPickupFor } from './factory25dSharedPickup';
import { createSharedPickupVisual } from './factory25dSharedPickupVisual';
import { savedVolume, rememberVolume } from './factory25dVolumeMemory';
import { musicMeterHeights } from './factory25dMusicMeter';
import { pixelIcon } from './factory25dPixelIcons';
import { createIslandTransitions } from './factory25dIslandTransitions';
import { setAvatarTextureFrame } from './factory25dAvatarTexture';
import { createPickupMotion, updatePickupShadow, pickupLanding, pickupReleaseLanding } from './factory25dPickup';
import { avatarSheet, AVATAR_ANIMATIONS } from './factory25dAvatar';
import { DEFAULT_AVATAR } from '@shared/constants';
import { agentPickerItems } from './factory25dAgentPicker';
import { createProfileMenu } from './factory25dProfileMenu';
import { createToolbarElement } from './factory25dToolbarElement';
import * as THREE from 'three';
import type { GarageCarId } from '@shared/factory25d-garage';
import { intersectFactoryFloor } from './factory25dPatioPicking';
import { createRoomMenu } from './factory25dRoomMenu';
import { createToolbarTooltip } from './factory25dToolbarTooltip';
import { factoryToolbarState } from './factory25dToolbarState';
import { createProfilePortrait } from './factory25dPortrait';
import { parseAvatarConfig } from '@shared/avatar-customization';
import type { Position } from '@shared/types';
import { fromFactoryWorld, toFactoryWorld, factoryWorldPoint, WORKSTATIONS, factoryRoomAt, GARAGE_LEVEL, MINI_WORKSTATION_ID, MINI_WORKSTATION_USERNAME, type FactoryRoom } from '@shared/factory25d-layout';
import { nearestWorkstationSlot, slotPosition } from '@shared/world-layouts';
import { AuthManager } from '../auth/AuthManager';
import { GrabManager } from '../grab/GrabManager';
import { FactoryControlState, factoryControlPhase } from './factory25dControlState';
import { factoryHost, forgetFactoryLogin, onFactoryConnection, onFactoryMessage, sendFactoryCommand, type BoardData,
  isControlPreview, onControlPreview, connectControlPreview, logoutControlPreview, previewAvatar } from './factory25dBoardData';
import type { createLiveAgents } from './factory25dLiveAgents';
import { createDeviceLinks } from './factory25dDeviceLinks';
import { createAvatarEditor, type AvatarScenePreview } from './factory25dAvatarEditor';
import { createEmoteBar } from './factory25dEmoteBar';
import { AgentAttentionEpisodes, agentAttentionSummary, findPersonalAttentionAgent, personalAgentAttention } from './factory25dAgentAttention';
import { createToolbarFocus } from './factory25dToolbarFocus';
import { GRAB_DRAG_THRESHOLD } from '../grab/pointer';
import { ManualRoomFollower } from './factory25dManualTravel';
import './factory25dControls.css';

export function createFactoryControls(canvas: HTMLCanvasElement, agents: ReturnType<typeof createLiveAgents>,
  camera: () => THREE.Camera, available: () => boolean, visit: (room: FactoryRoom) => void, avatarScene: AvatarScenePreview, currentRoom: () => FactoryRoom = () => 'factory', displayedRoom: () => FactoryRoom = currentRoom, navigating: () => boolean = () => false) {
  const state = new FactoryControlState(sendFactoryCommand);
  const preview = isControlPreview();
  const abort = new AbortController(), options = { signal: abort.signal };
  let data: BoardData = { agents: [], connected: false, merges: null };
  let clockOffset = 0;
  let wasRiding = false;
  const roomFollower = new ManualRoomFollower();
  const controlledAgent = () => state.agents.find(agent => agent.sessionId === state.active);
  const movementAvailable = () => available() && !controlledAgent()?.manualControl?.elevatorTrip;
  const panel = document.createElement('details'); panel.className = 'factory-controls pixel-island';
  panel.id = 'factory-agent-controls';
  panel.innerHTML = `<summary role="button" aria-label="Agent controls" aria-describedby="factory-attention-count"><span class="factory-controls-heading">agents</span> <span class="factory-connection">connecting</span><span class="factory-attention-count" id="factory-attention-count" hidden></span></summary>
    <div class="factory-control-content"><section class="factory-attention" aria-label="Your agent updates" hidden><p class="factory-attention-heading">your agent updates</p><ul class="factory-attention-list"></ul><p class="factory-attention-help">Reply in the app or terminal running your agent.</p></section><p class="factory-auth"></p><p class="factory-step-help"></p><div class="factory-session-actions"></div>
    <section class="factory-connect-guide" hidden aria-label="Connect to customize your avatar"><p>on the computer running your agents, run:</p><code>agent-factory login</code><button class="factory-copy-login">copy login command</button><p>this opens a connected browser. click <strong>your circular portrait</strong> there to edit.</p><details><summary>login command not found?</summary><p>run <code>agent-factory update</code> first, then try login again.</p></details><p>each browser connects separately. no active agent needed.</p></section>
    <section class="factory-agent-section" hidden><label>your agent <select aria-label="Choose your agent"></select></label>
    <div class="factory-action-row"><button class="factory-claim">take control</button><button class="factory-release" hidden>release</button><button class="factory-visit">find agent</button></div>
    <details class="factory-station-section"><summary>move to a workstation</summary><label>workstation <select class="factory-station" aria-label="Choose a workstation"></select></label><button class="factory-place">place at station</button></details>
    <div class="factory-movement" aria-label="Movement controls"><button data-direction="up" aria-label="Move up">↑</button><button data-direction="left" aria-label="Move left">←</button><button data-direction="down" aria-label="Move down">↓</button><button data-direction="right" aria-label="Move right">→</button></div>
    <div class="factory-action-row factory-play-actions"><button class="factory-shoot">shoot</button><button class="factory-open-emotes">emotes · B</button></div>
    <p class="factory-key-help">W A S D to walk · space to shoot<br>B for emotes · escape to release<br>walk into the lift or through the patio doorway</p></section><p class="factory-control-status" role="status" aria-live="polite"></p></div>`;
  document.body.append(panel);
  const {toolbar,contextIcons,personIcon} = createToolbarElement();
  const soundPanel = document.querySelector<HTMLElement>('.scene-sound');
  const soundAnchor = document.createComment('scene sound home');
  const soundDock = document.createElement('div'); soundDock.className = 'factory-volume-control';
  const quickMute = document.createElement('button'); quickMute.type = 'button'; quickMute.className = 'factory-audio-mute';
  let masterRestore: boolean[] | undefined;
  try { const saved=JSON.parse(localStorage.getItem('factory-master-restore-v1')??'null'); if(Array.isArray(saved)&&saved.length===2&&saved.every(v=>typeof v==='boolean'))masterRestore=saved; } catch {}
  const saveMasterRestore=()=>{try{localStorage.setItem('factory-master-restore-v1',JSON.stringify(masterRestore??null));}catch{}};
  let touchSound=false;
  quickMute.addEventListener('pointerdown',event=>{touchSound=event.pointerType==='touch';});
  document.addEventListener('pointerdown',event=>{if(!soundDock.contains(event.target as Node))delete soundDock.dataset.open;},options);
  quickMute.addEventListener('click', () => {
    if(touchSound&&soundDock.dataset.open!=='true'){soundDock.dataset.open='true';touchSound=false;return;}
    touchSound=false;
    const master = soundPanel?.querySelector<HTMLButtonElement>('#scene-sound-toggle');
    const audible = master?.getAttribute('aria-pressed') === 'true' && channels.some(c => c && Number(c.slider.value) > 0);
    if (audible) {
      masterRestore = channels.map(c => !!c && Number(c.slider.value) > 0); saveMasterRestore();
      for (const c of channels) c?.muteChannel();
      master?.click();
    } else {
      if (channels.every(c => !c || Number(c.slider.value) === 0)) {
        channels.forEach((c, i) => { if (c && (masterRestore?.[i] ?? true)) c.restoreChannel(); });
      }
      masterRestore = undefined; saveMasterRestore();
      if (master?.getAttribute('aria-pressed') !== 'true') master?.click();
    }
  });
  if (soundPanel) { soundPanel.before(soundAnchor); soundPanel.classList.remove('pixel-island'); soundDock.append(quickMute, soundPanel); toolbar.append(soundDock); }
  quickMute.innerHTML = '<span class="factory-audio-wave" aria-hidden="true">'+Array.from({length:7},()=>'<i></i>').join('')+'</span>';
  const channels = ['#scene-music-volume', '#scene-volume'].map((selector) => {
    const slider = soundPanel?.querySelector<HTMLInputElement>(selector);
    if (!slider) return undefined;
    const paintFill = () => {
      const percent = Math.max(0, Math.min(100, Number(slider.value)));
      slider.style.setProperty('--volume-fill', `calc(${percent}% + ${4 - percent * .08}px)`);
    };
    slider.addEventListener('input', paintFill); paintFill();
    const name = selector.includes('music') ? 'Music' : 'SFX';
    const label = slider.closest('label')!;
    const caption = label.querySelector('span');
    const mute = document.createElement('button'); mute.type = 'button'; mute.className = 'factory-channel-mute';
    if (caption) caption.textContent = name;
    else { const title = document.createElement('span'); title.textContent = name; label.prepend(title); }
    label.append(mute);
    const storageKey=name==='Music'?'factory-music-level-v2':'factory-ambient-volume-v1';
    let previous=savedVolume(storageKey,Number(slider.value),localStorage);
    const change = (value: number) => { slider.value = String(value); slider.dispatchEvent(new Event('input', {bubbles:true})); };
    const muteChannel = () => { if (Number(slider.value) > 0) { previous = Number(slider.value); rememberVolume(storageKey,previous,localStorage); } change(0); };
    mute.addEventListener('click', () => {
      masterRestore = undefined; saveMasterRestore();
      const master = soundPanel?.querySelector<HTMLButtonElement>('#scene-sound-toggle');
      if (master?.getAttribute('aria-pressed') !== 'true') {
        // Clicking an effectively muted channel enables that channel alone.
        for (const channel of channels) if (channel && channel.slider !== slider) channel.muteChannel();
        if (Number(slider.value) === 0) change(previous);
        master?.click();
      } else if (Number(slider.value) > 0) muteChannel();
      else change(previous);
    });
    label.addEventListener('wheel', event => { event.preventDefault(); if (event.deltaY) change(Math.max(0, Math.min(100, Number(slider.value) + (event.deltaY < 0 ? 5 : -5)))); }, {passive:false});
    return {slider, mute, name, muteChannel, restoreChannel: () => change(previous)};
  });
  if(soundPanel?.querySelector('#scene-sound-toggle')?.getAttribute('aria-pressed')!=='true' && channels.some(c=>c&&Number(c.slider.value)>0)) {
    masterRestore=channels.map(c=>!!c&&Number(c.slider.value)>0);saveMasterRestore();
    channels.forEach(c=>c?.muteChannel());
  }
  const audioReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const syncSound = () => {
    const enabled = soundPanel?.querySelector('#scene-sound-toggle')?.getAttribute('aria-pressed') === 'true';
    const audible = enabled && channels.some(c => c && Number(c.slider.value) > 0);
    quickMute.setAttribute('aria-label', 'Sound'); quickMute.setAttribute('aria-pressed', String(audible)); quickMute.title=audible?'Mute all sound':'Enable sound';
    for (const c of channels) if (c) {
      const percent = Math.max(0, Math.min(100, Number(c.slider.value)));
      c.slider.style.setProperty('--volume-fill', `calc(${percent}% + ${4 - percent * .08}px)`);
      const muted = !enabled || Number(c.slider.value) === 0;
      c.slider.closest('label')?.classList.toggle('is-channel-muted', muted);
      if (c.mute.dataset.muted !== String(muted)) c.mute.innerHTML = pixelIcon(muted ? 'volume-x' : 'volume-2');
      c.mute.dataset.muted=String(muted); c.mute.setAttribute('aria-pressed', String(!muted)); c.mute.setAttribute('aria-label', `${c.name} sound`); c.mute.title=`${muted?'Unmute':'Mute'} ${c.name}`;
    }
    const music = enabled && Number(channels[0]?.slider.value) > 0 && soundPanel?.dataset.playing === 'true';
    const energy = enabled && Number(channels[1]?.slider.value) > 0 ? Number(soundPanel?.dataset.sfxLevel || 0) : 0;
    quickMute.classList.toggle('is-silent', !audible);
    const playbackTime = Number(soundPanel?.dataset.musicTime || 0) + (performance.now() - Number(soundPanel?.dataset.musicSampleAt || performance.now())) / 1000;
    const heights = musicMeterHeights(playbackTime, music, energy, audible, audioReducedMotion.matches || document.hidden);
    quickMute.querySelectorAll<HTMLElement>('i').forEach((bar, i) => { bar.style.height = `${heights[i]}px`; });
  };
  const soundObserver = new MutationObserver(syncSound);
  if (soundPanel) soundObserver.observe(soundPanel, { attributes:true, subtree:true, attributeFilter:['data-playing','data-sfx-level'] });
  const soundMeter = window.setInterval(syncSound, 50);
  syncSound();
  const roomPicker = toolbar.querySelector<HTMLButtonElement>('.factory-room-picker')!;
  const viewTools = toolbar.querySelector<HTMLElement>('.factory-view-tools')!;
  const focusTitle = toolbar.querySelector<HTMLElement>('.factory-focus-title')!;
  // Move the actual controls, preserving handlers and the whiteboard footer bounds.
  // Each view owns its buttons; this dock owns where that view's tools appear.
  const docked = [
    { selector: '.window-navigation', view: 'window' },
    { selector: '#window-controls', view: 'window' },
    { selector: '#board-navigation', view: 'whiteboard' },
    { selector: '#room-navigation', view: 'patio' },
    { selector: '.garage-nav', view: 'garage' },
  ].flatMap(({ selector, view }) => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return [];
    const anchor = document.createComment('factory view controls'); element.before(anchor);
    const group = document.createElement('div'); group.className = 'factory-view-group'; group.hidden = true;
    group.append(element); viewTools.append(group);
    return [{ element, anchor, group, view }];
  });
  document.body.append(toolbar); document.body.classList.add('factory-toolbar-ready');
  const sizeToolbar = new ResizeObserver(() => {
    if (toolbar.offsetHeight) document.body.style.setProperty('--factory-toolbar-height', `${toolbar.offsetHeight}px`);
  });
  sizeToolbar.observe(toolbar);
  const avatarShortcut = toolbar.querySelector<HTMLButtonElement>('.factory-avatar-shortcut')!;
  const portraitSlot = toolbar.querySelector<HTMLElement>('.factory-nav-portrait')!;
  let portraitOwner = '', portraitGeneration = 0;
  async function refreshPortrait(force = false) {
    const owner = data.principal?.ownerId ?? '';
    if (!force && portraitOwner === owner) return;
    portraitOwner = owner; const generation = ++portraitGeneration;
    portraitSlot.innerHTML = personIcon;
    if (!owner) return;
    const fallback = data.agents.find(agent => agent.owner === data.principal?.username)?.avatar;
    if (fallback) portraitSlot.replaceChildren(createProfilePortrait(fallback));
    if (!preview && factoryHost() !== location.origin) return;
    try {
      const result = preview ? await previewAvatar('GET', abort.signal) : await fetch('/api/avatar', { credentials: 'same-origin', headers: { 'X-Avatar-Owner': owner }, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(12000)]) }).then(response => response.ok ? response.json() : undefined);
      const avatar = parseAvatarConfig(result?.avatar);
      if (avatar && generation === portraitGeneration && !abort.signal.aborted) portraitSlot.replaceChildren(createProfilePortrait(avatar));
    } catch { /* Keep the agent portrait or guest icon if offline. */ }
  }
  document.addEventListener('pointerdown', event => {
    if (panel.open && !panel.contains(event.target as Node) && !toolbar.contains(event.target as Node)) panel.open = false;
  }, options);
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !state.active) { event.preventDefault(); event.stopPropagation(); state.release(); panel.open = false; roomPicker.focus(); }
  }, options);
  const attentionEpisodes = new AgentAttentionEpisodes();
  const attentionSection = panel.querySelector<HTMLElement>('.factory-attention')!;
  const attentionList = panel.querySelector<HTMLElement>('.factory-attention-list')!;
  const attentionCount = panel.querySelector<HTMLElement>('.factory-attention-count')!;
  const attentionAnnouncer = document.createElement('div'); attentionAnnouncer.className = 'factory-attention-announcer';
  attentionAnnouncer.setAttribute('role', 'status'); attentionAnnouncer.setAttribute('aria-live', 'polite'); attentionAnnouncer.setAttribute('aria-atomic', 'true');
  document.body.append(attentionAnnouncer);
  let attentionSignature = '';
  const picker = panel.querySelector<HTMLSelectElement>('select')!;
  const claim = panel.querySelector<HTMLButtonElement>('.factory-claim')!;
  const release = panel.querySelector<HTMLButtonElement>('.factory-release')!;
  const status = panel.querySelector<HTMLElement>('.factory-control-status')!;
  const emoteBar = createEmoteBar(emote => { state.emote(emote); }, () => { state.stop(); panel.open = false; });
  toolbar.querySelector('.factory-toolbar-actions')!.insertBefore(emoteBar.element, toolbar.querySelector('.factory-context-action'));
  const auth = new AuthManager();
  let signature = '', connectionError = '', avatarNotice = '', placementNotice = '', connecting = false, avatarRequested = false;
  let placement: { sessionId: string; x: number; y: number; workstationSlot: number } | undefined;
  const stationPicker = panel.querySelector<HTMLSelectElement>('.factory-station')!;
  const placeButton = panel.querySelector<HTMLButtonElement>('.factory-place')!;
  for (const [index, station] of WORKSTATIONS.entries()) { const option = document.createElement('option'); option.value = String(index); option.textContent = `${station.room === 'factory' ? 'indoors' : station.room} · ${station.label}${station.id === MINI_WORKSTATION_ID ? '' : ` ${Number(station.id.split('-').at(-1)) + 1}`}`; stationPicker.add(option); }
  const sharedPickup=sharedPickupFor(canvas);
  const sharedVisuals=new Map<string,ReturnType<typeof createSharedPickupVisual>>();
  function pickupVisual(id:string){
    const entry=agents.entries.get(id);if(!entry||!sharedPickup)return;
    let visual=sharedVisuals.get(id);
    if(visual&&visual.mesh!==entry.mesh){visual.dispose();visual=undefined;}
    if(!visual){visual=createSharedPickupVisual(entry.mesh,entry.session.avatar??DEFAULT_AVATAR,`agent:${id}`,sharedPickup);sharedVisuals.set(id,visual);}
    return visual;
  }
  const held = new Map<string, Position>();
  const pickupMotions=new Map<string,ReturnType<typeof createPickupMotion>>(),heldScreen=new Map<string,{x:number;y:number}>();
  const pickupFacing=new Map<string,THREE.Vector2>();
  let lastGrabScreen={x:0,y:0};
  const listeners = new Map<string, Set<(...args: never[]) => void>>();
  const input = {
    on(name: string, fn: (...args: never[]) => void) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(fn); },
    off(name: string, fn: (...args: never[]) => void) { listeners.get(name)?.delete(fn); },
  };
  const emit = (name: string, ...args: unknown[]) => listeners.get(name)?.forEach(fn => fn(...args as never[]));
  const grab = new GrabManager({ input }, { get isLoggedIn() { return !!data.canChat && data.world?.environment === 'factory25d'; } },
    { send: message => {
      if(message.type==='grab_move'||message.type==='grab_end'){
        const entry=agents.entries.get(message.sessionId),landing=entry&&(message.type==='grab_end'?pickupReleaseLanding(entry.mesh):entry.mesh.userData.pickupLanding);
        if(landing){if(message.type==='grab_end')entry!.mesh.userData.pickupLanding=landing;const world=toFactoryWorld(factoryWorldPoint(landing,entry!.mesh.userData.room));sendFactoryCommand({...message,...world});return;}
      }
      sendFactoryCommand(message);
    } }, {
      get isVortexActive() { return data.world?.events.some(event => event.effect === 'vortex' && event.expiresAt > Date.now()) ?? false; },
      resolveGrabTarget(object) { const id = (object as THREE.Object3D).userData.sessionId; return id ? { sessionId: id } : null; },
      hasGrabTarget: target => agents.entries.has(target.sessionId),
      beginGrab(target, pointer) { pickupVisual(target.sessionId)?.begin();const entry=agents.entries.get(target.sessionId);if(entry)pickupFacing.set(target.sessionId,entry.texture.offset.clone());held.set(target.sessionId, pointer);heldScreen.set(target.sessionId,{...lastGrabScreen}); return true; },
      applyRemoteGrab: (target, pointer) => { held.set(target.sessionId, pointer);heldScreen.delete(target.sessionId); },
      moveGrab: (target, pointer) => { held.set(target.sessionId, pointer);heldScreen.set(target.sessionId,{...lastGrabScreen}); },
      releaseGrab: target => { held.delete(target.sessionId);heldScreen.delete(target.sessionId); },
      workstationDropSlot: target => { const entry=agents.entries.get(target.sessionId),landing=entry&&pickupReleaseLanding(entry.mesh);const pointer=landing?toFactoryWorld(factoryWorldPoint(landing,entry!.mesh.userData.room)):held.get(target.sessionId); return pointer && data.world ? nearestWorkstationSlot(data.world.environment, pointer, 36) : undefined; },
      showGrabHint: (_target, text) => { status.textContent = text; },
    });
  const avatarEditor = createAvatarEditor(
    () => preview || factoryHost() === location.origin ? data.principal : undefined,
    () => { state.release(); grab.release(); panel.open = false; avatarRequested = false; avatarNotice = ''; paint(); },
    () => { avatarNotice = preview ? 'avatar saved in this playground' : 'avatar saved for your agents'; void refreshPortrait(true); paint(); },
    avatarScene, preview ? previewAvatar : undefined);
  const toolbarFocus = createToolbarFocus(toolbar, available, () => avatarEditor.requestClose());
  const controlIdentity = toolbar.querySelector<HTMLElement>('.factory-control-identity')!;
  const contextAction = toolbar.querySelector<HTMLButtonElement>('.factory-context-action')!;
  contextAction.addEventListener('click', () => {
    if (toolbarFocus.name()) { toolbarFocus.back(); return; }
    if (state.active || state.pending) { state.release(); paint(); return; }
    if (!data.principal) { showConnectionGuide(); return; }
    if (state.owned().length) { profileMenu.openAgent(state.owned()[0].sessionId); }
    else openAvatar();
  }, options);
  const editAvatar = document.createElement('button'); editAvatar.textContent = 'edit avatar';
  editAvatar.className = 'factory-edit-avatar';
  panel.querySelector('.factory-session-actions')!.append(editAvatar);
  function openAvatar() {
    if (data.principal && (preview || factoryHost() === location.origin)) { void avatarEditor.open(); return; }
    avatarRequested = true; showConnectionGuide();
  }
  editAvatar.addEventListener('click', openAvatar, options);
  const profileMenu=createProfileMenu(toolbar,avatarShortcut,{
    open:()=>{delete soundDock.dataset.open;panel.open=false;roomMenu.close();},
    preview:(id,canvas)=>{
      const entry=agents.entries.get(id);if(!entry)return;
      const texture=entry.texture,ctx=canvas.getContext('2d')!;
      const sourceRow=Math.round((1-texture.offset.y-texture.repeat.y)/texture.repeat.y);
      const sourceAnimation=AVATAR_ANIMATIONS[sourceRow]??'idle',lifted=pickupMotions.get(id)?.stage==='lifted';
      const animation=lifted?'hold_down':sourceAnimation.startsWith('walk_')?'walk_down':sourceAnimation==='sit_up'?'sit':sourceAnimation==='hold_up'?'hold_down':sourceAnimation;
      const source=avatarSheet(entry.session.avatar??DEFAULT_AVATAR,[animation],[undefined],true).canvas;
      const frame=matchMedia('(prefers-reduced-motion: reduce)').matches?0:Math.round(texture.offset.x*(texture.userData.avatarColumns??4))%4;
      ctx.clearRect(0,0,32,32);ctx.imageSmoothingEnabled=false;
      if(lifted){ctx.fillStyle='#ffffff20';ctx.fillRect(10,30,12,1);ctx.save();ctx.translate(16,14);ctx.rotate((frame%2?1:-1)*.08);ctx.drawImage(source,frame*32,0,32,32,-16,-17,32,32);ctx.restore();}
      else ctx.drawImage(source,frame*32,0,32,32,0,0,32,32);
    },
    edit:()=>toolbarFocus.run(openAvatar),
    go:id=>{if(!available()||!state.owned().some(a=>a.sessionId===id))return;picker.value=id;panel.open=false;goToAgent(id);},
    control:id=>{if(!available()||!data.connected||!state.owned().some(a=>a.sessionId===id))return;picker.value=id;state.claim(id);goToAgent(id);panel.open=!!state.error;paint();},
  });
  const openVolume = () => { profileMenu.close(); roomMenu.close(); panel.open = false; };
  soundDock.addEventListener('pointerenter', openVolume, options);
  soundDock.addEventListener('focusin', openVolume, options);
  panel.addEventListener('toggle',()=>{if(panel.open){profileMenu.close();roomMenu.close();}},options);
  function goToAgent(id:string){
    const entry=agents.entries.get(id);if(!entry)return;
    visit((entry.mesh.userData.room as FactoryRoom|undefined)??factoryRoomAt({x:entry.lastX,z:entry.lastZ}));
  }

  function paintAttention() {
    const items = personalAgentAttention(data), summary = agentAttentionSummary(items);
    attentionCount.hidden = !summary; attentionCount.textContent = summary;
    attentionCount.dataset.kind = items.some(item => item.kind === 'input' || item.kind === 'permission')
      ? 'input' : items.some(item => item.kind === 'error') ? 'error' : 'ready';
    panel.querySelector<HTMLElement>('.factory-connection')!.hidden = !!summary;
    attentionSection.hidden = !data.principal || (data.connected && !items.length);
    attentionSection.dataset.stale = String(!data.connected);
    panel.querySelector('.factory-attention-heading')!.textContent = data.connected ? 'your agent updates' : 'agent updates paused';
    panel.querySelector('.factory-attention-help')!.textContent = data.connected
      ? 'Reply in the app or terminal running your agent.' : 'Reconnecting. We’ll check your agents when the factory is live again.';
    const next = JSON.stringify(items);
    if (next !== attentionSignature) {
      attentionSignature = next; attentionList.replaceChildren();
      for (const item of items) {
        const row = document.createElement('li'); row.dataset.kind = item.kind;
        const task = document.createElement('strong'); task.textContent = item.task;
        const purpose = document.createElement('span'); purpose.textContent = item.purpose;
        const find = document.createElement('button'); find.textContent = 'find agent'; find.setAttribute('aria-label', `Find agent: ${item.task}`);
        find.addEventListener('click', () => {
          const found = findPersonalAttentionAgent(data, item.sessionId,
            id => agents.entries.get(id)?.mesh.userData.room as FactoryRoom | undefined, visit);
          if (found) { panel.open = false; (document.activeElement as HTMLElement)?.blur(); }
          else { placementNotice = 'That agent’s view changed. Check the latest agent updates.'; paint(); }
        });
        row.append(task, purpose, find); attentionList.append(row);
      }
    }
    const fresh = attentionEpisodes.update(data);
    if (fresh.length) attentionAnnouncer.textContent = fresh.length === 1
      ? `${fresh[0].task}: ${fresh[0].purpose}.` : `Your agents: ${agentAttentionSummary(fresh)}.`;
    else if (!data.connected || !items.length) attentionAnnouncer.textContent = '';
  }
  function paint() {
    nextProfileUpdate=0;
    const phase = factoryControlPhase(state, data.connected, connecting, connectionError);
    if (panel.dataset.state !== phase) panel.dataset.state = phase;
    panel.querySelector('.factory-connection')!.textContent = state.active ? 'you’re in control' : data.connected ? `${data.agents.length} ${preview ? 'sample' : 'live'}` : 'reconnecting';
    paintAttention();
    panel.querySelector('.factory-controls-heading')!.textContent = avatarRequested ? 'my avatar' : connecting ? 'connect your browser' : 'agents';
    if (connecting) panel.querySelector<HTMLElement>('.factory-connection')!.hidden = true;
    panel.querySelector('.factory-auth')!.textContent = data.principal ? `connected as ${data.principal.username}` : preview ? 'watching the local playground' : 'watching the shared factory';
    const help = {
      watching: 'connect this browser to customize your character and join with your agents.',
      connecting: 'connect once to save your character.',
      empty: 'you can customize your avatar now. start a new agent session to walk around with it.',
      ready: 'choose an agent, then take control to walk around.',
      claiming: 'waiting for the factory to hand you the controls…',
      controlling: 'you’re in. walk around or pick a reaction from the emote bar.',
      reconnecting: 'reconnecting to the factory. movement is paused.',
      error: 'we couldn’t finish that step. you can try again.',
    };
    panel.querySelector('.factory-step-help')!.textContent = help[phase];
    panel.querySelector<HTMLElement>('.factory-connect-guide')!.hidden = !connecting || !!data.principal || (!preview && factoryHost() !== location.origin);
    paintToolbar();
    const list = state.owned(), items = agentPickerItems(list), next = JSON.stringify(items);
    if (next !== signature) {
      const selected = picker.value; picker.replaceChildren(); signature = next;
      for (const item of items) { const option = document.createElement('option'); option.value = item.value; option.textContent = item.label; picker.add(option); }
      if (list.some(a => a.sessionId === selected)) picker.value = selected;
    }
    picker.disabled = list.length === 0 || !data.connected;
    panel.querySelector<HTMLElement>('.factory-agent-section')!.hidden = picker.disabled;
    const occupied = new Set(data.world?.agents.filter(a => a.world.zone === 'work' && a.sessionId !== picker.value).map(a => a.world.slotIndex));
    for (const tombstone of data.world?.tombstones ?? []) if (tombstone.sessionId !== picker.value) occupied.add(tombstone.slotIndex);
    for (const option of stationPicker.options) {
      const supported = Number(option.value) < (data.world?.workstationCount ?? 18);
      const personal = WORKSTATIONS[Number(option.value)]?.id === MINI_WORKSTATION_ID;
      const eligible = !personal || list.find(agent => agent.sessionId === picker.value)?.username === MINI_WORKSTATION_USERNAME;
      option.hidden = !eligible;
      const visitingMini = personal && data.world?.agents.some(agent => agent.world.carVisit?.car === 'mini');
      option.disabled = occupied.has(Number(option.value)) || !supported || !eligible || !!visitingMini;
      option.title = supported ? '' : 'This factory server needs the garage update';
    }
    if (stationPicker.selectedOptions[0]?.disabled) stationPicker.value = [...stationPicker.options].find(option => !option.disabled)?.value ?? '';
    stationPicker.disabled = !data.canChat || data.world?.environment !== 'factory25d';
    placeButton.disabled = picker.disabled || stationPicker.disabled || !!placement || !stationPicker.selectedOptions.length || stationPicker.selectedOptions[0]?.disabled === true;
    claim.disabled = picker.disabled || !!state.pending || picker.value === state.active;
    claim.textContent = state.pending ? 'connecting…' : state.active === picker.value ? 'controlling' : 'take control';
    release.disabled = !state.active && !state.pending;
    release.hidden = release.disabled;
    claim.hidden = !!state.active && picker.value === state.active;
    release.textContent = state.pending ? 'cancel' : 'release';
    for (const button of panel.querySelectorAll<HTMLButtonElement>('.factory-movement button, .factory-shoot, .factory-open-emotes')) button.disabled = !state.active || !!controlledAgent()?.manualControl?.elevatorTrip;
    const controlled = controlledAgent()?.manualControl;
    const trip = controlled?.elevatorTrip;
    panel.dataset.walkRoom = controlled ? factoryRoomAt(fromFactoryWorld(trip?.arrival ?? controlled)) : '';
    panel.dataset.travelling = String(!!trip);
    status.textContent = connectionError || state.error || placementNotice || (trip ? `riding ${panel.dataset.walkRoom === 'garage' ? 'down to the garage' : 'up to the factory'}…` : '');
    panel.classList.toggle('is-controlling', !!state.active);
    editAvatar.hidden = !data.principal;
    editAvatar.title = 'Customize the look of your agents';
    avatarShortcut.dataset.tooltip = 'your agents & avatar';
    if (avatarNotice && !connectionError && !state.error) status.textContent = avatarNotice;
    emoteBar.sync(!!state.active, movementAvailable());
  }
  let toolbarSignature = '';

  const toolbarTooltip = createToolbarTooltip(toolbar);
  const roomMenu = createRoomMenu(toolbar, roomPicker, destination => {
    if (navigating()) { visit(destination); return; }
    toolbarFocus.run(() => { state.stop(); panel.open = false; visit(destination); });
  }, undefined,()=>{profileMenu.close();panel.open=false;});
  const menuSize = new ResizeObserver(entries => {
    for(const {target} of entries) if(!(target as HTMLElement).hidden) toolbar.style.setProperty('--menu-height', `${target.getBoundingClientRect().height}px`);
  });
  toolbar.querySelectorAll('.factory-room-menu,.factory-profile-menu').forEach(menu => menuSize.observe(menu));
  const islandTransitions = createIslandTransitions(toolbar);
  let nextRoomCount = 0, nextProfileUpdate = 0;
  let roomCounts = {factory:0,patio:0,garage:0};
  function paintToolbar() {
    const basketballTools=document.querySelector<HTMLElement>('.visitor-ball-hint');
    const basketballFocused=toolbarFocus.name()==='basketball';
    const basketballDockIndex=docked.findIndex(item=>item.element===basketballTools);
    if(!basketballFocused&&basketballDockIndex>=0){
      const [item]=docked.splice(basketballDockIndex,1);
      item.anchor.replaceWith(item.element);item.element.classList.add('pixel-island');item.group.remove();toolbarSignature='';
    }
    if(basketballFocused&&basketballTools&&basketballDockIndex<0){
      const anchor=document.createComment('basketball controls');basketballTools.before(anchor);
      const group=document.createElement('div');group.className='factory-view-group';group.hidden=true;
      basketballTools.classList.remove('pixel-island');group.append(basketballTools);viewTools.append(group);
      docked.push({element:basketballTools,anchor,group,view:'basketball'});toolbarSignature='';
    }
    const focused = toolbarFocus.name();
    const now = performance.now();
    if(now >= nextRoomCount) {
      nextRoomCount = now + 500; roomCounts = {factory:0,patio:0,garage:0};
      for(const entry of agents.entries.values()) roomCounts[(entry.mesh.userData.room as FactoryRoom) ?? factoryRoomAt({x:entry.lastX,z:entry.lastZ})]++;
    }
    if (focused && panel.open) panel.open = false;
    const model = factoryToolbarState({ connected:data.connected, signedIn:!!data.principal,
      owned:state.owned().length, active:!!state.active, pending:!!state.pending,
      controlName:(()=>{const agent=state.agents.find(agent=>agent.sessionId===(state.active||state.pending)); return agent?.sessionName||agent?.cwd.split('/').filter(Boolean).at(-1)||agent?.username;})(),
      focused, blocked:!available(), room:currentRoom() });
    profileMenu.render(now);
    if(now>=nextProfileUpdate) { nextProfileUpdate=now+500;
    profileMenu.update(state.owned().map(agent=>{
      const entry=agents.entries.get(agent.sessionId);
      const room=entry?((entry.mesh.userData.room as FactoryRoom)??factoryRoomAt({x:entry.lastX,z:entry.lastZ})):'factory';
      return {id:agent.sessionId,name:agent.sessionName||agent.cwd.split('/').filter(Boolean).at(-1)||agent.username,
        detail:`${room==='factory'?'arcade':room} · ${agent.activity}`,controlled:state.active===agent.sessionId,
        pending:state.pending===agent.sessionId,unavailable:!!agent.manualControl&&state.active!==agent.sessionId};
    }),data.connected,available(),state.error);
    }
    // This runs with the scene. Only mutate the DOM when the visible state changes.
    const signature = JSON.stringify(model);
    roomPicker.disabled = model.navigationDisabled && !navigating();
    if (signature === toolbarSignature) { roomMenu.update(displayedRoom(),roomCounts,data.connected,!!focused || (!available() && !navigating())); return; }
    roomMenu.update(displayedRoom(),roomCounts,data.connected,!!focused || (!available() && !navigating()));
    toolbarSignature = signature;
    toolbar.dataset.identity = model.identity; toolbar.dataset.view = model.view; toolbar.dataset.control = model.controlMode; toolbar.dataset.reconnecting = String(model.reconnecting);
    controlIdentity.hidden = !model.controlStatus;
    controlIdentity.querySelector('.factory-control-caption')!.textContent = model.controlStatus;
    controlIdentity.querySelector('.factory-control-name')!.textContent = model.controlName;
    controlIdentity.setAttribute('aria-label', `${model.controlStatus} ${model.controlName}`);
    // Keep keyboard order aligned with the visible Back-first layout.
    if (focused) viewTools.before(contextAction); else { avatarShortcut.before(controlIdentity); avatarShortcut.before(contextAction); }
    roomPicker.disabled = model.navigationDisabled && !navigating();
    avatarShortcut.hidden = !model.showProfile;
    roomPicker.hidden = !model.showRoomTools;
    for (const item of docked) item.group.hidden = item.view !== model.tools && !(focused === 'duck hunt' && item.view === 'patio');
    if (avatarShortcut.nextElementSibling !== soundDock) avatarShortcut.after(soundDock);
    if ((!focused && model.tools === 'patio') || focused === 'duck hunt') soundDock.after(viewTools);
    else if (!focused) roomPicker.after(viewTools);
    viewTools.hidden = !docked.some(item => !item.group.hidden);
    const soloBack = model.action === 'back' && !model.showProfile && !model.showRoomTools && viewTools.hidden;
    toolbar.classList.toggle('factory-solo-back', soloBack);
    focusTitle.textContent = focused ?? '';
    focusTitle.hidden = model.action === 'back' || !focused || focused === 'window' || focused === 'whiteboard';
    avatarShortcut.disabled = model.navigationDisabled;
    avatarShortcut.setAttribute('aria-label', model.profileLabel);
    avatarShortcut.setAttribute('aria-pressed', String(model.profileSelected));
    contextAction.hidden = !model.showPrimary;
    contextAction.disabled = model.primaryDisabled;
    contextAction.setAttribute('aria-busy',String(model.action==='reconnect'));
    contextAction.dataset.action = model.action;
    contextAction.setAttribute('aria-label', model.label);
    contextAction.querySelector('.factory-nav-label')!.textContent = model.action === 'back' ? focused ?? model.label : model.label;
    contextAction.querySelector('.factory-nav-icon')!.innerHTML = contextIcons[model.action === 'release' || model.action === 'cancel' ? 'stop'
      : model.action === 'customize' ? 'help' : model.action];
    contextAction.dataset.tooltip = focused ? `Return from ${focused}` : model.action === 'connect' ? 'Connect this browser to customize your character'
      : model.action === 'customize' ? 'Customize your avatar, even without an active agent'
      : model.action === 'find' ? 'Find your agent and open their controls' : model.action === 'release' ? 'Stop controlling this agent' : model.label;
  }

  function selectAgent(sessionId: string) {
    if (!available() || !state.owned().some(agent => agent.sessionId === sessionId)) return;
    picker.value = sessionId; placementNotice = ''; avatarRequested = false;
    panel.open = false; state.stop(); nextProfileUpdate=0; paint(); profileMenu.openAgent(sessionId);
    const details=agents.entries.get(sessionId)?.label.element.querySelector<HTMLElement>('.agent-details');if(details)details.hidden=true;
  }
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('.agent-label[data-session-id] .agent-name') : null;
    const id = target?.closest<HTMLElement>('.agent-label')?.dataset.sessionId;
    if (id && event.detail === 0) selectAgent(id);
  }, options);
  function findAgent() {
    const entry = agents.entries.get(state.active ?? picker.value); if (entry) visit((entry.mesh.userData.room as FactoryRoom | undefined) ?? 'factory');
  }
  claim.addEventListener('click', () => { state.claim(picker.value); findAgent(); (document.activeElement as HTMLElement)?.blur(); paint(); }, options);
  release.addEventListener('click', () => { state.release(); paint(); }, options);
  picker.addEventListener('change', () => { state.release(); state.error = ''; paint(); }, options);
  stationPicker.addEventListener('change', () => { placementNotice = ''; paint(); }, options);
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
    button.addEventListener('pointerdown', event => { if (!movementAvailable()) return; pressedAt = performance.now(); event.preventDefault(); button.setPointerCapture(event.pointerId); state.move(key, true); }, options);
    button.addEventListener('keydown', event => { if (movementAvailable() && (event.key === ' ' || event.key === 'Enter')) { event.preventDefault(); state.move(key, true); } }, options);
    button.addEventListener('keyup', event => { if (event.key === ' ' || event.key === 'Enter') state.move(key, false); }, options);
    // A quick tap must span a server tick; assistive clicks have no pointerdown.
    button.addEventListener('click', event => {
      if (!movementAvailable()) return;
      const heldFor = event.detail === 0 || !pressedAt ? 0 : performance.now() - pressedAt;
      if (heldFor < 140) { state.move(key, true); setTimeout(() => state.move(key, false), 140 - heldFor); }
      pressedAt = 0;
    }, options);
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, () => state.move(key, false), options);
  }
  const movementKeys: Record<string, 'up' | 'down' | 'left' | 'right'> = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };
  document.addEventListener('keydown', event => {
    const target = event.target as HTMLElement;
    if (!state.active || !movementAvailable() || target?.closest('input,textarea,select,[contenteditable="true"]')) return;
    // Clicking a control must not strand the B/WASD shortcuts on its focused
    // button. Space still belongs to the focused button's native activation.
    if (event.code === 'Space' && target?.closest('button,summary')) return;
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
  const heartbeat = setInterval(() => { if (document.hidden || !movementAvailable()) stop(); else state.heartbeat(); }, 500);
  const stopMessages = onFactoryMessage(message => {
    if(message.type==='pickup_state'||message.type==='pickup_result'||message.type==='room_props_state'||message.type==='room_prop_result')return;
    if (message.type === 'grab_result' && placement && message.sessionId === placement.sessionId) {
      if (message.success && message.action === 'start') sendFactoryCommand({ type: 'grab_end', ...placement });
      else { if (!message.success) state.error = message.error || 'That station is unavailable.'; else visit(WORKSTATIONS[placement.workstationSlot].room); placement = undefined; }
    }
    state.handle(message); grab.handleMessage(message); if(state.error)panel.open=true; paint(); });
  const stopConnection = onFactoryConnection(connected => { placement = undefined; state.reset(); grab.handleConnected(); if (!connected) held.clear(); data = { ...data, connected }; paint(); });
  const ray = new THREE.Raycaster(), point = new THREE.Vector3(), garageFloor = new THREE.Plane(new THREE.Vector3(0,1,0),-GARAGE_LEVEL);
  function pointer(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), camera());
    if (currentRoom() === 'garage' ? !ray.ray.intersectPlane(garageFloor,point) : !intersectFactoryFloor(ray.ray, point)) return null;
    const world = pickupLanding(point,currentRoom()); return { id: event.pointerId, worldX: world.x, worldY: world.y };
  }
  let dragPointer: number | undefined;
  let captureTarget: HTMLElement | undefined;
  let agentPress: { id: string; x: number; y: number; worldX: number; worldY: number; moved: boolean } | undefined;
  const pointerOptions = { ...options, capture: true };
  function beginAgentPress(event: PointerEvent, mesh: THREE.Object3D, target: HTMLElement) {
    if (dragPointer !== undefined || document.body.classList.contains('basketball-input-active') || canvas.classList.contains('holding-basketball')) return;
    lastGrabScreen={x:event.clientX,y:event.clientY};
    const p = pointer(event); if (!p) return;
    agentPress = { id: mesh.userData.sessionId, x: event.clientX, y: event.clientY, worldX: p.worldX, worldY: p.worldY, moved: false };
    dragPointer = event.pointerId; captureTarget = target;
    event.preventDefault(); event.stopImmediatePropagation();
    state.stop(); target.setPointerCapture(event.pointerId); emit('gameobjectdown', p, mesh);
  }
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !available() || !pointer(event)) return;
    const hit = ray.intersectObjects([...agents.entries.values()].filter(entry => entry.mesh.visible && entry.mesh.userData.room === currentRoom()).map(entry => entry.mesh), false)[0];
    if (hit) beginAgentPress(event, hit.object, canvas);
  }, pointerOptions);
  // The label's hit area extends over the sprite. Route both surfaces through
  // the same tap/drag gesture so its accessible button does not swallow grabs.
  document.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !available() || !(event.target instanceof Element)) return;
    const target = event.target.closest<HTMLElement>('.agent-label[data-session-id] .agent-name');
    const id = target?.closest<HTMLElement>('.agent-label')?.dataset.sessionId;
    const entry = id ? agents.entries.get(id) : undefined;
    if (target && entry?.mesh.visible && entry.mesh.userData.room === currentRoom()) beginAgentPress(event, entry.mesh, target);
  }, pointerOptions);
  function moveAgentPress(event: PointerEvent) {
    if (dragPointer !== event.pointerId) return;
    lastGrabScreen={x:event.clientX,y:event.clientY};
    if(agentPress&&held.has(agentPress.id))heldScreen.set(agentPress.id,{...lastGrabScreen});
    event.stopImmediatePropagation(); const p = pointer(event);
    if (agentPress && (Math.hypot(event.clientX - agentPress.x, event.clientY - agentPress.y) >= 6
      || p && Math.hypot(p.worldX - agentPress.worldX, p.worldY - agentPress.worldY) >= GRAB_DRAG_THRESHOLD)) agentPress.moved = true;
    if (p) emit('pointermove', p);
  }
  function endAgentPress(event: PointerEvent) {
    if (dragPointer !== event.pointerId) return;
    dragPointer = undefined; event.stopImmediatePropagation();
    const press = agentPress; agentPress = undefined;
    const p = pointer(event); if (p) emit('pointerup', p); else grab.release();
    if (captureTarget?.hasPointerCapture(event.pointerId)) captureTarget.releasePointerCapture(event.pointerId);
    captureTarget = undefined;
    if (press && !press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 6) selectAgent(press.id);
  }
  document.addEventListener('pointermove', moveAgentPress, pointerOptions);
  document.addEventListener('pointerup', endAgentPress, pointerOptions);
  function cancelAgentPress(event: PointerEvent) {
    if (event.pointerId !== dragPointer) return;
    dragPointer = undefined; captureTarget = undefined; agentPress = undefined; grab.release();
  }
  document.addEventListener('pointercancel', cancelAgentPress, options);
  document.addEventListener('lostpointercapture', cancelAgentPress, options);
  const sessionActions = panel.querySelector('.factory-session-actions')!;
  const login = document.createElement('button'); login.textContent = 'connect this browser'; login.className = 'factory-login'; login.dataset.preview = String(preview); sessionActions.append(login);
  const deviceLinks = !preview && factoryHost() === location.origin ? createDeviceLinks(() => data.principal) : undefined;
  const devicesButton = document.createElement('button'); devicesButton.textContent = 'link / manage devices'; devicesButton.hidden = true; sessionActions.append(devicesButton);
  devicesButton.addEventListener('click', () => deviceLinks?.open(), options);
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
  const liveLink = document.createElement('a'); liveLink.href = new URL('/', factoryHost()).href;
  liveLink.target = '_blank'; liveLink.rel = 'noopener'; liveLink.textContent = 'open the live factory to customize ↗'; liveLink.hidden = true; sessionActions.append(liveLink);
  function showConnectionGuide() {
    connectionError = ''; state.error = ''; connecting = true; panel.open = true;
    liveLink.hidden = preview || factoryHost() === location.origin;
    paint();
    (liveLink.hidden ? panel.querySelector<HTMLButtonElement>('.factory-copy-login')! : liveLink).focus({ preventScroll: true });
  }
  login.addEventListener('click', () => {
    if (preview) { connectControlPreview(); paint(); return; }
    showConnectionGuide();
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
    if (next.world && next.world !== data.world) clockOffset = next.world.serverTime - Date.now();
    data = next; void refreshPortrait(); state.sync(next.world?.agents ?? [], next.principal?.ownerId); avatarEditor.sync();
    login.hidden = !!next.principal; login.disabled = !next.connected;
    logout.hidden = !next.principal; devicesButton.hidden = !deviceLinks || !next.principal; deviceLinks?.sync(); paint();
    if (avatarRequested && next.principal && panel.open && (preview || factoryHost() === location.origin)) openAvatar();
  }
  const stopPreview = onControlPreview((scenario, next) => {
    state.reset(); state.error = ''; connectionError = ''; avatarRequested = false; connecting = scenario === 'connecting' || scenario === 'expired';
    avatarEditor.invalidate(); visit(scenario === 'garage' || scenario === 'mini-laptop' ? 'garage' : 'factory'); syncData(next);
    panel.querySelector<HTMLDetailsElement>('.factory-station-section')!.open = false;
    if (scenario === 'expired') connectionError = 'That connection link expired. Connect again to get a fresh link.';
    if (['claiming', 'controlling', 'error'].includes(scenario)) state.claim(picker.value);
    paint();
  });
  paint();
  return {
    state, controlledAgent, serverNow: () => Date.now() + clockOffset,
    visitGarageCar(car: GarageCarId): {message:string;sessionId?:string} {
      const agent = state.owned().find(agent => agent.sessionId === (state.active ?? picker.value));
      if (!agent) { panel.open = true; return {message:'Choose one of your idle agents in agent controls.'}; }
      if (!data.world?.garageCars) return {message:'Car visits are ready here; the shared factory server needs this update.'};
      if (agent.activity !== 'idle') return {message:'Your agent is working. They can try a car on their next break.'};
      if (agent.manualControl) return {message:'Release your agent’s walking controls before sending them to a car.'};
      if (agent.world.carVisit || agent.world.idleVisit) return {message:'Your agent is already visiting a car.'};
      if (!sendFactoryCommand({type:'garage_car',sessionId:agent.sessionId,car})) return {message:'Connection lost. Try again when the factory reconnects.'};
      panel.open = false;
      return {message:'calling your agent…',sessionId:agent.sessionId};
    },
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
      toolbarFocus.update(); paintToolbar();
      const riding = !!controlledAgent()?.manualControl?.elevatorTrip;
      if (wasRiding && !riding && state.active) { state.stop(); state.heartbeat(); }
      wasRiding = riding;
      const destination = roomFollower.update(controlledAgent(), data.world?.environment);
      if (destination) { visit(destination); (document.activeElement as HTMLElement)?.blur(); }
      emoteBar.sync(!!state.active, movementAvailable());
      if (!movementAvailable()) stop();
      grab.update();
      for (const [id, pointer] of held) {
        const entry = agents.entries.get(id); if (!entry) continue;
        if(sharedPickup&&!pickupVisual(id)?.owns())continue;
        if(!pickupMotions.has(id))pickupMotions.set(id,createPickupMotion(entry.mesh,entry.session.avatar??DEFAULT_AVATAR));
        if(!heldScreen.has(id)){
          const point=fromFactoryWorld(pointer),projected=new THREE.Vector3(point.x,.9,point.z).project(camera()),rect=canvas.getBoundingClientRect();
          heldScreen.set(id,{x:rect.left+(projected.x+1)*rect.width/2,y:rect.top+(1-projected.y)*rect.height/2});
        }
      }
      // Shared poses are delivered even after the grab lease ends, through the
      // throw/hoop animation and landing. Late joiners enter at the current pose.
      if(sharedPickup)for(const id of new Set([...sharedVisuals.keys(),...Array.from(sharedPickup.targets()).filter(id=>id.startsWith('agent:')).map(id=>id.slice(6))])){
        const entry=agents.entries.get(id);if(!entry)continue;
        const visual=pickupVisual(id)!;visual.rememberHome();
        if(visual.applyRemote()){
          const motion=pickupMotions.get(id);if(motion){motion.dispose();pickupMotions.delete(id);visual.applyRemote();}
          updatePickupShadow(entry.mesh,entry.shadow,camera(),entry.mesh.userData.pickupRemoteAirborne,entry.labelFeet);
          entry.label.element.hidden=true;
        }
      }
      for(const [id,motion] of pickupMotions){
        if(!agents.entries.has(id)){motion.dispose();pickupMotions.delete(id);pickupFacing.delete(id);continue;}
        if(sharedPickup&&!sharedVisuals.get(id)?.owns()){motion.dispose();pickupMotions.delete(id);held.delete(id);heldScreen.delete(id);if(grab.holding?.sessionId===id)grab.release();continue;}
        if(held.has(id)){const texture=agents.entries.get(id)!.texture;if(motion.stage==='lifted')setAvatarTextureFrame(texture,0,0);else {const facing=pickupFacing.get(id);if(facing)texture.offset.copy(facing);}}
        motion.update(camera(),canvas,held.has(id)?heldScreen.get(id):undefined);
        const entry=agents.entries.get(id)!;
        updatePickupShadow(entry.mesh,entry.shadow,camera(),motion.shadowAirborne,entry.labelFeet);
        if(motion.active)entry.label.element.hidden=true;
        const visual=sharedVisuals.get(id);if(visual?.owns()&&motion.stage!=='idle')visual.publish(motion.stage);
        if(!held.has(id)&&!motion.active){visual?.finish();motion.dispose();pickupMotions.delete(id);pickupFacing.delete(id);}
      }
      for(const [id,visual] of sharedVisuals)if(!agents.entries.has(id)){visual.dispose();sharedVisuals.delete(id);}
    },
    dispose() { deviceLinks?.dispose(); for(const visual of sharedVisuals.values())visual.dispose();islandTransitions.dispose(); menuSize.disconnect(); soundObserver.disconnect(); clearInterval(soundMeter); if(soundPanel) soundAnchor.replaceWith(soundPanel); soundDock.remove(); quickMute.remove(); for(const motion of pickupMotions.values())motion.dispose();profileMenu.dispose(); roomMenu.dispose(); toolbarTooltip.dispose(); toolbarFocus.dispose(); avatarEditor.dispose(); emoteBar.dispose(); stop(); state.release(); grab.destroy(); clearInterval(heartbeat); stopMessages(); stopConnection(); stopPreview(); abort.abort(); sizeToolbar.disconnect(); for (const { element, anchor } of docked) { if (element.isConnected) anchor.replaceWith(element); else anchor.remove(); } toolbar.remove(); document.body.classList.remove('factory-toolbar-ready'); document.body.style.removeProperty('--factory-toolbar-height'); panel.remove(); attentionAnnouncer.remove(); },
  };
}
