import * as THREE from 'three';

// Seven-pixel lettering survives the room's low-resolution render without
// resampling a tiny system font inside a mostly empty large texture.
const glyphs: Record<string, string> = {
  A: '01110/10001/10001/11111/10001/10001/10001',
  B: '11110/10001/10001/11110/10001/10001/11110',
  C: '01111/10000/10000/10000/10000/10000/01111',
  D: '11110/10001/10001/10001/10001/10001/11110',
  E: '11111/10000/10000/11110/10000/10000/11111',
  F: '11111/10000/10000/11110/10000/10000/10000',
  G: '01111/10000/10000/10111/10001/10001/01111',
  H: '10001/10001/10001/11111/10001/10001/10001',
  I: '111/010/010/010/010/010/111',
  J: '00111/00010/00010/00010/10010/10010/01100',
  K: '10001/10010/10100/11000/10100/10010/10001',
  L: '10000/10000/10000/10000/10000/10000/11111',
  M: '10001/11011/10101/10101/10001/10001/10001',
  N: '10001/11001/10101/10011/10001/10001/10001',
  O: '01110/10001/10001/10001/10001/10001/01110',
  P: '11110/10001/10001/11110/10000/10000/10000',
  Q: '01110/10001/10001/10001/10101/10010/01101',
  R: '11110/10001/10001/11110/10100/10010/10001',
  S: '01111/10000/10000/01110/00001/00001/11110',
  T: '11111/00100/00100/00100/00100/00100/00100',
  U: '10001/10001/10001/10001/10001/10001/01110',
  V: '10001/10001/10001/10001/10001/01010/00100',
  W: '10001/10001/10001/10101/10101/11011/10001',
  X: '10001/10001/01010/00100/01010/10001/10001',
  Y: '10001/10001/01010/00100/00100/00100/00100',
  Z: '11111/00001/00010/00100/01000/10000/11111',
  '0': '01110/10001/10011/10101/11001/10001/01110',
  '1': '010/110/010/010/010/010/111',
  '2': '01110/10001/00001/00010/00100/01000/11111',
  '3': '11110/00001/00001/01110/00001/00001/11110',
  '4': '00010/00110/01010/10010/11111/00010/00010',
  '5': '11111/10000/10000/11110/00001/00001/11110',
  '6': '01110/10000/10000/11110/10001/10001/01110',
  '7': '11111/00001/00010/00100/01000/01000/01000',
  '8': '01110/10001/10001/01110/10001/10001/01110',
  '9': '01110/10001/10001/01111/00001/00001/01110',
  '/': '00001/00001/00010/00100/01000/10000/10000',
  ':': '0/1/1/0/1/1/0',
  ' ': '000/000/000/000/000/000/000',
};
export function signTexture(text: string, ink: string, background: string, padding = 2, aspect = 0) {
  const letters = [...text.toUpperCase()].map((letter) => (glyphs[letter] ?? glyphs[' ']).split('/'));
  const canvas = document.createElement('canvas');
  const textWidth = letters.reduce((sum, rows) => sum + rows[0].length + 1, 0) - 1;
  canvas.height = 7 + padding * 2;
  canvas.width = Math.max(textWidth + padding * 2, Math.round(canvas.height * aspect));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = ink;
  let x = Math.floor((canvas.width - textWidth) / 2);
  for (const rows of letters) {
    rows.forEach((row, y) =>
      [...row].forEach((pixel, offset) => {
        if (pixel === '1') ctx.fillRect(x + offset, padding + y, 1, 1);
      }),
    );
    x += rows[0].length + 1;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

export function createNameTag(name: string, working: boolean, parent: HTMLElement) {
  const element = document.createElement('div');
  element.className = 'agent-label';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'agent-name';
  button.textContent = name;
  const details = document.createElement('div');
  details.className = 'agent-details';
  details.id = `agent-details-${parent.querySelectorAll('.agent-label').length}`;
  details.setAttribute('role', 'tooltip');
  button.setAttribute('aria-describedby', details.id);
  const title = document.createElement('strong');
  title.textContent = name;
  const activity = document.createElement('span');
  activity.className = 'agent-activity';
  activity.textContent = working ? 'working at the station' : 'relaxing in the lounge';
  const source = document.createElement('small');
  source.textContent = 'task details are not available';
  details.append(title, activity, source);
  details.hidden = true;
  element.append(button, details);
  parent.append(element);
  const events = new AbortController();
  let dismissed = false;
  const show = () => {
    if (!dismissed) details.hidden = false;
  };
  const close = () => {
    details.hidden = true;
  };
  element.addEventListener('pointerenter', show);
  element.addEventListener('pointerleave', () => {
    if (document.activeElement !== button) close();
    dismissed = false;
  });
  button.addEventListener('focus', show);
  button.addEventListener('blur', () => {
    close();
    dismissed = false;
  });
  button.addEventListener('click', () => {
    dismissed = false;
    show();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !details.hidden) {
      close();
      dismissed = true;
    }
  }, { signal: events.signal });
  document.addEventListener('pointerdown', (event) => {
    if (event.target instanceof Node && !element.contains(event.target)) close();
  }, { signal: events.signal });
  const point = new THREE.Vector3();
  const bounds = new THREE.Box3();
  const corner = new THREE.Vector3();
  return {
    element,
    dispose() { events.abort(); element.remove(); },
    setDetails(name: string, activityText: string, sourceText: string) {
      button.textContent = title.textContent = name;
      activity.textContent = activityText; source.textContent = sourceText;
    },
    setActivity(text: string) {
      if (activity.textContent !== text) activity.textContent = text;
    },
    update(
      object: THREE.Object3D,
      floorY: number,
      camera: THREE.Camera,
      canvas: HTMLCanvasElement,
      visible: boolean,
      occluder?: THREE.Object3D,
    ) {
      element.hidden = !visible;
      if (!visible) {
        close();
        return;
      }
      object.getWorldPosition(point);
      point.y = floorY;
      point.project(camera);
      const x = ((point.x + 1) * canvas.clientWidth) / 2;
      const y = ((1 - point.y) * canvas.clientHeight) / 2;
      if (occluder) {
        bounds.setFromObject(occluder);
        const depth = bounds.getCenter(corner).project(camera).z;
        if (depth < point.z) {
          let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
          for (const bx of [bounds.min.x, bounds.max.x]) for (const by of [bounds.min.y, bounds.max.y]) for (const bz of [bounds.min.z, bounds.max.z]) {
            corner.set(bx, by, bz).project(camera);
            const px = (corner.x + 1) * canvas.clientWidth / 2, py = (1 - corner.y) * canvas.clientHeight / 2;
            left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
          }
          if (x + element.offsetWidth / 2 > left && x - element.offsetWidth / 2 < right && y + 20 > top && y + 3 < bottom) {
            element.hidden = true; close(); return;
          }
        }
      }
      // Anchor to the actual floor/boot position. DOM lettering stays sharp
      // independently of the intentionally low-resolution room canvas.
      element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y + 3)}px) translateX(-50%)`;
      details.style.setProperty(
        '--detail-shift',
        `${Math.max(0, 122 - x) - Math.max(0, x + 122 - canvas.clientWidth)}px`,
      );
      details.dataset.above = String(y + 150 > canvas.clientHeight);
    },
  };
}
