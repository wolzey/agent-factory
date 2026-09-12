import * as THREE from 'three';
import { createInteractionGlow } from './factory25dInteractionGlow';
import './factory25dNewspaper.css';

/** Public edition only. Private attendance and financial data must not enter the client bundle. */
export function createNewspaper(parent: THREE.Group, canvas: HTMLCanvasElement, camera: THREE.OrthographicCamera) {
  const abort = new AbortController(), events = { signal: abort.signal };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const paper = new THREE.Group(); paper.name = 'couch-newspaper';
  paper.position.set(.62, .278, 5.65); paper.rotation.set(-Math.PI / 2, 0, Math.PI / 2 + .12);
  paper.scale.setScalar(.6);
  parent.add(paper);
  const textureCanvas = document.createElement('canvas'); textureCanvas.width = 128; textureCanvas.height = 90;
  const ink = textureCanvas.getContext('2d')!;
  ink.scale(.25, .25);
  ink.fillStyle = '#e9e1c9'; ink.fillRect(0, 0, 512, 360);
  ink.fillStyle = '#26291f'; ink.textAlign = 'center'; ink.font = "48px 'Geist Pixel', monospace"; ink.fillText('The Fluid Press', 256, 72);
  ink.fillRect(24, 88, 464, 5); ink.font = '17px monospace'; ink.fillText('THE COUCH EDITION · NO. 001', 256, 116);
  ink.font = "32px 'Geist Pixel', monospace"; ink.fillText('Built around people.', 256, 183);
  ink.font = '20px monospace'; ink.fillText('Company news. Office life. Good things.', 256, 217);
  ink.fillStyle = '#818270';
  for (let col = 0; col < 3; col++) for (let line = 0; line < 8; line++) ink.fillRect(24 + col * 158, 244 + line * 10, line === 7 ? 87 : 140, 3);
  ink.fillStyle = '#b7af99'; ink.fillRect(253, 0, 2, 360);
  const texture = new THREE.CanvasTexture(textureCanvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
  const geometry = new THREE.BoxGeometry(.64, .45, .012);
  const edge = new THREE.MeshStandardMaterial({ color: '#cec6af', roughness: 1 });
  const print = new THREE.MeshStandardMaterial({ map: texture, roughness: 1 });
  const mesh = new THREE.Mesh(geometry, [edge, edge, edge, edge, print, edge]);
  mesh.castShadow = mesh.receiveShadow = true; paper.add(mesh);
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'newspaper-hotspot';
  trigger.setAttribute('aria-label', 'Pick up the Fluid newspaper'); trigger.title = 'Read The Fluid Press';
  canvas.parentElement!.append(trigger);
  const glow = createInteractionGlow(paper, trigger);
  const dialog = document.createElement('dialog'); dialog.className = 'newspaper-dialog';
  dialog.setAttribute('aria-label', 'The Fluid Press newspaper');
  dialog.innerHTML = `<section class="newspaper-sheet" aria-label="Newspaper pages">
    <header class="newspaper-masthead"><div class="newspaper-eyebrow"><span>THE COUCH EDITION</span><span>NO. 001 · SEPTEMBER 12, 2026</span></div><h1>The Fluid Press</h1><p>A little company news. A little office life.</p></header>
    <nav class="newspaper-tabs" aria-label="Newspaper sections"><button type="button" aria-pressed="true" data-page="front">Front page</button><button type="button" aria-pressed="false" data-page="office">Around the office</button><button type="button" class="newspaper-close" aria-label="Put the newspaper back on the couch">Put it back ↘</button></nav>
    <div class="newspaper-scroll" tabindex="0">
      <div data-edition="front">
        <div class="newspaper-lead"><div><p class="newspaper-kicker">COMPANY · MARCH 17, 2026</p><h2>More fuel for<br>people-powered commerce.</h2><p class="newspaper-deck">Fluid’s $15 million funding round backs its AI capabilities and We-Commerce platform.</p></div><div class="newspaper-number"><strong>$15M</strong><span>FUNDING ROUND</span><small>Capital raised, not revenue.</small></div></div>
        <div class="newspaper-columns"><article><h3>Investing in the people behind every sale</h3><p>Fluid announced a funding round led by Vess Pearson, with participation from Alex Bean and existing investors. The investment supports AI tools that help sellers create content, find useful information, and stay connected with customers.</p><a href="https://www.directsellingnews.com/2026/03/17/fluid-raises-15-million-to-expand-ai-capabilities-and-we-commerce-platform/" target="_blank" rel="noopener noreferrer">Read the report · Direct Selling News ↗</a></article>
        <article><p class="newspaper-kicker">FROM THE ARCHIVE · JULY 19, 2024</p><h3>NOW Tech joins Fluid</h3><p>Fluid’s acquisition of the direct-selling mobile app company brought the NOW Tech team and its mobile experience into the Fluid family.</p><a href="https://www.directsellingnews.com/2024/07/19/ai-leader-fluid-acquires-direct-selling-mobile-app-company-nowtech/" target="_blank" rel="noopener noreferrer">Read the announcement ↗</a></article>
        <aside class="newspaper-brief"><p class="newspaper-kicker">AFTER HOURS</p><h3>Fresh ink.<br>Fresh rotation.</h3><p>The lounge DJ has a bigger rotation of jazzy hip-hop, soul, familiar favorites, and a quieter late-night mix.</p><p class="newspaper-signoff">Pull up a seat. Queue something good.</p></aside></div>
      </div>
      <div data-edition="office" hidden><p class="newspaper-kicker">PEOPLE & PLACES</p><h2>This week,<br>around the office.</h2><div class="newspaper-office-grid">
        <article class="newspaper-office-lead"><span class="newspaper-stamp">BLITZ WEEK</span><h3>Who’s coming through?</h3><p>The Studios schedule is the starting point for upcoming Blitz Weeks. Check the original announcement for the latest context before making plans.</p><a href="https://fluidtech.slack.com/archives/C0ATJTPAZ5G/p1787003708647279" target="_blank" rel="noopener noreferrer">Open the Studios schedule in Slack ↗</a><p class="newspaper-note">A confirmed visitor lineup isn’t available for this edition. The linked schedule was posted August 17.</p></article>
        <article><p class="newspaper-kicker">THE NUMBERS DESK</p><h3>Revenue, with context.</h3><p>No verified revenue update in this edition. Future reports should include the reporting period and distinguish company revenue from transaction volume.</p></article>
        <article><p class="newspaper-kicker">NEW FACES</p><h3>Save a seat.</h3><p>Introductions will appear here once there’s a confirmed team announcement. No new-hire names have been added to this edition.</p></article>
      </div></div>
      <footer class="newspaper-footer"><span>THE FLUID PRESS</span><span>Sources linked · Edition checked September 12, 2026</span><span class="newspaper-page-number">01</span></footer>
    </div></section>`;
  document.body.append(dialog);
  const sheet = dialog.querySelector<HTMLElement>('.newspaper-sheet')!;
  const scroll = dialog.querySelector<HTMLElement>('.newspaper-scroll')!;
  const closeButton = dialog.querySelector<HTMLButtonElement>('.newspaper-close')!;
  let active = false, available = false, closing = false, animation: Animation | undefined;
  let homeTransform = '', sheetWidth = 0, sheetHeight = 0;
  const point = new THREE.Vector3();
  function project(x: number, y: number) {
    const bounds = canvas.getBoundingClientRect();
    paper.updateWorldMatrix(true, false);
    point.set(x, y, .008); paper.localToWorld(point); point.project(camera);
    return { x: bounds.left + (point.x + 1) * bounds.width / 2, y: bounds.top + (1 - point.y) * bounds.height / 2 };
  }
  function fit() {
    sheetWidth = Math.min(960, window.innerWidth - 24);
    sheetHeight = Math.min(700, window.innerHeight - 100);
    sheet.style.width = `${sheetWidth}px`; sheet.style.height = `${sheetHeight}px`;
    const tl = project(-.32, .225), tr = project(.32, .225), bl = project(-.32, -.225);
    homeTransform = `matrix(${(tr.x-tl.x)/sheetWidth},${(tr.y-tl.y)/sheetWidth},${(bl.x-tl.x)/sheetHeight},${(bl.y-tl.y)/sheetHeight},${tl.x},${tl.y})`;
    return `translate(${(window.innerWidth-sheetWidth)/2}px,${Math.max(12,(window.innerHeight-sheetHeight)/2-16)}px)`;
  }
  function finishClose() {
    animation?.cancel(); animation = undefined; active = closing = false;
    dialog.close(); paper.visible = true; document.body.classList.remove('newspaper-open');
    delete dialog.dataset.exiting;
    trigger.hidden = !available; trigger.focus({ preventScroll: true });
  }
  function close(instant = false) {
    if (!active || closing) return;
    closing = true; dialog.dataset.exiting = 'true';
    const from = getComputedStyle(sheet).transform; animation?.cancel(); fit();
    sheet.style.transform = homeTransform;
    if (instant || reduced.matches) { finishClose(); return; }
    animation = sheet.animate([{ transform: from }, { transform: homeTransform }], { duration: 230, easing: 'cubic-bezier(.4,0,.2,1)' });
    animation.onfinish = finishClose;
  }
  function open(event: MouseEvent) {
    if (!available || active || document.querySelector('dialog[open]')) return;
    active = true; paper.visible = false; trigger.hidden = true;
    document.body.classList.add('newspaper-open');
    const destination = fit(); sheet.style.transform = destination;
    dialog.showModal(); closeButton.focus({ preventScroll: true });
    if (!reduced.matches && event.detail !== 0) {
      animation = sheet.animate([{ transform: homeTransform }, { transform: destination }], { duration: 340, easing: 'cubic-bezier(.22,1,.36,1)' });
      animation.onfinish = () => { animation?.cancel(); animation = undefined; };
    }
  }
  trigger.addEventListener('click', open, events);
  closeButton.addEventListener('click', event => close(event.detail === 0), events);
  // Keep room shortcuts from opening another view behind the paper.
  dialog.addEventListener('keydown', event => event.stopPropagation(), events);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(true); }, events);
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); }, events);
  dialog.querySelectorAll<HTMLButtonElement>('[data-page]').forEach(button => button.addEventListener('click', () => {
    dialog.querySelectorAll<HTMLButtonElement>('[data-page]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === button)));
    dialog.querySelectorAll<HTMLElement>('[data-edition]').forEach(page => { page.hidden = page.dataset.edition !== button.dataset.page; });
    dialog.querySelector('.newspaper-page-number')!.textContent = button.dataset.page === 'front' ? '01' : '02'; scroll.scrollTop = 0;
  }, events));
  window.addEventListener('resize', () => { if (active) { if (closing) finishClose(); else { animation?.cancel(); animation = undefined; sheet.style.transform = fit(); } } }, events);
  return {
    isActive: () => active,
    update(visible: boolean) {
      available = visible && !document.body.matches('.inspect-open,.avatar-editor-open,.basketball-mode,.duck-hunt-open');
      trigger.hidden = active || !available;
      if (!active && available) {
        const points = [project(-.32,.225),project(.32,.225),project(-.32,-.225),project(.32,-.225)];
        const rect = canvas.parentElement!.getBoundingClientRect();
        const left = Math.min(...points.map(p=>p.x)), top = Math.min(...points.map(p=>p.y));
        const width = Math.max(44,Math.max(...points.map(p=>p.x))-left), height = Math.max(44,Math.max(...points.map(p=>p.y))-top);
        trigger.style.cssText = `left:${left-rect.left}px;top:${top-rect.top}px;width:${width}px;height:${height}px`;
      }
    },
    dispose() { animation?.cancel(); abort.abort(); glow.dispose(); dialog.remove(); trigger.remove(); paper.removeFromParent(); geometry.dispose(); edge.dispose(); print.dispose(); texture.dispose(); document.body.classList.remove('newspaper-open'); },
  };
}
