import * as THREE from 'three';

// Minecraft's visual cycle, starting with the full moon. Artwork is drawn here
// for this scene; the reference game's texture files are not bundled.
export const MOON_PHASES = [
  { id: 'full', label: 'Full moon', light: 1 },
  { id: 'waning-gibbous', label: 'Waning gibbous', light: 0.75 },
  { id: 'last-quarter', label: 'Last quarter', light: 0.5 },
  { id: 'waning-crescent', label: 'Waning crescent', light: 0.25 },
  { id: 'new', label: 'New moon', light: 0 },
  { id: 'waxing-crescent', label: 'Waxing crescent', light: 0.25 },
  { id: 'first-quarter', label: 'First quarter', light: 0.5 },
  { id: 'waxing-gibbous', label: 'Waxing gibbous', light: 0.75 },
] as const;
export type MoonPhase = (typeof MOON_PHASES)[number]['id'];
export function moonPhaseFromSearch(search: string): MoonPhase {
  const value = new URLSearchParams(search).get('moonPhase');
  return MOON_PHASES.find(phase => phase.id === value)?.id ?? 'full';
}
export function moonIllumination(phase: MoonPhase): number {
  return MOON_PHASES.find(entry => entry.id === phase)!.light;
}

/** Square outlines stay fixed while a stepped terminator crosses the face. */
export function moonPixelLit(phase: MoonPhase, x: number, y: number): boolean {
  if (x < 0 || x >= 16 || y < 0 || y >= 16 || phase === 'new') return false;
  if (phase === 'full') return true;
  const fromLeft = phase.startsWith('waning') || phase === 'last-quarter';
  const sideX = fromLeft ? x : 15 - x;
  if (phase.endsWith('quarter')) return sideX < 8;
  const crescentWidths = [6, 4, 3, 2, 2, 1, 1, 1, 1, 1, 1, 2, 2, 3, 4, 6];
  return sideX < (phase.endsWith('gibbous') ? 16 - crescentWidths[y] : crescentWidths[y]);
}

export function celestialPixels(kind: 'sun' | MoonPhase): Uint8Array {
  const pixels = new Uint8Array(32 * 32 * 4);
  const fullness = kind === 'sun' ? 1 : moonIllumination(kind);
  const craters = [[2, 3, 3, 4], [10, 1, 3, 2], [9, 9, 4, 3], [3, 12, 2, 2]];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const radius = Math.max(Math.abs(x - 15.5), Math.abs(y - 15.5));
    let color = kind === 'sun' ? [255, 241, 188] : [156, 182, 224];
    let alpha = radius < 10 ? 0.14 : radius < 12 ? 0.07 : radius < 14 ? 0.025 : 0;
    if (kind !== 'sun') alpha *= 0.15 + fullness * 0.85;
    if (radius < 8) {
      if (kind === 'sun') {
        color = radius < 5 ? [255, 255, 250] : radius < 7 ? [255, 245, 203] : [241, 214, 148];
        alpha = 1;
      } else {
        const mx = x - 8, my = y - 8;
        if (moonPixelLit(kind, mx, my)) {
          color = [220, 227, 237];
          for (const [cx, cy, w, h] of craters) {
            if (mx >= cx && mx < cx + w && my >= cy && my < cy + h) color = [140, 157, 181];
            if (mx === cx + w && my >= cy + 1 && my < cy + h + 1) color = [244, 246, 249];
          }
          if (mx === 15 || my === 15) color = color.map(value => Math.round(value * 0.8));
          alpha = 1;
        } else {
          color = [135, 157, 191];
          alpha = mx === 0 || mx === 15 || my === 0 || my === 15 ? 0.085 : 0.025;
        }
      }
    }
    const index = (y * 32 + x) * 4;
    pixels.set([...color, Math.round(alpha * 255)], index);
  }
  return pixels;
}

export function celestialTexture(kind: 'sun' | MoonPhase): THREE.DataTexture {
  const texture = new THREE.DataTexture(celestialPixels(kind), 32, 32);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.flipY = true;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
