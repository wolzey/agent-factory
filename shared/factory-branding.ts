/** Public factory identity; never includes operator file paths or private settings. */
export interface FactoryBranding {
  version: 1;
  revision: string;
  accentColor: string;
  logoUrl: string | null;
}
export const NEUTRAL_ACCENT = '#DBBEF6';
export const NEUTRAL_TITLE = 'Agent Factory';
export const BRANDING_LOGO_PATH = /^\/api\/branding\/assets\/[a-f0-9]{64}\.png$/;
export function publicBranding(value: unknown): FactoryBranding | undefined {
  if (!value || typeof value !== 'object') return;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || typeof v.revision !== 'string' || !/^[a-f0-9]{64}$/.test(v.revision)
    || typeof v.accentColor !== 'string' || !/^#[a-f0-9]{6}$/i.test(v.accentColor)
    || !(v.logoUrl === null || typeof v.logoUrl === 'string' && BRANDING_LOGO_PATH.test(v.logoUrl))) return;
  return { version: 1, revision: v.revision, accentColor: v.accentColor.toUpperCase(), logoUrl: v.logoUrl };
}
