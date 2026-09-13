import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PNG } from 'pngjs';
import type { FastifyInstance } from 'fastify';
import { NEUTRAL_ACCENT, NEUTRAL_TITLE, type FactoryBranding } from '../shared/factory-branding.js';

const hash = (input: string | Buffer) => createHash('sha256').update(input).digest('hex');
const MAX_PNG = 2 * 1024 * 1024;
export function brandingLogo(input: Buffer): Buffer {
  if (input.length > MAX_PNG || input.length < 33 || input.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    || input.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Branding logo must be a PNG no larger than 2 MiB.');
  const width = input.readUInt32BE(16), height = input.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 1024 || height > 1024) throw new Error('Branding logo dimensions must be between 1 and 1024 pixels.');
  // Decode with CRC checks, then strip metadata/ancillary content on re-encode.
  const decoded = PNG.sync.read(input, { checkCRC: true });
  const encoded = PNG.sync.write(decoded);
  if (encoded.length > MAX_PNG) throw new Error('Decoded branding logo must fit in 2 MiB; use a smaller image.');
  return encoded;
}
export function createBranding(value: unknown, fallbackTitle = NEUTRAL_TITLE, image?: Buffer) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Branding configuration must be an object.');
  const raw = value as Record<string, unknown>;
  const title = raw.title ?? fallbackTitle;
  const accent = raw.accentColor ?? NEUTRAL_ACCENT;
  if (typeof title !== 'string' || !title.trim() || Array.from(title.trim()).length > 100 || /[\u0000-\u001f\u007f]/.test(title)) throw new Error('Branding title must contain 1–100 printable characters.');
  if (typeof accent !== 'string' || !/^#[a-f0-9]{6}$/i.test(accent)) throw new Error('Branding accentColor must be a six-digit hex color.');
  const logo = image ? brandingLogo(image) : undefined;
  const logoUrl = logo ? `/api/branding/assets/${hash(logo)}.png` : null;
  const identity = { title: title.trim(), accentColor: accent.toUpperCase(), logoUrl };
  const branding: FactoryBranding = { version: 1, revision: hash(JSON.stringify(identity)), accentColor: identity.accentColor, logoUrl };
  return { title: identity.title, branding, logo };
}
export function loadBranding(fallbackTitle: string, env: NodeJS.ProcessEnv = process.env) {
  const path = env.FACTORY_BRANDING_FILE;
  if (path && statSync(path).size > 16 * 1024) throw new Error('Branding configuration is too large.');
  const raw: Record<string, unknown> = path ? JSON.parse(readFileSync(path, 'utf8')) : {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Branding configuration must be an object.');
  if (env.FACTORY_TITLE !== undefined) raw.title = env.FACTORY_TITLE;
  if (env.FACTORY_ACCENT_COLOR !== undefined) raw.accentColor = env.FACTORY_ACCENT_COLOR;
  const imagePath = env.FACTORY_BRANDING_LOGO ?? raw.logoFile;
  let logo: Buffer | undefined;
  if (imagePath != null) {
    if (typeof imagePath !== 'string' || !imagePath.trim()) throw new Error('Branding logoFile must name a local PNG.');
    const absolute = resolve(path ? dirname(resolve(path)) : process.cwd(), imagePath);
    if (statSync(absolute).size > MAX_PNG) throw new Error('Branding logo is too large.');
    logo = readFileSync(absolute);
  }
  return createBranding(raw, fallbackTitle, logo);
}
export function registerBrandingAssets(app: FastifyInstance, loaded: ReturnType<typeof createBranding>) {
  if (!loaded.logo || !loaded.branding.logoUrl) return;
  const logo = loaded.logo;
  app.get(loaded.branding.logoUrl, async (_request, reply) => reply
    .header('Cache-Control', 'public, max-age=31536000, immutable')
    .header('X-Content-Type-Options', 'nosniff').type('image/png').send(logo));
}
