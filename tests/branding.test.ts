import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { PNG } from 'pngjs';
import { createBranding, registerBrandingAssets, loadBranding } from '../server/branding.js';
import { publicBranding } from '../shared/factory-branding.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const png = () => PNG.sync.write(new PNG({ width: 8, height: 4, fill: true }));
describe('operator-owned factory branding', () => {
  it('has neutral defaults, deterministic revisions and explicit removal', () => {
    const none = createBranding({});
    expect(none.title).toBe('Agent Factory'); expect(none.branding.logoUrl).toBeNull();
    expect(createBranding({}).branding).toEqual(none.branding);
    const branded = createBranding({ title: 'My factory', accentColor: '#aabbcc', tokenSecret: 'private' }, undefined, png());
    expect(branded.branding.accentColor).toBe('#AABBCC'); expect(branded.branding.revision).not.toBe(none.branding.revision);
    expect(JSON.stringify(branded.branding)).not.toContain('private');
    expect(publicBranding({ ...branded.branding, privatePath: '/secret' })).toEqual(branded.branding);
    expect(createBranding({ title: 'My factory', accentColor: '#aabbcc' }).branding.logoUrl).toBeNull();
  });
  it('rejects unsafe configuration and malformed or oversized images', () => {
    for (const config of [{ title: '' }, { title: 'x'.repeat(101) }, { title: 'x\ny' }, { accentColor: 'url(evil)' }, []])
      expect(() => createBranding(config)).toThrow();
    expect(() => createBranding({}, undefined, Buffer.from('<svg/>'))).toThrow();
    const corrupt = png(); corrupt[corrupt.length - 1] ^= 1;
    expect(() => createBranding({}, undefined, corrupt)).toThrow();
    const large = png(); large.writeUInt32BE(100000, 16);
    expect(() => createBranding({}, undefined, large)).toThrow();
    for (const logoUrl of ['https://evil.test/logo.png', '//evil.test/x', '/api/branding/assets/../secret', 'data:image/png;base64,x'])
      expect(publicBranding({ ...createBranding({}).branding, logoUrl })).toBeUndefined();
  });
  it('serves only the decoded content-addressed PNG, never configuration paths', async () => {
    const app = Fastify(), config = createBranding({ title: 'Shared' }, undefined, png());
    registerBrandingAssets(app, config);
    try {
      const response = await app.inject(config.branding.logoUrl!);
      expect(response.statusCode).toBe(200); expect(response.headers['content-type']).toBe('image/png');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(PNG.sync.read(response.rawPayload).width).toBe(8);
      expect((await app.inject('/api/branding/assets/secret.png')).statusCode).toBe(404);
    } finally { await app.close(); }
  });
  it('loads relative logo paths and environment overrides without exposing operator values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-branding-'));
    try {
      writeFileSync(join(dir, 'logo.png'), png());
      writeFileSync(join(dir, 'branding.json'), JSON.stringify({ title: 'File', logoFile: 'logo.png', tokenSecret: 'secret' }));
      const result = loadBranding('Legacy title', { FACTORY_BRANDING_FILE: join(dir, 'branding.json'), FACTORY_TITLE: 'Environment', FACTORY_ACCENT_COLOR: '#abcdef' });
      expect(result.title).toBe('Environment'); expect(result.branding.logoUrl).toMatch(/^\/api\/branding\/assets\//);
      expect(JSON.stringify(result.branding)).not.toContain(dir); expect(result.branding.accentColor).toBe('#ABCDEF');
      expect(loadBranding('Legacy title', {}).title).toBe('Legacy title');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
