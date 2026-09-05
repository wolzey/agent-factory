import * as THREE from 'three';
import { formatMountainClock } from '../sky/clock';
import { signTexture } from './factory25dLabels';
import { propPart, standard } from './factory25dProps';

export function factoryTitleTexture(title: string) {
  const canvas = document.createElement('canvas'); canvas.width = 448; canvas.height = 48;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#080b1a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '32px "Geist Pixel", monospace';
  const fontSize = Math.min(32, 32 * 420 / Math.max(1, ctx.measureText(title).width));
  ctx.font = `${fontSize}px "Geist Pixel", monospace`;
  ctx.fillStyle = '#ff52de'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(title, 224, 24);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.NearestFilter; texture.generateMipmaps = false;
  return texture;
}

export function createWallClock(parent: THREE.Scene, y: number) {
  const housing = new THREE.Group();
  propPart(housing, [1.4, 0.31, 0.08], [0, 0, 0], standard('#351b29', 1));
  const material = new THREE.MeshBasicMaterial();
  const display = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 0.245), material);
  display.position.z = 0.041;
  housing.add(display);
  housing.position.set(5.6, y, -4.21);
  parent.add(housing);
  const accessible = document.createElement('time');
  accessible.className = 'sr-only';
  document.querySelector('.slice-shell')!.append(accessible);
  let previous = '';
  let nextUpdate = 0;
  return {
    update(now: number) {
      if (now < nextUpdate) return;
      nextUpdate = now + 1000;
      // The clock shows actual Utah time, independent of manual art-preview weather.
      const timestamp = Date.now();
      const text = formatMountainClock(timestamp);
      if (text === previous) return;
      previous = text;
      material.map?.dispose();
      material.map = signTexture(text, '#ff576a', '#130d1a', 2, 1.32 / 0.245);
      material.needsUpdate = true;
      accessible.dateTime = new Date(timestamp).toISOString();
      accessible.textContent = `${text} Mountain time`;
    },
  };
}
