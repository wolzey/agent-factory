import { createInteractionGlow } from './factory25dInteractionGlow';
import * as THREE from 'three';
import { DJ_BOOTH, INTERIOR_Z } from '@shared/factory25d-layout';
import {createDjStation} from './factory25dDjStation';
import {createDjDecks} from './factory25dDjDecks';
import { onFactoryMessage, onFactoryConnection, sendFactoryCommand, isControlPreview } from './factory25dBoardData';
import { LoungeRadioQueue, DJ_VIDEOS, type RadioState, type RadioRequest } from '@shared/lounge-radio';
import './factory25dLoungeRadio.css';
import { createYoutubePlayer } from './factory25dYoutubePlayer';
import { createRecordScratch } from './factory25dRecordScratch';
import { createRadioDj } from './factory25dRadioDj';
import { RoomMusicGain } from './factory25dMusicMeter';
import { setHidden, setPixels } from './dom';

/** Lounge DJ decks, with a nonmodal queue above the existing shared dock. */
export function createLoungeRadio(parent: THREE.Group, canvas: HTMLCanvasElement, initialCamera: THREE.Camera,
  callbacks: { preferences(): { enabled: boolean; volume: number }; enable(): void }) {
  const group = new THREE.Group(); group.name = 'lounge-radio'; group.position.set(DJ_BOOTH.x, .018, DJ_BOOTH.z-INTERIOR_Z-.12); parent.add(group);
  const decks=createDjDecks(group),receiver=decks.booth;
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const panel = document.createElement('section'); panel.className = 'lounge-radio-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Lounge radio');
  panel.innerHTML = `<header><h2>room queue</h2><button type="button" aria-label="Close radio">×</button><button type="button" class="radio-decks" aria-label="Show records">records</button></header><div class="radio-browser"><aside><h3>now playing</h3><div class="radio-video"></div><p class="radio-playing"></p><div class="radio-actions"><button type="button" class="radio-listen">listen</button><button type="button" class="radio-skip">skip song</button></div></aside><main><form><div class="radio-add"><input id="radio-video-url" type="search" aria-label="Search YouTube or paste a link" placeholder="Search YouTube or paste a link" required maxlength="200"><button type="submit">search</button></div></form><section class="radio-results" hidden aria-label="YouTube search results"></section><h3>up next <span class="radio-queue-count"></span></h3><ol aria-label="Shared song queue"></ol></main></div><p class="radio-feedback" role="status"></p>`;
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'lounge-radio-target'; trigger.textContent = 'radio';
  trigger.title = 'Lounge radio · open song queue';
  trigger.setAttribute('aria-label', 'Open lounge radio and song queue'); trigger.setAttribute('aria-expanded', 'false');
  const close = panel.querySelector('header button') as HTMLButtonElement;
  const playing = panel.querySelector('.radio-playing')!;
  const input = panel.querySelector('input')!;
  const form = panel.querySelector('form')!;
  const queue = panel.querySelector('ol')!;
  const feedback = panel.querySelector('.radio-feedback')!;
  document.body.append(trigger, panel);
  const interactionGlow = createInteractionGlow(receiver, trigger);
  let state: RadioState | undefined, pending = false, timeout = 0, visible = false, camera = initialCamera;
  const preview = isControlPreview() ? new LoungeRadioQueue() : undefined;
  let nextPreviewTick = 0, nextPaint = 0;
  let paintRevision = -1,draggedId:number|undefined;
  const titles=new Map<string,string>();
  const results=panel.querySelector<HTMLElement>('.radio-results')!;
  let searchRequest:AbortController|undefined;
  const videoHost = panel.querySelector<HTMLElement>('.radio-video')!;
  const videoHome = document.createComment('radio video home'); videoHost.before(videoHome);
  const roomGain = new RoomMusicGain();
  let lastRoomTime = performance.now(), paintedGain = 1;
  const player = createYoutubePlayer(videoHost, {
    ...callbacks, background: true,
    preferences: () => { const prefs = callbacks.preferences(); return {...prefs, volume: prefs.volume * roomGain.value}; },
    playback: active => { if(soundHost) soundHost.dataset.playing = String(active); }, feedback: message => { feedback.textContent = message; },
    duration: (entryId, seconds) => command({ type: 'radio_queue', action: 'duration', entryId, seconds }),
  });
  const soundHost = document.querySelector<HTMLElement>('.scene-sound');
  const nowPlaying = document.createElement('p'); nowPlaying.className = 'factory-audio-now-playing';
  const dockDetails = document.createElement('div'); dockDetails.className = 'radio-dock-details';
  const joinMusic = document.createElement('button'); joinMusic.type = 'button'; joinMusic.textContent = 'join music'; joinMusic.hidden = true;
  joinMusic.addEventListener('click', () => player.play());
  dockDetails.append(nowPlaying, joinMusic); soundHost?.append(dockDetails);
  const transport = document.createElement('section'); transport.className='island-music-player';
  transport.innerHTML='<progress max="1" value="0" aria-label="Song progress"></progress><div class="island-track-times"><span>0:00</span><span>0:00</span></div><p class="island-stream-status">Shared DJ stream</p><div class="island-transport"><button type="button" class="radio-play-toggle" aria-label="Play music">▶</button><button type="button" class="radio-next" aria-label="Next track for everyone">next ↦</button></div><p class="island-player-feedback" role="status"></p><button type="button" class="island-player-retry" hidden>retry playback</button>';
  videoHost.after(transport);
  const credits = document.createElement('a'); credits.href = '/audio/factory/credits.html'; credits.target = '_blank'; credits.rel = 'noopener'; credits.textContent = 'credits'; transport.append(credits);
  const timeline=transport.querySelector('progress')!, timeLabels=transport.querySelectorAll('.island-track-times span');
  const playToggle=transport.querySelector<HTMLButtonElement>('.radio-play-toggle')!;
  const nextTrack=transport.querySelector<HTMLButtonElement>('.radio-next')!;
  const retry = transport.querySelector<HTMLButtonElement>('.island-player-retry')!;
  retry.onclick = () => { player.reset(); player.play(); };
  const timestamp=(n:number)=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
  playToggle.onclick=()=>{if(player.progress().playing)player.pause();else player.play();};
  nextTrack.onclick=()=>{if(state?.current)command({type:'radio_queue',action:'skip',entryId:state.current.id});};
  function paintTransport(){
    retry.hidden = !feedback.textContent?.includes('Press play to retry.');
    const progress=player.progress(); const length=Number.isFinite(progress.duration)?progress.duration:0;
    if (soundHost) { soundHost.dataset.musicTime = String(progress.time); soundHost.dataset.musicSampleAt = String(performance.now()); }
    joinMusic.hidden = !state?.current || progress.playing;
    joinMusic.textContent = feedback.textContent?.includes('reconnect') ? 'retry music' : 'join music';
    joinMusic.title = feedback.textContent ?? '';
    timeline.max=Math.max(1,length); timeline.value=progress.time;
    timeLabels[0].textContent=timestamp(progress.time);
    timeLabels[1].textContent=timestamp(length);
    playToggle.disabled=!state?.current;nextTrack.disabled=!state?.current;
    playToggle.textContent=progress.playing?'Ⅱ':'▶';playToggle.setAttribute('aria-label',progress.playing?'Pause music':'Play music');
    transport.querySelector('.island-stream-status')!.textContent=progress.playing?'Live with the room':'Play to join the shared DJ stream';
    transport.querySelector('.island-player-feedback')!.textContent=feedback.textContent;
  }
  function paint() {
    playing.textContent = state?.current ? `${state.current.title} · ${state.current.queuedBy}` : 'Connecting to the shared radio…';
    nowPlaying.textContent = state?.current?.title ?? '';
    nowPlaying.title = nowPlaying.textContent;
    if (soundHost) soundHost.dataset.track = state?.current?.title ?? '';

    if (paintRevision !== state?.revision) {
      paintRevision = state?.revision ?? -1; queue.replaceChildren();
      (state?.queue ?? []).forEach((entry, index, entries) => {
        const li = document.createElement('li');
        li.draggable=true;li.addEventListener('dragstart',()=>{draggedId=entry.id;});li.addEventListener('dragover',e=>e.preventDefault());
        li.addEventListener('drop',e=>{e.preventDefault();if(!state||draggedId===undefined)return;const ids=state.queue.map(v=>v.id).filter(id=>id!==draggedId);ids.splice(index,0,draggedId);command({type:'radio_queue',action:'reorder',ids,revision:state.revision});draggedId=undefined;});
        const thumbnail=document.createElement('img');thumbnail.src=`https://i.ytimg.com/vi/${entry.videoId}/default.jpg`;thumbnail.alt='';li.append(thumbnail);
        const name = document.createElement('span'); name.textContent = `${entry.title} · ${entry.queuedBy}`; li.append(name);
        for (const direction of [-1, 1]) {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = direction < 0 ? '↑' : '↓';
          button.setAttribute('aria-label', `Move ${entry.title} ${direction < 0 ? 'up' : 'down'}`);
          button.disabled = index + direction < 0 || index + direction >= entries.length;
          button.addEventListener('click', () => {
            if (!state) return;
            const ids = state.queue.map(item => item.id), currentIndex = ids.indexOf(entry.id), to = currentIndex + direction;
            if (currentIndex < 0 || to < 0 || to >= ids.length) return;
            [ids[currentIndex], ids[to]] = [ids[to], ids[currentIndex]];
            command({ type: 'radio_queue', action: 'reorder', ids, revision: state.revision });
          }); li.append(button);
        }
        const next=document.createElement('button');next.type='button';next.textContent='next';next.title='Play next';next.disabled=index===0;
        next.onclick=()=>{if(state)command({type:'radio_queue',action:'reorder',ids:[entry.id,...state.queue.filter(e=>e.id!==entry.id).map(e=>e.id)],revision:state.revision});};
        const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',`Remove ${entry.title}`);remove.onclick=()=>{if(state)command({type:'radio_queue',action:'remove',entryId:entry.id,revision:state.revision});};li.append(next,remove);
        queue.append(li);
      });
      if (!state?.queue.length) { const li = document.createElement('li'); li.textContent = 'Your next song goes here. The DJ has the quiet moments covered.'; queue.append(li); }
    }
    panel.querySelector('.radio-queue-count')!.textContent=String(state?.queue.length??0);

  }
  function receive(next: RadioState) { state = next; paint(); player.update(state); }
  function settle(error?: string) { pending = false; clearTimeout(timeout); feedback.textContent = error ?? 'Queue updated.'; paint(); }
  function command(message: RadioRequest) {
    if (message.action === 'scratch') return;
    if (message.action !== 'duration' && pending) return;
    if (preview) {
      const now = Date.now();
      const result = message.action === 'add' ? preview.enqueue(message.videoId, 'Local preview', now, titles.get(message.videoId)??DJ_VIDEOS.find(video => video.videoId === message.videoId)?.title)
        : message.action === 'remove' ? preview.remove(message.entryId,message.revision)
        : message.action === 'reorder' ? preview.reorder(message.ids, message.revision)
        : message.action === 'duration' ? preview.duration(message.entryId, message.seconds, now)
        : preview.skip(message.entryId, now);
      receive(preview.snapshot(now)); if (message.action !== 'duration') settle(result.error); return;
    }
    const sent = sendFactoryCommand(message);
    if (message.action === 'duration') return;
    if (!sent) { settle('Connect your browser to change the shared queue.'); return; }
    pending = true; feedback.textContent = 'Updating the shared queue…'; paint();
    timeout = window.setTimeout(() => settle('The radio did not respond. Try again.'), 8000);
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();searchRequest?.abort();searchRequest=new AbortController();
    results.hidden=false;results.textContent='Searching YouTube…';
    try{
      const response=await fetch(`/api/radio/search?q=${encodeURIComponent(input.value.trim())}`,{signal:searchRequest.signal});
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      results.replaceChildren();
      const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='back to queue';dismiss.onclick=()=>{results.hidden=true;};results.append(dismiss);
      for(const video of data.results){
        titles.set(video.videoId,video.title);const row=document.createElement('div');row.className='radio-search-row';
        const image=document.createElement('img');image.src=`https://i.ytimg.com/vi/${video.videoId}/default.jpg`;image.alt='';
        const text=document.createElement('span');text.textContent=`${video.title} · ${video.channel}${video.duration?' · '+video.duration:''}`;
        const add=document.createElement('button');add.type='button';add.textContent='+ queue';add.setAttribute('aria-label',`Add ${video.title} to queue`);
        add.onclick=()=>{command({type:'radio_queue',action:'add',videoId:video.videoId});};row.append(image,text,add);results.append(row);
      }
      if(!data.results.length)results.append('No videos found. Try another search.');
    }catch(error){if((error as Error).name!=='AbortError')results.textContent=(error as Error).message||'Search unavailable. Try a YouTube link.';}
  });
  panel.querySelector('.radio-listen')!.addEventListener('click', () => player.play());
  panel.querySelector('.radio-skip')!.addEventListener('click', () => { if (state?.current) command({ type: 'radio_queue', action: 'skip', entryId: state.current.id }); });
  const station=createDjStation(group,canvas,panel,{listen:()=>player.play(),skip:()=>{if(state?.current)command({type:'radio_queue',action:'skip',entryId:state.current.id});}});
  let minimized = false, joinedRadio = false, deckOnly = false;
  function minimize(value: boolean) { minimized = value; panel.classList.toggle('radio-minimized', value); panel.inert = value; }
  panel.querySelector<HTMLButtonElement>('.radio-decks')!.onclick = () => {
    deckOnly = true; minimize(true);
    close.setAttribute('aria-label', 'Close radio');
  };
  function applyScratch(deck: number, offset: number, entryId: number) {
    decks.scratch(deck, offset); player.scratch(entryId, offset);
  }
  const records = createRecordScratch(decks.records, canvas, (deck, offset) => {
    if (!state?.current) return;
    if (preview) applyScratch(deck, offset, state.current.id);
    else if (!sendFactoryCommand({type: 'radio_queue', action: 'scratch', deck, offset, entryId: state.current.id})) {
      feedback.textContent = 'Connect your browser to scratch the shared music.';
    }
  });
  function hide(restore = false, stop = false) {
    station.setActive(false); deckOnly = false;
    minimize(!stop && (joinedRadio || minimized || player.progress().playing));
    panel.hidden = !minimized;
    close.setAttribute('aria-label', minimized ? 'Stop music and close player' : 'Close radio');
    if (!minimized) player.hide();
    trigger.setAttribute('aria-expanded', 'false');
    if (restore && visible) trigger.focus();
  }
  trigger.addEventListener('click', () => {
    if (!visible) return;
    if (!panel.hidden && !minimized) { hide(true); return; }
    deckOnly = false; minimize(false); panel.hidden = false;
    close.setAttribute('aria-label', 'Close radio');
    station.setActive(true); trigger.setAttribute('aria-expanded', 'true');
    const agents = document.querySelector<HTMLDetailsElement>('.factory-controls'); if (agents) agents.open = false;
    paint(); void player.open(); close.focus();
  });
  close.addEventListener('click', () => hide(true, minimized && !deckOnly));
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !panel.hidden && (!minimized || deckOnly)) { event.stopPropagation(); hide(true); } };
  document.addEventListener('keydown', onKey, true);
  const unsubscribe = onFactoryMessage(message => {
    if (preview) return;
    if (message.type === 'radio_state') receive(message);
    if (message.type === 'radio_scratch' && message.entryId === state?.current?.id
      && message.deck >= 0 && message.deck <= 1 && Math.abs(message.offset) <= .8) {
      applyScratch(message.deck, message.offset, message.entryId);
    }
    if (message.type === 'radio_result' && !message.silent) settle(message.success ? undefined : message.error ?? 'Could not add that song.');
  });
  const stopConnection = onFactoryConnection(connected => { if (!connected && !preview) { state = undefined; if (pending) settle('Connection lost. Reconnect to add music.'); paint(); } });
  if (preview) receive(preview.snapshot(Date.now())); else paint();
  const dj = createRadioDj(parent, canvas, () => trigger.click());
  const playbackTimer = window.setInterval(() => {
    if (preview && preview.advance(Date.now())) receive(preview.snapshot(Date.now()));
    player.update(state); paintTransport();
  }, 500);
  const projected = new THREE.Vector3();
  return {
    group,
    cameraFor:station.cameraFor,
    isActive:station.isActive,
    update(nextCamera: THREE.Camera, isVisible: boolean, outside = false) {
      camera = nextCamera; visible = isVisible;
      const roomTime = performance.now(); roomGain.update(outside, (roomTime - lastRoomTime) / 1000); lastRoomTime = roomTime;
      if (Math.abs(roomGain.value - paintedGain) > .01) { paintedGain = roomGain.value; player.update(state); }
      if ((visible || outside) && state?.current && !joinedRadio) {
        joinedRadio = true; minimize(true); panel.hidden = false;
        close.setAttribute('aria-label', 'Stop music and close player');
        void player.join();
      }
      station.update(camera);
      records.update(camera, visible && deckOnly && station.isActive());
      if (!visible && !panel.hidden && !minimized) hide();
      // One write per frame: the trigger used to be hidden and then shown again whenever the panel was open.
      if (!visible) setHidden(trigger, true);
      if (visible) {
        receiver.localToWorld(projected.set(0, .6, 0)); projected.project(camera);
        setHidden(trigger, projected.z < -1 || projected.z > 1);
        const rect = canvas.getBoundingClientRect();
        const x=rect.left+(projected.x+1)*rect.width/2;
        let y=rect.top+(1-projected.y)*rect.height/2;
        const dock=document.querySelector<HTMLElement>('.factory-toolbar')?.getBoundingClientRect();
        const obscured=!station.isActive()&&dock&&dock.width>0&&x+26>dock.left&&x-26<dock.right&&y+22>dock.top&&y-22<dock.bottom;
        if(obscured)y=dock.top-30;
        // If the booth falls behind the shared dock in a short window, expose
        // its existing target just above the dock instead of inviting a misclick.
        trigger.classList.toggle('lounge-radio-target-offset',!!obscured);
        setPixels(trigger, 'left', x);
        setPixels(trigger, 'top', y);
      }
      const now = performance.now();
      const audioPreferences=callbacks.preferences();
      decks.update(now/1000,player.progress().playing&&audioPreferences.enabled&&audioPreferences.volume>0,reducedMotion.matches);
      if (preview && now > nextPreviewTick) { nextPreviewTick = now + 1000; if (preview.advance(Date.now())) receive(preview.snapshot(Date.now())); }
      if (now > nextPaint && !panel.hidden) { nextPaint = now + 1000; paint(); }
      dj.update(camera, visible, state?.current?.id, state?.current?.dj ?? false);
    },
    dispose() {
      interactionGlow.dispose(); records.dispose();searchRequest?.abort();clearTimeout(timeout); clearInterval(playbackTimer); unsubscribe(); stopConnection(); document.removeEventListener('keydown', onKey, true);
      videoHome.after(videoHost); transport.remove(); videoHome.remove(); dockDetails.remove(); if(soundHost) { delete soundHost.dataset.track; delete soundHost.dataset.playing; delete soundHost.dataset.musicTime; delete soundHost.dataset.musicSampleAt; } station.dispose(); player.dispose(); dj.dispose(); decks.dispose(); panel.remove(); trigger.remove(); group.removeFromParent();
      const materials = new Set<THREE.Material>(); group.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material); } });
      materials.forEach(material => material.dispose());
    },
  };
}
