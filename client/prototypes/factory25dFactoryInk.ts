import { onFactoryBranding, paintFactoryArtwork } from './factory25dBranding';

/** Interactive tiles use this factory's artwork rather than a bundled company mark. */
export function createFactoryInk() {
  const host = document.createElement('div'), canvas = document.createElement('canvas'), source = document.createElement('canvas');
  canvas.width = source.width = 1024; canvas.height = source.height = 576; host.append(canvas);
  const ctx = canvas.getContext('2d')!, ink = source.getContext('2d')!;
  const tiles = Array.from({ length: 32 * 18 }, (_, i) => ({ x: i % 32 * 32, y: Math.floor(i / 32) * 32, dx: 0, dy: 0, vx: 0, vy: 0 }));
  let pointer: { x: number; y: number } | undefined;
  const draw = () => { ctx.clearRect(0, 0, 1024, 576); for (const p of tiles) ctx.drawImage(source, p.x, p.y, 32, 32, p.x + p.dx, p.y + p.dy, 32, 32); };
  const reset = () => { for (const p of tiles) p.dx = p.dy = p.vx = p.vy = 0; draw(); };
  const stop = onFactoryBranding(() => { paintFactoryArtwork(ink, 1024, 576); reset(); });
  return Object.assign(host, { canvas,
    seek: (_time: number) => reset(), replay: reset, release() {},
    stir(x: number, y: number) { pointer = { x, y }; }, unstir() { pointer = undefined; },
    blow() { tiles.forEach((p, i) => { p.vx = Math.sin(i * 12.9898) * 450; p.vy = Math.cos(i * 7.123) * 300 - 100; }); },
    advance(seconds: number) {
      const dt = Math.min(.1, Math.max(0, seconds));
      for (const p of tiles) {
        if (pointer) { const x = p.x + 16 - pointer.x, y = p.y + 16 - pointer.y, distance = Math.hypot(x, y); if (distance < 130 && distance > 1) { p.vx += x / distance * 900 * dt; p.vy += y / distance * 900 * dt; } }
        p.vx += -p.dx * 20 * dt; p.vy += -p.dy * 20 * dt;
        p.vx *= Math.exp(-5 * dt); p.vy *= Math.exp(-5 * dt); p.dx += p.vx * dt; p.dy += p.vy * dt;
      }
      draw();
    },
    dispose() { stop(); host.remove(); },
  });
}
