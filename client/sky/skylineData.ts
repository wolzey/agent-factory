/**
 * Building data for the skyline window.
 *
 * The city is intentionally neutral. `SkylineDataSource` is the single hook where an
 * authoritative list of buildings (optionally carrying real sign labels or logo
 * bitmaps) can be supplied. Until one exists the deterministic generated skyline is
 * the only source, and its sign panels carry abstract placeholder glyphs: no letters,
 * no wordmarks, nothing that could be mistaken for a real company.
 */

export type RoofStyle = 'flat' | 'spire' | 'step' | 'crown' | 'peak';
export type WindowPattern = 'grid' | 'bands' | 'columns' | 'sparse';
export type Rgb = readonly [number, number, number];
export type SignFont = 'small' | 'large';

/**
 * A sign panel on a building. With neither `label` nor `logo` the panel renders a
 * decorative placeholder glyph. `label` is drawn in a pixel font (3x5 `small` by default,
 * 5x7 `large` for anchor wordmarks); `logo` is a bitmap of rows using '#' for lit pixels
 * and '.' for dark ones. A `quiet` sign is a dark, unlabeled panel that only reveals its
 * owner through the hover tooltip.
 */
export interface SkylineSign {
  label?: string;
  logo?: string[];
  color?: Rgb;
  font?: SignFont;
  quiet?: boolean;
}

/**
 * Metadata attaching a building to a named organisation from the approved public source.
 * `featured` alone decides whether its logo is always visible; `priority` only orders
 * placement, so the list can be reordered without changing what is shown.
 */
export interface SkylinePartnerRef {
  id: string;
  name: string;
  featured: boolean;
  priority: number;
}

export interface SkylineBuilding {
  /** Left edge in window pixels. */
  x: number;
  width: number;
  /** Height in pixels above the city baseline. */
  height: number;
  roof: RoofStyle;
  /** 0 to 1 share of windows that glow at night. */
  lit: number;
  /** Seed for this building's window pattern so it never changes between frames. */
  seed: number;
  /** 0 to 1 facade brightness, for value variation across the block. */
  facade: number;
  windows: WindowPattern;
  /** Number of stepped-back upper tiers (0 to 2). */
  setback: number;
  antenna: boolean;
  /** Sign panel, or null for a plain building. */
  sign: SkylineSign | null;
  /** Present only when an approved data source attached an organisation to this building. */
  partner?: SkylinePartnerRef | null;
}

export type SignKind = 'none' | 'placeholder' | 'label' | 'logo' | 'quiet';

export interface SkylineDataSource {
  /**
   * Return the buildings to draw for a glass `width`; `bounds` are the size limits the
   * default skyline uses at this glass height. Throw or return [] to fall back.
   */
  buildings(width: number, bounds: SkylineBounds): SkylineBuilding[];
}

export interface SkylineBounds {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  gap: number;
}

export const DEFAULT_SKYLINE_SEED = 0x5a1c;

export const DEFAULT_SKYLINE_BOUNDS: SkylineBounds = {
  minWidth: 5,
  maxWidth: 12,
  minHeight: 4,
  maxHeight: 13,
  gap: 1,
};

/** Longest label the pixel font will render on a sign. */
export const MAX_SIGN_LABEL = 12;
export const MAX_LOGO_WIDTH = 32;
export const MAX_LOGO_HEIGHT = 10;

const ROOFS: RoofStyle[] = ['flat', 'flat', 'flat', 'step', 'spire', 'crown', 'peak', 'flat'];
const WINDOW_PATTERNS: WindowPattern[] = ['grid', 'grid', 'bands', 'columns', 'sparse'];

/** Small deterministic PRNG (mulberry32) so every viewer sees the same skyline. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministically fill `width` pixels with unlabeled buildings. */
export function generateSkyline(
  width: number,
  seed: number = DEFAULT_SKYLINE_SEED,
  bounds: SkylineBounds = DEFAULT_SKYLINE_BOUNDS,
): SkylineBuilding[] {
  const random = createSeededRandom(seed);
  const buildings: SkylineBuilding[] = [];
  const heightSpan = bounds.maxHeight - bounds.minHeight;
  let x = 0;
  let index = 0;
  while (x < width) {
    const w = Math.min(
      bounds.minWidth + Math.floor(random() * (bounds.maxWidth - bounds.minWidth + 1)),
      width - x,
    );
    if (w < bounds.minWidth) break;
    // Bias toward mid-height towers with occasional tall ones, like a real downtown.
    const shape = random();
    const tallness = shape > 0.85 ? 0.75 + random() * 0.25 : random() * 0.7;
    const h = bounds.minHeight + Math.round(tallness * heightSpan);
    const tall = tallness > 0.5;
    const roll = random();
    const setback = tall && roll > 0.55 ? (roll > 0.85 ? 2 : 1) : 0;
    const signRoll = random();
    const canSign = w >= bounds.minWidth + 4 && h >= bounds.minHeight + heightSpan * 0.35;
    buildings.push({
      x,
      width: w,
      height: h,
      roof: ROOFS[Math.floor(random() * ROOFS.length)],
      lit: 0.35 + random() * 0.45,
      seed: (seed * 31 + index * 7919) >>> 0,
      facade: random(),
      windows: WINDOW_PATTERNS[Math.floor(random() * WINDOW_PATTERNS.length)],
      setback,
      antenna: random() < 0.25,
      sign: canSign && signRoll < 0.6 ? {} : null,
    });
    x += w + bounds.gap;
    index++;
  }
  return buildings;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isRgb(value: unknown): value is Rgb {
  return Array.isArray(value) && value.length === 3 && value.every(c => typeof c === 'number' && c >= 0 && c <= 255);
}

const LABEL_CHARS = /[^A-Z0-9 .&-]/g;

/** Normalise a supplied label to the pixel font's character set, or null when unusable. */
export function sanitizeSignLabel(label: unknown): string | null {
  if (typeof label !== 'string') return null;
  const clean = label.toUpperCase().replace(LABEL_CHARS, '').replace(/\s+/g, ' ').trim();
  if (clean.length === 0 || clean.length > MAX_SIGN_LABEL) return null;
  return clean;
}

/** Validate a supplied logo bitmap: 1 to 10 rows of equal length, '#' and '.' only. */
export function sanitizeSignLogo(logo: unknown): string[] | null {
  if (!Array.isArray(logo) || logo.length === 0 || logo.length > MAX_LOGO_HEIGHT) return null;
  if (!logo.every(row => typeof row === 'string')) return null;
  const rows = logo as string[];
  const width = rows[0].length;
  if (width === 0 || width > MAX_LOGO_WIDTH) return null;
  if (!rows.every(row => row.length === width && /^[#.]+$/.test(row))) return null;
  if (!rows.some(row => row.includes('#'))) return null;
  return rows;
}

/** Clamp a supplied sign to something the painter can draw. Bad content degrades to a placeholder. */
export function sanitizeSign(sign: unknown): SkylineSign | null {
  if (sign === null || sign === undefined) return null;
  if (typeof sign !== 'object') return null;
  const raw = sign as Record<string, unknown>;
  const out: SkylineSign = {};
  const label = sanitizeSignLabel(raw.label);
  if (label) out.label = label;
  const logo = sanitizeSignLogo(raw.logo);
  if (logo) out.logo = logo;
  if (isRgb(raw.color)) out.color = [Math.round(raw.color[0]), Math.round(raw.color[1]), Math.round(raw.color[2])];
  if (raw.font === 'small' || raw.font === 'large') out.font = raw.font;
  if (raw.quiet === true) out.quiet = true;
  return out;
}

export const MAX_PARTNER_NAME = 40;
const PARTNER_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** Validate partner metadata; anything malformed drops the attachment entirely. */
export function sanitizePartner(partner: unknown): SkylinePartnerRef | null {
  if (!partner || typeof partner !== 'object') return null;
  const raw = partner as Record<string, unknown>;
  if (typeof raw.id !== 'string' || !PARTNER_ID.test(raw.id)) return null;
  if (typeof raw.name !== 'string') return null;
  const name = raw.name.replace(/\s+/g, ' ').trim();
  if (name.length === 0 || name.length > MAX_PARTNER_NAME) return null;
  if (typeof raw.featured !== 'boolean') return null;
  if (typeof raw.priority !== 'number' || !Number.isFinite(raw.priority)) return null;
  return { id: raw.id, name, featured: raw.featured, priority: raw.priority };
}

/** True when the building's panel must stay dark: an explicit quiet sign, or a non-featured partner. */
export function isQuietBuilding(b: Pick<SkylineBuilding, 'sign' | 'partner'>): boolean {
  if (!b.sign) return false;
  if (b.sign.quiet) return true;
  return Boolean(b.partner && !b.partner.featured);
}

export function signKind(sign: SkylineSign | null | undefined): SignKind {
  if (!sign) return 'none';
  if (sign.quiet) return 'quiet';
  if (sign.logo) return 'logo';
  if (sign.label) return 'label';
  return 'placeholder';
}

/** Clamp externally supplied buildings so bad data can never escape the window. */
export function sanitizeSkyline(
  buildings: SkylineBuilding[],
  width: number,
  bounds: SkylineBounds = DEFAULT_SKYLINE_BOUNDS,
): SkylineBuilding[] {
  const out: SkylineBuilding[] = [];
  for (const b of buildings) {
    if (!b || typeof b.x !== 'number' || !Number.isFinite(b.x)) continue;
    if (!isFinitePositive(b.width) || !isFinitePositive(b.height)) continue;
    const x = Math.max(0, Math.round(b.x));
    if (x >= width) continue;
    const w = Math.min(Math.round(b.width), width - x);
    if (w < 1) continue;
    const clamp01 = (v: unknown, fallback: number) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
    out.push({
      x,
      width: w,
      height: Math.min(bounds.maxHeight, Math.max(bounds.minHeight, Math.round(b.height))),
      roof: ROOFS.includes(b.roof) ? b.roof : 'flat',
      lit: clamp01(b.lit, 0.5),
      seed: typeof b.seed === 'number' && Number.isFinite(b.seed) ? b.seed >>> 0 : x * 7919,
      facade: clamp01(b.facade, 0.5),
      windows: WINDOW_PATTERNS.includes(b.windows) ? b.windows : 'grid',
      setback: typeof b.setback === 'number' && Number.isFinite(b.setback) ? Math.min(2, Math.max(0, Math.round(b.setback))) : 0,
      antenna: b.antenna === true,
      sign: sanitizeSign(b.sign),
      ...(b.partner !== undefined && b.partner !== null ? { partner: sanitizePartner(b.partner) } : {}),
    });
  }
  return out.sort((a, b) => a.x - b.x);
}

/**
 * Resolve the buildings to draw: the optional source first, the generated default
 * otherwise. A source that throws, returns nothing, or returns only invalid entries
 * falls back silently so the window is always populated.
 */
export function resolveSkyline(
  width: number,
  source?: SkylineDataSource | null,
  seed: number = DEFAULT_SKYLINE_SEED,
  bounds: SkylineBounds = DEFAULT_SKYLINE_BOUNDS,
): { buildings: SkylineBuilding[]; source: 'custom' | 'default' } {
  if (source) {
    try {
      const custom = sanitizeSkyline(source.buildings(width, bounds) ?? [], width, bounds);
      if (custom.length > 0) return { buildings: custom, source: 'custom' };
    } catch {
      // fall through to the default skyline
    }
  }
  return { buildings: generateSkyline(width, seed, bounds), source: 'default' };
}
