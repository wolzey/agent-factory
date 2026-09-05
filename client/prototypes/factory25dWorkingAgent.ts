import * as THREE from 'three';

/** Back-facing work pose for the preview's blue-shirted, navy-cap character.
 * Four pixel frames alternate hands at the control deck; no face looks at the room. */
export function workingAgentTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 36;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not draw the working character');
  for (let frame = 0; frame < 4; frame += 1) {
    const x = frame * 32;
    const rect = (color: string, px: number, py: number, w: number, h: number) => {
      ctx.fillStyle = color; ctx.fillRect(x + px, py, w, h);
    };
    rect('#070d1c', 8, 4, 16, 13);
    rect('#101c35', 7, 5, 18, 9);
    rect('#192d49', 9, 3, 14, 9);
    rect('#243b59', 10, 3, 12, 2);
    rect('#101a2a', 10, 12, 12, 5);
    rect('#57999e', 7, 13, 2, 3); rect('#57999e', 23, 13, 2, 3);
    rect('#172f66', 7, 17, 18, 12);
    rect('#2452c0', 8, 17, 16, 10);
    rect('#3267df', 9, 17, 14, 2);
    rect('#173270', 8, 27, 16, 3);
    rect('#102244', 9, 29, 6, 4); rect('#102244', 18, 29, 5, 4);
    rect('#080f1c', 8, 32, 7, 2); rect('#080f1c', 18, 32, 7, 2);
    // Raised forearms reach toward the machine, with small alternating keystrokes.
    rect('#193c94', 5, 13, 4, 11); rect('#193c94', 23, 13, 4, 11);
    rect('#3269d5', 5, 14, 3, 7); rect('#3269d5', 24, 14, 3, 7);
    rect('#66b3b7', 5, 11 + frame % 2, 3, 3);
    rect('#66b3b7', 24, 12 - frame % 2, 3, 3);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(0.25, 1);
  return texture;
}
