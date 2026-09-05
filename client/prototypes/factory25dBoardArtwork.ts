import * as THREE from 'three';
import { BOARD_COLUMNS, boardColumn, rankBoardAgents, sessionAge } from './factory25dBoardData';
import type { BoardAgent, BoardData } from './factory25dBoardData';

const INK = '#142d62';
const SIZE = 512;
const FACE = 0.94;
const FONT = '"Board Marker", cursive';
export interface BoardNote {
  agent: BoardAgent;
  center: THREE.Vector3;
  width: number;
  height: number;
}

function surface(width = SIZE, height = SIZE) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return { ctx, texture };
}

function lettering(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color = INK,
  align: CanvasTextAlign = 'left',
) {
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}
function underline(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, color = INK) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + width * 0.53, y - 1.5, x + width, y - 3);
  ctx.stroke();
}
function fitText(ctx: CanvasRenderingContext2D, text: string, width: number) {
  if (ctx.measureText(text).width <= width) return text;
  let end = text.length;
  while (end > 0 && ctx.measureText(`${text.slice(0, end)}…`).width > width) end--;
  return `${text.slice(0, end).trimEnd()}…`;
}
function titleLines(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const words = text.replace(/[-_]/g, ' ').split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(next).width > width) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return [fitText(ctx, lines[0] ?? text, width), fitText(ctx, lines.slice(1).join(' '), width)].filter(
    Boolean,
  );
}

/** Live handwriting and real paper surfaces share the original board's lighting. */
export function createBoardArtwork(panel: THREE.Group, centerY: number) {
  const front = surface();
  const rear = surface();
  for (const [ink, reverse] of [
    [front, false],
    [rear, true],
  ] as const) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(FACE, FACE),
      new THREE.MeshStandardMaterial({
        map: ink.texture,
        transparent: true,
        depthWrite: false,
        roughness: 1,
        emissive: '#080d19',
        emissiveIntensity: 0.2,
      }),
    );
    mesh.position.set(0, centerY, reverse ? -0.097 : 0.097);
    if (reverse) mesh.rotation.y = Math.PI;
    mesh.receiveShadow = true;
    panel.add(mesh);
  }
  const paperGroup = new THREE.Group();
  panel.add(paperGroup);
  let noteTargets: BoardNote[] = [];
  function clearPaper() {
    for (const child of [...paperGroup.children]) {
      const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      mesh.geometry.dispose();
      mesh.material.map?.dispose();
      mesh.material.dispose();
      paperGroup.remove(mesh);
    }
    noteTargets = [];
  }
  function paperNote(agent: BoardAgent, column: number, row: number, now: number) {
    const paper = surface(288, 192);
    const ctx = paper.ctx;
    ctx.fillStyle = BOARD_COLUMNS[column].paper;
    ctx.fillRect(0, 0, 288, 192);
    // The top adhesive strip is matte; the free bottom edge lifts off the board.
    ctx.fillStyle = '#ffffff15';
    ctx.fillRect(0, 0, 288, 18);
    ctx.font = `700 38px ${FONT}`;
    const lines = titleLines(ctx, agent.task ?? agent.project ?? agent.tool ?? agent.name, 252);
    lines.forEach((line, index) => lettering(ctx, line, 17, 53 + index * 43, 38));
    const age = sessionAge(agent.startedAt, now);
    ctx.font = `700 30px ${FONT}`;
    const owner = fitText(ctx, agent.owner, 253 - (age ? ctx.measureText(age).width + 20 : 0));
    lettering(ctx, owner, 17, 160, 30);
    lettering(ctx, age, 271, 160, 30, INK, 'right');
    paper.texture.needsUpdate = true;
    const width = (146 / SIZE) * FACE;
    const height = (98 / SIZE) * FACE;
    const geometry = new THREE.PlaneGeometry(width, height, 1, 1);
    const vertices = geometry.getAttribute('position');
    // Four broad corners give the paper a quiet curl, without noisy facets.
    for (let i = 0; i < vertices.count; i++)
      vertices.setZ(i, vertices.getY(i) < 0 ? (i % 2 ? 0.015 : 0.006) : 0);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      map: paper.texture,
      emissiveMap: paper.texture,
      emissive: '#ffffff',
      emissiveIntensity: 0.1,
      roughness: 1,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    const px = 88 + column * 168;
    const py = 239 + row * 111;
    mesh.position.set((px / SIZE - 0.5) * FACE, centerY + (0.5 - py / SIZE) * FACE, 0.103);
    mesh.rotation.z = [-0.025, 0.022, -0.018][(column + row) % 3];
    // Ambient contact remains visible when the window's direct light is behind the board.
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        color: '#132342',
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      }),
    );
    contact.position.copy(mesh.position).add(new THREE.Vector3(0.003, -0.009, -0.003));
    contact.rotation.z = mesh.rotation.z;
    paperGroup.add(contact);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    paperGroup.add(mesh);
    noteTargets.push({ agent, center: mesh.position.clone(), width: width + 0.014, height: height + 0.014 });
  }

  return {
    draw(data: BoardData, page = 0, now = Date.now()) {
      clearPaper();
      const active = data.agents.filter((agent) => boardColumn(agent.activity));
      const resting = data.agents.filter((agent) => ['idle', 'waiting', 'stopped'].includes(agent.activity));
      const ungrouped = data.agents.length - active.length - resting.length;
      const columns = BOARD_COLUMNS.map((column) =>
        active.filter((agent) => boardColumn(agent.activity) === column.id),
      );
      const pageCount = Math.max(1, ...columns.map((agents) => Math.ceil(agents.length / 2)));
      page = Math.min(page, pageCount - 1);
      const ctx = front.ctx;
      ctx.clearRect(0, 0, SIZE, SIZE);
      lettering(ctx, 'ROOM PULSE', 256, 55, 53, INK, 'center');
      underline(ctx, 126, 65, 263);
      lettering(
        ctx,
        `${active.length} active session${active.length === 1 ? '' : 's'}`,
        256,
        101,
        31,
        INK,
        'center',
      );
      columns.forEach((agents, column) => {
        const style = BOARD_COLUMNS[column];
        const x = 88 + column * 168;
        lettering(ctx, String(agents.length), x - 69, 140, 37, style.color);
        lettering(ctx, style.label, x - 40, 138, 23, style.color);
        lettering(ctx, style.label, x, 178, 26, style.color, 'center');
        underline(ctx, x - 65, 185, 131, style.color);
        agents.slice(page * 2, page * 2 + 2).forEach((agent, row) => paperNote(agent, column, row, now));
        if (!agents.length) lettering(ctx, '—', x, 243, 28, '#66788e', 'center');
      });
      for (const x of [172, 340]) {
        ctx.strokeStyle = '#4b659082';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 159);
        ctx.lineTo(x + 2, 411);
        ctx.stroke();
      }
      const mergeText = data.merges === null ? 'merges not reported' : `${data.merges} PRs merged`;
      lettering(ctx, mergeText, 16, 456, data.merges === null ? 27 : 32, '#2e714e');
      underline(ctx, 16, 462, data.merges === null ? 265 : 250, '#2e714e');
      const state = !data.connected
        ? 'offline · last seen'
        : `${resting.length} resting${ungrouped ? ` · ${ungrouped} other` : ''}`;
      lettering(ctx, state, 17, 495, 21, '#486079');
      front.texture.needsUpdate = true;

      const back = rear.ctx;
      back.clearRect(0, 0, SIZE, SIZE);
      lettering(back, 'LEADERBOARD', 256, 55, 42, INK, 'center');
      underline(back, 105, 66, 302);
      lettering(back, 'session activity · tool calls', 256, 103, 26, '#486079', 'center');
      const ranked = rankBoardAgents(data.agents);
      if (!ranked.length)
        lettering(
          back,
          data.connected ? 'quiet in here today' : 'waiting for the factory',
          256,
          211,
          28,
          INK,
          'center',
        );
      ranked.slice(0, 6).forEach((agent, index) => {
        const y = 149 + index * 43;
        lettering(back, String(index + 1), 24, y, 29, '#67469e');
        back.font = `700 27px ${FONT}`;
        lettering(back, fitText(back, agent.task ?? agent.project ?? agent.name, 340), 63, y, 27);
        lettering(back, agent.tools === null ? '—' : String(agent.tools), 480, y, 29, '#67469e', 'right');
        underline(back, 62, y + 8, 416, '#4b659035');
      });
      lettering(back, mergeText, 22, 454, 32, '#2e714e');
      underline(back, 22, 462, 324, '#2e714e');
      lettering(
        back,
        data.merges === null ? 'waiting for a reported total' : 'factory total · all time',
        24,
        496,
        21,
        '#486079',
      );
      rear.texture.needsUpdate = true;
      return { notes: noteTargets, page, pageCount };
    },
  };
}
