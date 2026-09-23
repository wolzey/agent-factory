import { releaseArtwork } from './factory25dReleaseArtwork';
import { factoryChangelog } from './factory25dChangelog';
import './factory25dWhatsNew.css';

const latestArtwork = releaseArtwork(factoryChangelog[0].id, 'featured');

export function createWhatsNew(visitPatio: () => void) {
  const abort = new AbortController(), events = { signal: abort.signal };
  const latest = factoryChangelog[0], storageKey = 'factory-whats-new-seen';
  const root = document.createElement('aside'); root.className = 'factory-updates'; root.setAttribute('aria-label', 'Factory updates');
  root.innerHTML = `<div class="factory-update-preview" id="factory-update-preview" inert><div class="factory-update-content">${latestArtwork}<span class="factory-update-eyebrow">JUST ADDED</span><h2></h2><p></p><div class="factory-update-actions"><button type="button" data-update="try"></button><button type="button" data-update="history">view changelog</button></div></div></div><button type="button" class="factory-update-trigger" aria-expanded="false" aria-controls="factory-update-preview"><svg class="factory-update-gift" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">
<path fill="#982b2b" d="M3 8h11v7H3z"/><path fill="#ec493f" d="M3 8h9v7H3z"/>
<path fill="#ff7561" d="M3 8h2v7H3z"/><path fill="#ffe29a" d="M7 8h2v7H7z"/>
<g class="factory-gift-glow" fill="#fff0b8"><path opacity=".3" d="M3 5h10v2H3zM4 7h8v2H4z"/><path d="M4 8h8v1H4z"/></g>
<g class="factory-gift-lid">
<path fill="#ffd779" d="M4 3h3v1h2V3h3v3H4z"/><path fill="#a9322e" d="M5 4h1v1H5zM10 4h1v1h-1z"/>
<path fill="#ab302d" d="M2 6h12v3H2z"/><path fill="#ff6955" d="M2 6h10v2H2z"/>
<path fill="#ffe29a" d="M7 5h2v4H7z"/>
</g>
<path class="factory-gift-spark" fill="#fff5d2" d="M14 3h1v1h1v1h-1v1h-1V5h-1V4h1z"/>
</svg><span>what’s new</span><span class="factory-update-chevron" aria-hidden="true">↑</span></button>`;
  const trigger = root.querySelector<HTMLButtonElement>('.factory-update-trigger')!;
  const preview = root.querySelector<HTMLElement>('.factory-update-preview')!;
  root.querySelector('h2')!.textContent = latest.title; root.querySelector('p')!.textContent = latest.summary;
  const tryIt = root.querySelector<HTMLButtonElement>('[data-update="try"]')!;
  if (latest.visit) tryIt.textContent = latest.visit; else tryIt.remove();
  try { root.dataset.unread = String(localStorage.getItem(storageKey) !== latest.id); } catch { root.dataset.unread = 'true'; }
  // Restart the occasional unread-gift cue after returning to the page,
  // rather than letting an animation advance unseen in a background tab.
  const updateAttention = () => { root.dataset.attention = String(!document.hidden); };
  document.addEventListener('visibilitychange', updateAttention, events); updateAttention();
  const dialog = document.createElement('dialog'); dialog.className = 'factory-changelog'; dialog.setAttribute('aria-labelledby', 'factory-changelog-title');
  dialog.innerHTML = '<header><div><span class="factory-update-eyebrow">FLUID FACTORY</span><h2 id="factory-changelog-title">What’s new</h2></div><button type="button" aria-label="Close changelog">×</button></header><div class="factory-changelog-entries" tabindex="0" aria-label="Release history"></div>';
  const entries = dialog.querySelector('.factory-changelog-entries')!;
  const archiveMotions = new Set<Animation>();
  for (const [index, release] of factoryChangelog.entries()) {
    const article = document.createElement('article');
    const date = document.createElement('time'); date.dateTime = release.date;
    date.textContent = new Date(`${release.date}T12:00:00Z`).toLocaleDateString('en-US', {month:'long',day:'numeric',year:'numeric',timeZone:'UTC'});
    const heading = document.createElement('h3'); heading.textContent = release.title;
    const description = document.createElement('p'); description.textContent = release.summary;
    const list = document.createElement('ul');
    for (const change of release.changes) {
      const li = document.createElement('li'), label = document.createElement('strong');
      label.textContent = change.label; li.append(label, ` ${change.text}`); list.append(li);
    }
    const row = document.createElement('section'); row.className = 'factory-release-row';
    row.append(date); entries.append(row);
    if (index === 0) {
      article.className = 'factory-changelog-featured';
      article.innerHTML = latestArtwork;
      article.append(heading, description, list);
      if (release.visit) {
        const action = document.createElement('button'); action.type = 'button'; action.className = 'factory-changelog-try'; action.textContent = release.visit;
        action.addEventListener('click', () => { dialog.close(); visitPatio(); }, events);
        article.append(action);
      }
      row.append(article);
      const archiveHeading = document.createElement('h3'); archiveHeading.className = 'factory-archive-heading'; archiveHeading.textContent = 'Earlier updates'; entries.append(archiveHeading);
    } else {
      const details = document.createElement('details'); details.className = 'factory-release-archive';
      const label = document.createElement('summary');
      label.innerHTML = releaseArtwork(release.id);
      const artwork = label.firstElementChild as HTMLElement;
      const copy = document.createElement('span'); copy.className = 'factory-release-summary';
      const teaser = document.createElement('span'); teaser.className = 'factory-release-teaser'; teaser.textContent = release.summary;
      copy.append(heading, teaser); label.prepend(copy);
      article.append(list); details.append(label, article); row.append(details);
      let imageMotion: Animation | undefined;
      label.addEventListener('click', event => {
        event.preventDefault();
        const from = artwork.getBoundingClientRect();
        imageMotion?.cancel();
        details.open = !details.open;
        if (event.detail === 0 || reducedMotion.matches) return;
        const to = artwork.getBoundingClientRect();
        imageMotion = artwork.animate([
          { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})` },
          { transform: 'none' },
        ], { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)' });
        archiveMotions.add(imageMotion);
        const motion = imageMotion;
        motion.onfinish = motion.oncancel = () => archiveMotions.delete(motion);
      }, events);
    }
  }
  document.body.append(root, dialog);
  let open = false;
  function position() {
    const toolbar = document.querySelector<HTMLElement>('.factory-toolbar');
    const dock = toolbar?.getBoundingClientRect();
    // Share the bottom row. On narrow screens reserve only the gift button;
    // its preview opens above that button without moving either dock upward.
    const compact = innerWidth < 720;
    root.dataset.compact = String(compact);
    const width = compact ? 60 : open ? 340 : 196;
    if (toolbar && dock) {
      const available = Math.max(0, innerWidth - width - 36);
      toolbar.style.setProperty('--factory-toolbar-max-width', `${available}px`);
      toolbar.style.maxWidth = `${available}px`;
      const toolbarWidth = toolbar.getBoundingClientRect().width;
      toolbar.style.left = `${Math.max(12 + toolbarWidth / 2, Math.min(innerWidth / 2, innerWidth - width - 24 - toolbarWidth / 2))}px`;
    }
    const bottom = dock
      ? `${innerHeight - (dock.top + dock.height / 2) - trigger.offsetHeight / 2}px`
      : 'max(12px, env(safe-area-inset-bottom))';
    root.style.bottom = bottom; root.style.setProperty('--updates-bottom', bottom);
  }
  function expand(next: boolean) {
    open = next; root.dataset.open = String(next); trigger.setAttribute('aria-expanded', String(next)); preview.inert = !next;
    if (next) { root.dataset.unread = 'false'; try { localStorage.setItem(storageKey, latest.id); } catch { /* Available without browser storage. */ } }
    position(); syncVideos();
  }
  root.addEventListener('keydown', event => event.stopPropagation(), events);
  trigger.addEventListener('click', event => { root.dataset.instant = String(event.detail === 0); expand(!open); }, events);
  root.querySelector('[data-update="try"]')?.addEventListener('click', () => { expand(false); visitPatio(); }, events);
  let modalMotion: Animation | undefined;
  let contentMotions: Animation[] = [];
  const clearContentMotion = () => { contentMotions.forEach(motion => motion.cancel()); contentMotions = []; };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const videos = [...root.querySelectorAll<HTMLVideoElement>('video'), ...dialog.querySelectorAll<HTMLVideoElement>('video')];
  const inView = new Set<HTMLVideoElement>();
  const userPaused = new Set<HTMLVideoElement>();
  // A poster is a full-size capture (276KB for the games clip) that preload="none" does not
  // defer. Fetch it on intent or on open, or 10s in, instead of competing with the first load.
  const loadPosters = () => { for (const video of videos) if (video.dataset.poster && !video.hasAttribute('poster')) video.poster = video.dataset.poster; };
  trigger.addEventListener('pointerenter', loadPosters, events);
  trigger.addEventListener('focus', loadPosters, events);
  const posterTimer = window.setTimeout(loadPosters, 10_000);
  function syncVideos() {
    if (open || dialog.open) loadPosters();
    for (const video of videos) {
      const visible = inView.has(video) && !document.hidden && (dialog.contains(video) ? dialog.open : open && !dialog.open);
      const button = video.parentElement!.querySelector<HTMLButtonElement>('button')!;
      button.hidden = reducedMotion.matches;
      if (reducedMotion.matches) {
        video.pause();
        if (video.hasAttribute('src')) { video.removeAttribute('src'); video.load(); }
      } else if (visible && !userPaused.has(video)) {
        if (!video.hasAttribute('src')) video.src = video.dataset.src!;
        video.muted = true; void video.play().catch(() => { userPaused.add(video); button.textContent = 'Play'; button.setAttribute('aria-label', 'Play basketball replay'); });
      } else video.pause();
    }
  }
  const videoObserver = new IntersectionObserver(records => {
    for (const record of records) { const video = record.target as HTMLVideoElement; if (record.isIntersecting) inView.add(video); else inView.delete(video); }
    syncVideos();
  }, { threshold: 0.1 });
  for (const video of videos) {
    videoObserver.observe(video);
    const button = video.parentElement!.querySelector<HTMLButtonElement>('button')!;
    button.addEventListener('click', () => {
      if (userPaused.has(video)) userPaused.delete(video); else userPaused.add(video);
      button.textContent = userPaused.has(video) ? 'Play' : 'Pause';
      button.setAttribute('aria-label', `${userPaused.has(video) ? 'Play' : 'Pause'} basketball replay`);
      syncVideos();
    }, events);
  }
  reducedMotion.addEventListener('change', syncVideos, events);
  document.addEventListener('visibilitychange', syncVideos, events);
  function morph(from: DOMRect, to: DOMRect, closing = false) {
    modalMotion?.cancel(); clearContentMotion();
    const frame = (rect: DOMRect) => ({ left:`${rect.left}px`, top:`${rect.top}px`, width:`${rect.width}px`, height:`${rect.height}px`, margin:'0', maxHeight:'none' });
    modalMotion = dialog.animate([{...frame(from), backgroundColor:'#000'}, {...frame(to), backgroundColor:'#000'}], { duration:280, easing:'cubic-bezier(.22,1,.36,1)', fill:'both' });
    for (const child of dialog.children) contentMotions.push(child.animate([{opacity:closing ? 1 : 0},{opacity:closing ? 0 : 1}], {duration:closing ? 100 : 180, delay:closing ? 0 : 100, fill:'both'}));
    modalMotion.onfinish = () => { if (closing) dialog.close(); modalMotion?.cancel(); modalMotion = undefined; clearContentMotion(); };
  }
  function closeHistory(instant = false) {
    if (instant || reducedMotion.matches) { modalMotion?.cancel(); modalMotion = undefined; clearContentMotion(); dialog.close(); return; }
    morph(dialog.getBoundingClientRect(), root.getBoundingClientRect(), true);
  }
  root.querySelector('[data-update="history"]')!.addEventListener('click', event => {
    const from = root.getBoundingClientRect();
    const instant = (event as MouseEvent).detail === 0 || reducedMotion.matches;
    dialog.dataset.instant = 'true'; expand(false); dialog.showModal(); syncVideos();
    dialog.querySelector('button')!.focus({preventScroll:true});
    if (!instant) morph(from, dialog.getBoundingClientRect());
  }, events);
  dialog.querySelector('button')!.addEventListener('click', event => closeHistory(event.detail === 0), events);
  dialog.addEventListener('close', () => { modalMotion?.cancel(); modalMotion = undefined; clearContentMotion(); syncVideos(); trigger.focus({preventScroll:true}); }, events);
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeHistory(); } }, events);
  document.addEventListener('pointerdown', event => { if (open && !root.contains(event.target as Node)) expand(false); }, events);
  document.addEventListener('keydown', event => {
    if (dialog.open) {
      event.stopImmediatePropagation();
      if (event.key === 'Escape') { event.preventDefault(); closeHistory(true); }
      if (event.key === 'Tab') {
        event.preventDefault();
        const targets = [...dialog.querySelectorAll<HTMLElement>('button, summary, [tabindex="0"]')].filter(target => target.getClientRects().length > 0);
        const index = targets.indexOf(document.activeElement as HTMLElement);
        targets[(index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length].focus();
      }
      return;
    }
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopImmediatePropagation(); root.dataset.instant = 'true'; expand(false); trigger.focus(); }
  }, { ...events, capture:true });
  const observer = new ResizeObserver(position); const toolbar = document.querySelector<HTMLElement>('.factory-toolbar'); if (toolbar) observer.observe(toolbar);
  window.addEventListener('resize', position, events); position();
  return { dispose() { abort.abort(); clearTimeout(posterTimer); videoObserver.disconnect(); videos.forEach(video => video.pause()); archiveMotions.forEach(motion => motion.cancel()); modalMotion?.cancel(); clearContentMotion(); observer.disconnect(); dialog.remove(); root.remove(); toolbar?.style.removeProperty('left'); toolbar?.style.removeProperty('max-width'); toolbar?.style.removeProperty('--factory-toolbar-max-width'); } };
}
