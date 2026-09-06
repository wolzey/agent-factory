import * as THREE from 'three';
import { VISITOR_BALL_RADIUS as RADIUS, VISITOR_BALL_RIM, visitorShotVelocity, stepVisitorBall, validBallVector, type FlyingBall } from '@shared/visitor-basketball';
import { miniBall } from './factory25dBasketball';
import { onFactoryMessage, onFactoryConnection, sendVisitorBall } from './factory25dBoardData';
import { contactShadow } from './factory25dContactShadows';
import './factory25dVisitorBasketball.css';

type Sounds = { swish(): void; bounce(energy: number): void };
export function createVisitorBasketball(parent: THREE.Group, canvas: HTMLCanvasElement,
  pickups: THREE.Group[], canPick: (index: number) => boolean, sounds: Sounds) {
  const abort = new AbortController(), events = { signal: abort.signal };
  const ball = miniBall(parent); ball.name = 'visitor-basketball'; ball.visible = false;
  const shadow = contactShadow(parent, { width: .12, depth: .12, spread: .055, opacity: .25, round: true }); shadow.visible = false;
  const hint = document.createElement('div'); hint.className = 'visitor-ball-hint pixel-island'; hint.hidden = true;
  hint.innerHTML = '<span>drag toward the hoop · release to shoot</span><button type="button">shoot ↗</button><button type="button" aria-label="Put basketball down">cancel</button>';
  document.body.append(hint);
  const status = document.createElement('span'); status.className = 'visitor-ball-status'; status.setAttribute('role', 'status'); document.body.append(status);
  const triggers = pickups.map((_, index) => {
    const button = document.createElement('button'); button.className = 'visitor-ball-pickup'; button.type = 'button';
    button.setAttribute('aria-label', `Pick up basketball ${index + 1}`); button.title = 'pick up and shoot · no sign-in needed';
    canvas.parentElement!.append(button); return button;
  });
  const aimMaterial = new THREE.LineDashedMaterial({ color: '#b6c9c2', transparent: true, opacity: .3, dashSize: .025, gapSize: .025 });
  const aimGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(63), 3));
  const aimLine = new THREE.Line(aimGeometry, aimMaterial); aimLine.visible = false; aimLine.frustumCulled = false; parent.add(aimLine);
  type Ghost = { mesh: THREE.Group; flying?: FlyingBall; seen: number; age: number };
  const ghosts = new Map<string, Ghost>();
  const ghostMaterials = (mesh: THREE.Object3D) => mesh.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    const material = child.material as THREE.MeshStandardMaterial;
    material.transparent = true; material.opacity = .28; material.depthWrite = false;
    material.emissive.set('#000000'); child.castShadow = false;
  });
  function disposeBall(mesh: THREE.Group) {
    mesh.removeFromParent(); mesh.traverse(child => { if (child instanceof THREE.Mesh) { child.geometry.dispose(); (child.material as THREE.Material).dispose(); } });
  }
  function removeGhost(id: string) { const ghost = ghosts.get(id); if (ghost) { disposeBall(ghost.mesh); ghosts.delete(id); } }
  const stopMessages = onFactoryMessage(message => {
    if (message.type !== 'visitor_ball_update' || typeof message.visitorId !== 'string') return;
    if (message.phase === 'cancel') { removeGhost(message.visitorId); return; }
    if (!validBallVector(message.position) || (message.phase === 'throw' && !validBallVector(message.velocity, true))) return;
    let ghost = ghosts.get(message.visitorId);
    if (!ghost) {
      if (ghosts.size >= 64) return;
      const mesh = miniBall(parent); mesh.name = 'ghost-basketball'; ghostMaterials(mesh);
      ghost = { mesh, seen: performance.now(), age: 0 }; ghosts.set(message.visitorId, ghost);
    }
    ghost.seen = performance.now(); ghost.age = 0;
    ghost.mesh.position.set(message.position.x, message.position.y, message.position.z);
    ghost.flying = message.phase === 'throw' ? { position: { ...message.position }, velocity: { ...message.velocity! }, scored: false } : undefined;
    // A late joiner catches up only to this short-lived shot, never replays old games.
    if (ghost.flying) {
      let delay = Math.min(8, Math.max(0, (Date.now() - message.serverTime) / 1000));
      ghost.age = delay; while (delay > 0) { stepVisitorBall(ghost.flying, Math.min(.1, delay)); delay -= .1; }
    }
  });
  let held = -1, pointerId: number | undefined, flying: FlyingBall | undefined, age = 0, lastSend = -Infinity;
  let camera: THREE.Camera, available = false;
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), point = new THREE.Vector3();
  const rim = new THREE.Vector3(VISITOR_BALL_RIM.x, VISITOR_BALL_RIM.y, VISITOR_BALL_RIM.z), target = rim.clone();
  const position = () => ({ x: ball.position.x, y: ball.position.y, z: ball.position.z });
  function holdMessage() { sendVisitorBall({ type: 'visitor_ball', phase: 'hold', position: position() }); lastSend = performance.now(); }
  function reset(notify = true) {
    if (notify && held >= 0) sendVisitorBall({ type: 'visitor_ball', phase: 'cancel' });
    if (held >= 0) pickups[held].visible = true;
    if (pointerId !== undefined && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    pointerId = undefined; held = -1; flying = undefined; ball.visible = shadow.visible = aimLine.visible = false; hint.hidden = true;
    canvas.classList.remove('holding-basketball'); canvas.dataset.visitorBall = 'resting';
  }
  function aim() {
    target.copy(rim); target.x = Math.abs(ball.position.x - rim.x) < .35 ? rim.x : ball.position.x;
    const velocity = visitorShotVelocity(position(), target), trial: FlyingBall = { position: position(), velocity, scored: false };
    const points = aimGeometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < points.count; i++) { points.setXYZ(i, trial.position.x, trial.position.y, trial.position.z); stepVisitorBall(trial, .035); }
    points.needsUpdate = true; aimLine.computeLineDistances();
  }
  function begin(index: number) {
    if (!available || held >= 0 || !canPick(index)) return false;
    held = index; ball.position.copy(pickups[index].position); ball.position.y = Math.max(.3, ball.position.y);
    pickups[index].visible = false; ball.visible = shadow.visible = aimLine.visible = true; hint.hidden = false;
    canvas.classList.add('holding-basketball'); canvas.dataset.visitorBall = 'held';
    status.textContent = 'ball picked up. drag toward the hoop and release, or choose shoot.'; holdMessage(); aim(); return true;
  }
  function drag(event: PointerEvent) {
    const bounds = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2), camera);
    parent.updateWorldMatrix(true, false);
    plane.constant = -parent.localToWorld(point.copy(ball.position)).z;
    if (!ray.ray.intersectPlane(plane, point)) return;
    parent.worldToLocal(point);
    ball.position.set(THREE.MathUtils.clamp(point.x, -7.7, 7.7), THREE.MathUtils.clamp(point.y, RADIUS, 3.5), ball.position.z);
    if (performance.now() - lastSend > 70) holdMessage(); aim();
  }
  function shoot() {
    if (held < 0 || flying) return;
    flying = { position: position(), velocity: visitorShotVelocity(position(), target), scored: false }; age = 0;
    // The last held position may have been between throttled move packets.
    sendVisitorBall({ type: 'visitor_ball', phase: 'throw', position: position(), velocity: { ...flying.velocity } });
    pointerId = undefined; hint.hidden = true; aimLine.visible = false; canvas.classList.remove('holding-basketball');
    canvas.dataset.visitorBall = 'flying'; status.textContent = 'shot away';
  }
  triggers.forEach((button, index) => {
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !begin(index)) return;
      event.preventDefault(); event.stopPropagation(); pointerId = event.pointerId;
      canvas.setPointerCapture(pointerId);
    }, events);
    button.addEventListener('click', event => { if (event.detail === 0 && begin(index)) (hint.querySelector('button') as HTMLButtonElement).focus(); }, events);
  });
  canvas.addEventListener('pointermove', event => { if (pointerId !== event.pointerId) return; event.preventDefault(); event.stopImmediatePropagation(); drag(event); }, { ...events, capture: true });
  canvas.addEventListener('pointerup', event => {
    if (pointerId !== event.pointerId) return; event.stopImmediatePropagation(); drag(event);
    pointerId = undefined;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); shoot();
  }, { ...events, capture: true });
  canvas.addEventListener('pointercancel', () => reset(), events);
  canvas.addEventListener('lostpointercapture', () => { if (pointerId !== undefined) reset(); }, events);
  hint.querySelector('button')!.addEventListener('click', () => { target.copy(rim); shoot(); }, events);
  hint.querySelector('[aria-label]')!.addEventListener('click', () => reset(), events);
  document.addEventListener('keydown', event => { if (held >= 0 && event.key === 'Escape') { event.preventDefault(); reset(); } }, { ...events, capture: true });
  window.addEventListener('blur', () => reset(), events);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); }, events);
  const stopConnection = onFactoryConnection(connected => { if (!connected) { reset(false); for (const id of ghosts.keys()) removeGhost(id); } });
  return {
    get busy() { return held >= 0; },
    update(dt: number, view: THREE.Camera, visible: boolean) {
      camera = view; available = visible && !document.body.matches('.avatar-editor-open, .inspect-open, .chat-open, .team-open');
      if (!available && held >= 0) reset();
      pickups.forEach((pickup, index) => {
        const button = triggers[index]; button.hidden = !available || held >= 0 || !canPick(index);
        if (button.hidden) return;
        parent.localToWorld(point.copy(pickup.position)).project(camera);
        Object.assign(button.style, { left: `${(point.x + 1) * canvas.clientWidth / 2 - 22}px`, top: `${(1 - point.y) * canvas.clientHeight / 2 - 22}px` });
      });
      if (held >= 0) {
        pickups[held].visible = false;
        if (flying) {
          const result = stepVisitorBall(flying, dt); age += dt;
          ball.position.set(flying.position.x, flying.position.y, flying.position.z); ball.rotation.x += dt * 5;
          if (result.swish) { sounds.swish(); status.textContent = 'swish!'; canvas.dataset.visitorBasket = String(Number(canvas.dataset.visitorBasket ?? 0) + 1); }
          if (result.bounce > .12) sounds.bounce(result.bounce);
          if (age > 4) reset();
        } else if (performance.now() - lastSend > 500) holdMessage();
        shadow.position.set(ball.position.x, .019, ball.position.z);
        shadow.visible = held >= 0;
      }
      for (const [id, ghost] of ghosts) {
        if (performance.now() - ghost.seen > 8000 || ghost.age > 4) { removeGhost(id); continue; }
        if (ghost.flying) {
          ghost.age += dt; const result = stepVisitorBall(ghost.flying, dt);
          ghost.mesh.position.set(ghost.flying.position.x, ghost.flying.position.y, ghost.flying.position.z); ghost.mesh.rotation.x += dt * 5;
          if (visible && result.swish) sounds.swish();
        }
      }
      canvas.dataset.ghostBalls = String(ghosts.size);
    },
    dispose() { reset(); abort.abort(); stopMessages(); stopConnection(); for (const id of ghosts.keys()) removeGhost(id); disposeBall(ball); shadow.removeFromParent(); aimLine.removeFromParent(); aimGeometry.dispose(); aimMaterial.dispose(); triggers.forEach(button => button.remove()); hint.remove(); status.remove(); },
  };
}
