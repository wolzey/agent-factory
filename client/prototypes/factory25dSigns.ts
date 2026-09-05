import * as THREE from 'three';
import { formatMountainClock } from '../sky/clock';
import { contactShadow } from './factory25dContactShadows';
import { signTexture } from './factory25dLabels';
import { propPart, standard } from './factory25dProps';

export function createDeskCard(parent: THREE.Group) {
  const card = new THREE.Group();
  const width = 1.15;
  const rise = 0.25;
  const halfDepth = 0.14;
  const faceHeight = Math.hypot(rise, halfDepth);
  const tilt = Math.atan2(halfDepth, rise);
  const paper = standard('#d9dfd6', 1, '#111720');
  const front = propPart(card, [width, faceHeight, 0.012], [0, rise / 2, halfDepth / 2], paper);
  front.rotation.x = -tilt;
  const back = propPart(card, [width, faceHeight, 0.012], [0, rise / 2, -halfDepth / 2], paper);
  back.rotation.x = tilt;
  const ink = new THREE.Mesh(
    new THREE.PlaneGeometry(width - 0.05, faceHeight - 0.035),
    new THREE.MeshStandardMaterial({
      map: signTexture('OPEN 24/7', '#204653', '#d9dfd6', 3, (width - 0.05) / (faceHeight - 0.035)),
      roughness: 1,
      emissive: '#121e24',
      emissiveIntensity: 0.25,
    }),
  );
  ink.position.z = 0.0065;
  front.add(ink);
  propPart(card, [width, 0.012, 0.018], [0, rise, 0], standard('#ecede1', 1));
  card.position.set(-3.2, 0.537, 4.66);
  // Both feet stay within the counter's 0.42-unit depth, including the turn.
  card.rotation.y = -0.1;
  parent.add(card);
  contactShadow(parent, {
    x: -3.2,
    z: 4.66,
    floorY: 0.53,
    width,
    depth: halfDepth * 2,
    spread: 0.035,
    opacity: 0.2,
  });
}

export function createWallClock(parent: THREE.Scene, y: number) {
  const housing = new THREE.Group();
  propPart(housing, [0.94, 0.31, 0.08], [0, 0, 0], standard('#351b29', 1));
  const material = new THREE.MeshBasicMaterial();
  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.87, 0.245), material);
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
      material.map = signTexture(text, '#ff576a', '#130d1a', 2, 0.87 / 0.245);
      material.needsUpdate = true;
      accessible.dateTime = new Date(timestamp).toISOString();
      accessible.textContent = `${text} Mountain time`;
    },
  };
}
