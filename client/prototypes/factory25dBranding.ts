import * as THREE from 'three';
import { NEUTRAL_ACCENT, NEUTRAL_TITLE, type FactoryBranding } from '../../shared/factory-branding';
export type FactoryIdentity = { title: string; branding?: FactoryBranding };
let current: FactoryIdentity = { title: NEUTRAL_TITLE };
let logo: HTMLImageElement | undefined, generation = 0, request: AbortController | undefined;
const listeners = new Set<() => void>();
export const factoryIdentity = () => current;
export const factoryLogo = () => logo;
export function onFactoryBranding(receive: () => void) { listeners.add(receive); receive(); return () => listeners.delete(receive); }
const changed = () => { for (const receive of listeners) receive(); };
export function disposeFactoryBranding() { generation++; request?.abort(); request=undefined; logo=undefined; }
export async function applyFactoryBranding(identity: FactoryIdentity, host: string) {
  const epoch = ++generation; request?.abort(); request = undefined;
  current = identity; logo = undefined; changed();
  if (!identity.branding?.logoUrl) return;
  const controller = new AbortController(); request = controller;
  const timeout = setTimeout(() => controller.abort(), 8000);
  let objectUrl: string | undefined;
  try {
    const response = await fetch(new URL(identity.branding.logoUrl, host), { credentials: 'omit', signal: controller.signal, redirect: 'error' });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png') || !response.body) return;
    const reader = response.body.getReader(), chunks: Uint8Array<ArrayBuffer>[] = []; let total = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > 2 * 1024 * 1024) { await reader.cancel(); return; } chunks.push(new Uint8Array(value)); }
    const blob = new Blob(chunks, { type: 'image/png' });
    const header = new DataView(await blob.slice(0, 24).arrayBuffer());
    if (header.byteLength < 24 || header.getUint32(0) !== 0x89504e47 || header.getUint32(4) !== 0x0d0a1a0a || header.getUint32(16) > 1024 || header.getUint32(20) > 1024) return;
    objectUrl = URL.createObjectURL(blob); const image = new Image(); image.src = objectUrl; await image.decode();
    if (epoch !== generation || controller.signal.aborted) return;
    logo = image; changed();
  } catch { /* Neutral artwork remains visible if this factory's logo is unavailable. */ }
  finally { clearTimeout(timeout); if (objectUrl) URL.revokeObjectURL(objectUrl); if (request === controller) request = undefined; }
}
export function paintFactoryArtwork(ctx: CanvasRenderingContext2D, width: number, height: number, label?: string, background?: string) {
  ctx.clearRect(0, 0, width, height);
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, width, height); }
  const accent = current.branding?.accentColor ?? NEUTRAL_ACCENT;
  if (!label && logo) {
    const scale = Math.min(width * .88 / logo.naturalWidth, height * .82 / logo.naturalHeight);
    ctx.drawImage(logo, (width - logo.naturalWidth * scale) / 2, (height - logo.naturalHeight * scale) / 2, logo.naturalWidth * scale, logo.naturalHeight * scale);
  } else if (label) {
    ctx.fillStyle = accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${height * .62}px "Geist Pixel", monospace`; ctx.fillText(label, width / 2, height / 2, width * .92);
  } else {
    ctx.fillStyle = accent; const size = Math.min(width / 5, height * .65);
    for (let i = 0; i < 3; i++) ctx.fillRect(width / 2 + (i - 1.5) * size * 1.2, (height - size) / 2, size, size);
  }
}
export function brandingTexture(aspect: number, label?: () => string, background?: string) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = Math.max(32, Math.round(1024 / aspect));
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const repaint = () => { paintFactoryArtwork(canvas.getContext('2d')!, canvas.width, canvas.height, label?.(), background); texture.needsUpdate = true; };
  const stop = onFactoryBranding(repaint); void document.fonts.ready.then(() => { if (listeners.has(repaint)) repaint(); });
  texture.addEventListener('dispose', stop); return texture;
}
