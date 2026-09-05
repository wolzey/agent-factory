import * as THREE from 'three';
import { requireElement } from './dom';
import { gameResult, nextMark, playSquare } from './factory25dTicTacToe';
import type { Game } from './factory25dTicTacToe';
import { watchBoardData, rankBoardAgents, sessionAge } from './factory25dBoardData';
import { createBoardArtwork } from './factory25dBoardArtwork';
import type { BoardNote } from './factory25dBoardArtwork';
import type { BoardData } from './factory25dBoardData';
import { installBoardDragging } from './factory25dBoardDrag';
import { cameraEase } from './factory25dCameraMotion';

type View = 'room' | 'board' | 'game';
interface BoardOptions {
  board: THREE.Group;
  panel: THREE.Group;
  centerY: number;
  camera: THREE.OrthographicCamera;
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
}

/** Keep the artwork, hover feedback and close-ups on the actual lit 3D board.
 * Projected native buttons provide the same hit targets for mouse, touch and keys. */
export function createWhiteboardInteraction({
  board,
  panel,
  centerY,
  camera,
  canvas,
  renderer,
}: BoardOptions) {
  const openBoard = requireElement<HTMLButtonElement>('#board-open');
  const openGame = requireElement<HTMLButtonElement>('#board-game');
  const navigation = requireElement<HTMLDivElement>('#board-navigation');
  const back = requireElement<HTMLButtonElement>('#board-back');
  const close = requireElement<HTMLButtonElement>('#board-close');
  const flip = requireElement<HTMLButtonElement>('#board-flip');
  let reverse = false;
  let flipMotion: { start: number; from: number; to: number } | null = null;
  const reset = requireElement<HTMLButtonElement>('#board-reset');
  const title = requireElement<HTMLSpanElement>('#board-view-title');
  const status = requireElement<HTMLSpanElement>('#board-status');
  const statsDescription = requireElement<HTMLParagraphElement>('#board-stats');
  const cellLayer = requireElement<HTMLDivElement>('#board-cells');
  const noteLayer = requireElement<HTMLDivElement>('#board-notes');
  const noteDetails = requireElement<HTMLElement>('#board-note-details');
  const noteTitle = requireElement<HTMLElement>('#board-note-title');
  const noteDescription = requireElement<HTMLElement>('#board-note-description');
  const noteClose = requireElement<HTMLButtonElement>('#board-note-close');
  const more = requireElement<HTMLButtonElement>('#board-page');
  let selectedNote: BoardNote | null = null;
  let noteButtons: { button: HTMLButtonElement; note: BoardNote }[] = [];
  let page = 0;
  let pageCount = 1;
  const roomFrustum = { left: camera.left, right: camera.right };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const roomPose = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    zoom: camera.zoom,
  };
  let view: View = 'room';
  let game: Game = Array(9).fill(null);
  let hoveredCell = -1;
  let boardHovered = false;
  let gameHovered = false;
  let layoutDirty = true;
  let transition: {
    start: number;
    duration: number;
    from: typeof roomPose;
    to: typeof roomPose;
  } | null = null;

  function inkTexture(size: number) {
    const surface = document.createElement('canvas');
    surface.width = surface.height = size;
    const context = surface.getContext('2d');
    if (!context) throw new Error('Whiteboard ink could not be created');
    const texture = new THREE.CanvasTexture(surface);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    return { context, texture };
  }

  function inkPlane(texture: THREE.Texture, size: number, x: number, y: number) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        roughness: 1,
        metalness: 0,
        emissive: '#080d19',
        emissiveIntensity: 0.2,
      }),
    );
    mesh.position.set(x, y, 0.097);
    mesh.receiveShadow = true;
    panel.add(mesh);
    return mesh;
  }

  const artwork = createBoardArtwork(panel, centerY);
  let boardData: BoardData = { agents: [], merges: null, connected: false };
  function dismissNote(restoreFocus = false) {
    noteDetails.hidden = true;
    if (restoreFocus)
      (noteButtons.find((entry) => entry.note.agent.id === selectedNote?.agent.id)?.button ?? back).focus({
        preventScroll: true,
      });
    selectedNote = null;
  }
  function showNote(note: BoardNote, focus = true) {
    selectedNote = note;
    const agent = note.agent;
    noteTitle.textContent = agent.task ?? agent.project ?? agent.name;
    noteDescription.textContent = [
      agent.owner,
      agent.activity,
      agent.tool ? `tool: ${agent.tool}` : '',
      agent.project && agent.project !== noteTitle.textContent ? agent.project : '',
      sessionAge(agent.startedAt, Date.now())
        ? `session age: ${sessionAge(agent.startedAt, Date.now())}`
        : '',
    ]
      .filter(Boolean)
      .join(' · ');
    noteDetails.hidden = false;
    if (focus) noteClose.focus({ preventScroll: true });
  }
  function writeBoard() {
    const result = artwork.draw(boardData, page);
    page = result.page;
    pageCount = result.pageCount;
    const focusedId = noteButtons.find((entry) => entry.button === document.activeElement)?.note.agent.id;
    noteLayer.replaceChildren();
    noteButtons = result.notes.map((note) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'board-hotspot board-note';
      button.setAttribute(
        'aria-label',
        `${note.agent.task ?? note.agent.project ?? note.agent.name}: ${note.agent.owner}, ${note.agent.activity}. Open session details`,
      );
      button.addEventListener('click', () => showNote(note));
      noteLayer.append(button);
      return { button, note };
    });
    if (focusedId)
      (noteButtons.find((entry) => entry.note.agent.id === focusedId)?.button ?? back).focus({
        preventScroll: true,
      });
    if (selectedNote) {
      const fresh = result.notes.find((note) => note.agent.id === selectedNote?.agent.id);
      if (fresh) showNote(fresh, false);
      else dismissNote(true);
    }
    more.hidden = view !== 'board' || reverse || pageCount <= 1;
    more.textContent = `notes ${page + 1}/${pageCount} →`;
    const summary =
      `${boardData.connected ? 'Live factory' : 'Factory offline, last seen data'}. ${boardData.agents.length} current sessions. Merged PRs: ${boardData.merges ?? 'not available'}. ` +
      rankBoardAgents(boardData.agents)
        .map(
          (agent) =>
            `${agent.task ?? agent.project ?? agent.name}, ${agent.owner}: ${agent.activity}, ${agent.tools ?? 'unknown'} tool calls`,
        )
        .join('. ');
    openBoard.setAttribute('aria-label', 'Open whiteboard. Agent activity and merged PRs.');
    statsDescription.textContent = summary;
    layoutDirty = true;
  }
  writeBoard();
  void document.fonts
    .load('700 32px "Board Marker"')
    .then(() => writeBoard())
    .catch(() => {});
  const receiveData = (data: BoardData) => {
    boardData = data;
    writeBoard();
  };
  let stopData = watchBoardData(receiveData);
  window.addEventListener('pagehide', () => stopData());
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) stopData = watchBoardData(receiveData);
  });
  noteClose.addEventListener('click', () => dismissNote(true));
  more.addEventListener('click', () => {
    page = (page + 1) % pageCount;
    dismissNote();
    writeBoard();
  });

  const gameSize = 0.16;
  const gameCenter = new THREE.Vector3(0.345, centerY - 0.34, 0.101);
  const gameInk = inkTexture(96);
  const gameMesh = inkPlane(gameInk.texture, gameSize, gameCenter.x, gameCenter.y);
  gameMesh.position.z = gameCenter.z;
  const highlightMaterial = new THREE.MeshBasicMaterial({
    color: '#5eacd0',
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  const highlight = new THREE.Mesh(
    new THREE.PlaneGeometry(gameSize + 0.02, gameSize + 0.02),
    highlightMaterial,
  );
  highlight.position.copy(gameCenter).setZ(0.094);
  highlight.visible = false;
  panel.add(highlight);
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.1, 1.1)),
    new THREE.LineBasicMaterial({ color: '#8bb5ce', transparent: true, opacity: 0.8 }),
  );
  outline.position.set(0, centerY, 0.105);
  outline.visible = false;
  board.add(outline);

  function refreshHighlight() {
    outline.visible = view === 'room' && boardHovered;
    highlight.visible = gameHovered && view !== 'game' && !reverse && !flipMotion;
  }

  const cells: HTMLButtonElement[] = [];
  function drawGame() {
    const ctx = gameInk.context;
    ctx.clearRect(0, 0, 96, 96);
    if (hoveredCell >= 0 && !game[hoveredCell] && !gameResult(game)) {
      ctx.fillStyle = 'rgba(49, 131, 169, 0.18)';
      ctx.fillRect((hoveredCell % 3) * 32 + 2, Math.floor(hoveredCell / 3) * 32 + 2, 28, 28);
    }
    ctx.fillStyle = '#3a566b';
    for (const offset of [30, 62]) {
      ctx.fillRect(offset, 3, 4, 90);
      ctx.fillRect(3, offset, 90, 4);
    }
    game.forEach((mark, index) => {
      if (!mark) return;
      const x = (index % 3) * 32;
      const y = Math.floor(index / 3) * 32;
      ctx.strokeStyle = mark === 'X' ? '#36517c' : '#784963';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (mark === 'X') {
        ctx.moveTo(x + 8, y + 8);
        ctx.lineTo(x + 24, y + 24);
        ctx.moveTo(x + 24, y + 8);
        ctx.lineTo(x + 8, y + 24);
      } else ctx.arc(x + 16, y + 16, 10, 0, Math.PI * 2);
      ctx.stroke();
    });
    gameInk.texture.needsUpdate = true;
    const result = gameResult(game);
    const message =
      result === 'draw'
        ? 'draw — another round?'
        : result
          ? `${result} wins`
          : `${nextMark(game)} to move · two players`;
    status.textContent =
      view === 'game'
        ? message
        : reverse
          ? 'ranked by tool calls · factory merge total below'
          : 'live sessions · tap a note for details';
    cells.forEach((button, index) => {
      button.setAttribute(
        'aria-label',
        `Row ${Math.floor(index / 3) + 1}, column ${(index % 3) + 1}: ${game[index] ?? 'empty'}`,
      );
      button.setAttribute('aria-disabled', String(Boolean(game[index] || result)));
    });
  }

  for (let index = 0; index < 9; index += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'board-hotspot board-cell';
    button.addEventListener('pointerenter', () => {
      hoveredCell = index;
      drawGame();
    });
    button.addEventListener('pointerleave', () => {
      hoveredCell = -1;
      drawGame();
    });
    button.addEventListener('focus', () => {
      hoveredCell = index;
      drawGame();
    });
    button.addEventListener('blur', () => {
      hoveredCell = -1;
      drawGame();
    });
    button.addEventListener('click', () => {
      game = playSquare(game, index);
      drawGame();
    });
    button.addEventListener('keydown', (event) => {
      const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
      if (!(event.key in offsets)) return;
      event.preventDefault();
      cells[(index + offsets[event.key] + 9) % 9].focus();
    });
    cellLayer.append(button);
    cells.push(button);
  }
  drawGame();

  function closePose(next: Exclude<View, 'room'>) {
    board.updateWorldMatrix(true, false);
    const target = board.localToWorld(
      next === 'game' ? gameCenter.clone() : new THREE.Vector3(0, 0.68, 0.05),
    );
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(board.matrixWorld);
    // Move in front of the board, past foreground desks; orthographic zoom
    // alone would keep those desks between the eye and the writing surface.
    // Stay inside the board's clear footprint after it has been rolled around;
    // a more distant camera can end up inside a neighboring workstation.
    const position = target.clone().addScaledVector(normal, 0.48);
    position.y += next === 'game' ? 0.027 : 0.069;
    const poseCamera = camera.clone();
    poseCamera.position.copy(position);
    poseCamera.lookAt(target);
    const height = Math.max(1, canvas.clientHeight);
    const footer = height - navigation.getBoundingClientRect().top + 12;
    const usableFraction = Math.max(0.2, (height - footer - 12) / height);
    const worldHeight = camera.top - camera.bottom;
    const zoom = Math.min(
      next === 'game' ? 30 : 8.5,
      (worldHeight * usableFraction) / (next === 'game' ? 0.26 : 1.62),
      ((camera.right - camera.left) * 0.92) / (next === 'game' ? 0.23 : 1.22),
    );
    // Keep the board above the bottom island, including wrapped phone controls.
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(poseCamera.quaternion);
    position.addScaledVector(up, -((footer / height) * worldHeight) / zoom / 2);
    return { position, quaternion: poseCamera.quaternion.clone(), zoom };
  }

  function updateCamera(now: number) {
    if (!transition) return;
    const t = reducedMotion.matches ? 1 : Math.min(1, (now - transition.start) / transition.duration);
    // A gentle start and settle; multiplicative zoom keeps the apparent speed even.
    const eased = cameraEase(t);
    camera.position.lerpVectors(transition.from.position, transition.to.position, eased);
    camera.quaternion.slerpQuaternions(transition.from.quaternion, transition.to.quaternion, eased);
    camera.zoom = Math.exp(THREE.MathUtils.lerp(Math.log(transition.from.zoom), Math.log(transition.to.zoom), eased));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    layoutDirty = true;
    if (t === 1) transition = null;
  }

  function fitCanvas() {
    if (view === 'room') {
      camera.left = roomFrustum.left;
      camera.right = roomFrustum.right;
      renderer.setSize(800, 564, false);
    } else {
      const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      const width = (camera.top - camera.bottom) * aspect;
      camera.left = -width / 2;
      camera.right = width / 2;
      const pixels = Math.min(1024, Math.max(360, canvas.clientWidth));
      renderer.setSize(pixels, Math.round(pixels / aspect), false);
    }
    camera.updateProjectionMatrix();
  }

  function changeView(next: View) {
    const now = performance.now();
    updateCamera(now);
    const previousHeight = Math.max(1, canvas.clientHeight);
    view = next;
    navigation.dataset.instant = String(reducedMotion.matches);
    dismissNote();
    document.body.classList.toggle('board-open', next !== 'room');
    fitCanvas();
    // Entering fullscreen changes the canvas height. Preserve the starting
    // pixel scale so that layout change does not cause a jump before the move.
    camera.zoom *= previousHeight / Math.max(1, canvas.clientHeight);
    noteLayer.hidden = next !== 'board' || reverse;
    more.hidden = next !== 'board' || reverse || pageCount <= 1;
    openBoard.hidden = next !== 'room';
    openGame.hidden = next === 'game' || reverse || Boolean(flipMotion);
    flip.hidden = next !== 'board';
    cellLayer.hidden = next !== 'game';
    navigation.hidden = next === 'room';
    reset.hidden = next !== 'game';
    statsDescription.hidden = next === 'game';
    back.textContent = next === 'game' ? '← whiteboard' : '← room';
    title.textContent = next === 'game' ? 'TIC TAC TOE' : reverse ? 'LEADERBOARD' : 'ROOM PULSE';
    transition = {
      start: now,
      duration: next === 'game' ? 560 : 720,
      from: { position: camera.position.clone(), quaternion: camera.quaternion.clone(), zoom: camera.zoom },
      to: next === 'room' ? roomPose : closePose(next),
    };
    boardHovered = gameHovered = false;
    hoveredCell = -1;
    canvas.style.cursor = 'default';
    refreshHighlight();
    drawGame();
    updateCamera(now);
    (next === 'room' ? openBoard : next === 'game' ? cells[0] : back).focus({ preventScroll: true });
  }

  requireElement<HTMLButtonElement>('#mobile-board').addEventListener('click', () =>
    changeView('board'),
  );
  openBoard.addEventListener('click', () => changeView('board'));
  openGame.addEventListener('click', () => changeView('game'));
  for (const [button, kind] of [
    [openBoard, 'board'],
    [openGame, 'game'],
  ] as const) {
    for (const name of ['pointerenter', 'focus'] as const)
      button.addEventListener(name, () => {
        if (kind === 'board') boardHovered = true;
        else gameHovered = true;
        refreshHighlight();
      });
    for (const name of ['pointerleave', 'blur'] as const)
      button.addEventListener(name, () => {
        if (kind === 'board') boardHovered = false;
        else gameHovered = false;
        refreshHighlight();
      });
  }
  flip.addEventListener('click', (event) => {
    if (flipMotion) return;
    dismissNote();
    reverse = !reverse;
    noteLayer.hidden = true;
    more.hidden = true;
    flipMotion = { start: performance.now() - (event.detail === 0 ? 440 : 0), from: panel.rotation.y, to: reverse ? Math.PI : 0 };
    flip.setAttribute('aria-disabled', 'true');
    openGame.hidden = true;
    gameHovered = false;
    refreshHighlight();
    flip.textContent = reverse ? '↻ activity' : '↻ leaderboard';
    title.textContent = reverse ? 'LEADERBOARD' : 'ROOM PULSE';
    drawGame();
  });
  back.addEventListener('click', () =>
    changeView(view === 'game' ? 'board' : 'room'),
  );
  close.addEventListener('click', () => changeView('room'));
  reset.addEventListener('click', () => {
    game = Array(9).fill(null);
    drawGame();
    cells[0].focus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || view === 'room') return;
    if (!noteDetails.hidden) {
      event.preventDefault();
      dismissNote(true);
      return;
    }
    event.preventDefault();
    changeView(view === 'game' ? 'board' : 'room');
  });

  function placeButton(
    button: HTMLButtonElement,
    center: THREE.Vector3,
    width: number,
    height: number,
    depth = 0,
  ) {
    if (button.hidden) return;
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (const x of [-0.5, 0.5])
      for (const y of [-0.5, 0.5])
        for (const z of [-0.5, 0.5]) {
          const point = board.localToWorld(
            new THREE.Vector3(center.x + x * width, center.y + y * height, center.z + z * depth),
          );
          point.project(camera);
          const px = ((point.x + 1) / 2) * canvas.clientWidth;
          const py = ((1 - point.y) / 2) * canvas.clientHeight;
          left = Math.min(left, px);
          right = Math.max(right, px);
          top = Math.min(top, py);
          bottom = Math.max(bottom, py);
        }
    const hitWidth = button === openBoard ? Math.max(44, right - left) : right - left;
    const hitHeight = button === openBoard ? Math.max(44, bottom - top) : bottom - top;
    button.style.left = `${(left + right - hitWidth) / 2}px`;
    button.style.top = `${(top + bottom - hitHeight) / 2}px`;
    button.style.width = `${hitWidth}px`;
    button.style.height = `${hitHeight}px`;
  }
  const resize = new ResizeObserver(() => {
    layoutDirty = true;
    if (view === 'room') return;
    canvas.parentElement?.style.setProperty('--board-dock-height', `${navigation.offsetHeight}px`);
    fitCanvas();
    const pose = closePose(view);
    if (transition) {
      transition.to = pose;
      return;
    }
    camera.position.copy(pose.position);
    camera.quaternion.copy(pose.quaternion);
    camera.zoom = pose.zoom;
    camera.updateProjectionMatrix();
  });
  resize.observe(canvas);
  resize.observe(navigation);

  const boardDragging = installBoardDragging(board, openBoard, canvas, camera,
    () => view === 'room' && !transition && !document.body.matches('.weather-open, .secondary-room, .inspect-open, .team-open'),
    () => { layoutDirty = true; },
  );

  return {
    getData: () => boardData,
    isRoomView: () => view === 'room',
    update(now: number) {
      boardDragging.update(now);
      updateCamera(now);
      if (flipMotion) {
        const t = reducedMotion.matches ? 1 : Math.min(1, (now - flipMotion.start) / 440);
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        panel.rotation.y = THREE.MathUtils.lerp(flipMotion.from, flipMotion.to, eased);
        layoutDirty = true;
        if (t === 1) {
          flipMotion = null;
          flip.setAttribute('aria-disabled', 'false');
          openGame.hidden = reverse || view === 'game';
          noteLayer.hidden = reverse || view !== 'board';
          more.hidden = reverse || view !== 'board' || pageCount <= 1;
        }
      }
      if (!layoutDirty) return;
      board.updateWorldMatrix(true, false);
      camera.updateMatrixWorld();
      placeButton(openBoard, new THREE.Vector3(0, 0.68, 0), 1.12, 1.36, 0.55);
      placeButton(openGame, gameCenter, gameSize + 0.02, gameSize + 0.02);
      if (!noteLayer.hidden)
        noteButtons.forEach(({ button, note }) => placeButton(button, note.center, note.width, note.height));
      if (view === 'game')
        cells.forEach((button, index) => {
          const center = gameCenter
            .clone()
            .add(
              new THREE.Vector3(
                (((index % 3) - 1) * gameSize) / 3,
                ((1 - Math.floor(index / 3)) * gameSize) / 3,
                0,
              ),
            );
          placeButton(button, center, gameSize / 3, gameSize / 3);
        });
      layoutDirty = false;
    },
  };
}
