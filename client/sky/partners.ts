import { DEFAULT_SKYLINE_SEED, generateSkyline } from './skylineData';
import { mullionRanges, rangesOverlap } from './obstacles';
import type { Range } from './obstacles';
import type { Rgb, SkylineBounds, SkylineBuilding, SkylineDataSource, SkylinePartnerRef, SkylineSign } from './skylineData';

export const SILICON_SLOPES_SOURCES = [
  'https://investors.pattern.com/node/7616/pdf',
  'https://www.route.com/newsroom/route-acquires-frate-returns',
  'https://www.entrata.com/press/entrata-unveils-ai-powered-platforms-at-summit-2025-bringing-autonomous-property-management-tm-closer-to-reality',
  'https://www.podium.com/whats-new',
  'https://www.domo.com/news/press/domo-announces-fourth-quarter-and-fiscal-2026-financial-results',
] as const;
export const SILICON_SLOPES_HEADING = 'Silicon Slopes companies';

export interface SkylinePartner {
  /** Stable id, also used for accessibility hooks. */
  id: string;
  name: string;
  featured: boolean;
  /** Placement order within its group (lower first). Reorder freely; it never affects visibility. */
  priority: number;
  color: Rgb;
  /** Wordmark drawn in the 5x7 pixel font when featured. */
  wordmark?: string;
  /** Logo bitmap ('#' lit, '.' dark) drawn instead of the wordmark when featured. */
  logo?: string[];
}

export const SKYLINE_PARTNERS: readonly SkylinePartner[] = [
  { id: 'pattern', name: 'Pattern', featured: true, priority: 1, wordmark: 'PATTERN', color: [255, 116, 82] },
  { id: 'route', name: 'Route', featured: true, priority: 2, wordmark: 'ROUTE', color: [106, 225, 183] },
  { id: 'entrata', name: 'Entrata', featured: true, priority: 3, wordmark: 'ENTRATA', color: [255, 78, 96] },
  { id: 'podium', name: 'Podium', featured: true, priority: 4, wordmark: 'PODIUM', color: [112, 105, 255] },
  { id: 'domo', name: 'Domo', featured: true, priority: 5, wordmark: 'DOMO', color: [80, 190, 255] },
];

/**
 * Horizontal anchors (share of glass width) for featured partners, in priority order:
 * centre first, then left, then right. Towers are nudged off mullions and hanging props
 * automatically, so these only express the intended composition.
 */
export const FEATURED_ANCHORS: readonly number[] = [0.5, 0.2, 0.8, 0.36, 0.65];
/** Horizontal anchors for quiet partners, in priority order. */
export const QUIET_ANCHORS: readonly number[] = [];

export function partnerRef(partner: SkylinePartner): SkylinePartnerRef {
  return { id: partner.id, name: partner.name, featured: partner.featured, priority: partner.priority };
}

export function partnerSign(partner: SkylinePartner): SkylineSign {
  if (!partner.featured) return { quiet: true, color: partner.color };
  if (partner.logo) return { logo: partner.logo, color: partner.color };
  return { label: partner.wordmark ?? partner.name, color: partner.color, font: 'large' };
}

/** Pixels a featured wordmark or logo needs on the facade (bitmap width + panel padding + margin). */
function requiredWidth(partner: SkylinePartner, bounds: SkylineBounds): number {
  if (!partner.featured) return Math.round(bounds.maxWidth * 1.2);
  if (partner.logo) return (partner.logo[0]?.length ?? 0) + 4 + 6;
  const text = (partner.wordmark ?? partner.name).toUpperCase();
  return text.length * 6 - 1 + 4 + 6;
}

function hashId(id: string): number {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export interface PartnerSourceOptions {
  /** Glass-local x ranges the towers must keep clear of (props hanging in front of the glass). */
  avoid?: readonly Range[];
  /** Window panes, so towers also avoid the mullions between them. */
  panes?: number;
}

/** Nearest x for a tower of `width` to `preferred` that clears every range and stays inside the glass. */
export function clearPosition(preferred: number, width: number, glassWidth: number, avoid: readonly Range[]): number | null {
  const maxShift = Math.round(glassWidth / 2);
  for (let shift = 0; shift <= maxShift; shift++) {
    for (const delta of shift === 0 ? [0] : [-shift, shift]) {
      const x = Math.round(preferred + delta);
      if (x < 0 || x + width > glassWidth) continue;
      const range: Range = [x, x + width];
      if (!avoid.some(r => rangesOverlap(range, r))) return x;
    }
  }
  return null;
}

/**
 * A data source that takes the generated skyline and carves a few partner towers into it:
 * featured partners become wide anchor towers carrying their wordmark, quiet partners become
 * ordinary towers with a dark panel. Towers are centred on their anchors, nudged sideways
 * only as far as needed to clear mullions, hanging props and each other. Deterministic for
 * a given seed.
 */
export function createPartnerSkylineSource(
  partners: readonly SkylinePartner[] = SKYLINE_PARTNERS,
  seed: number = DEFAULT_SKYLINE_SEED,
  options: PartnerSourceOptions = {},
): SkylineDataSource {
  return {
    buildings(width: number, bounds: SkylineBounds): SkylineBuilding[] {
      const avoid: Range[] = [...(options.avoid ?? []), ...mullionRanges(width, options.panes ?? 6)];
      const byGroup = (featured: boolean) =>
        partners.filter(p => p.featured === featured).sort((a, b) => a.priority - b.priority);
      const placements: Array<{ partner: SkylinePartner; anchorX: number }> = [];
      const featured = byGroup(true);
      const quiet = byGroup(false);
      featured.forEach((partner, i) => {
        const share = FEATURED_ANCHORS[i] ?? (i + 1) / (featured.length + 1);
        placements.push({ partner, anchorX: share * width });
      });
      quiet.forEach((partner, i) => {
        const share = QUIET_ANCHORS[i] ?? (i + 1) / (quiet.length + 1);
        placements.push({ partner, anchorX: share * width });
      });

      let buildings = generateSkyline(width, seed, bounds);
      const gap = bounds.gap;
      for (const { partner, anchorX } of placements) {
        const towerWidth = Math.min(width, requiredWidth(partner, bounds));
        const x = clearPosition(anchorX - towerWidth / 2, towerWidth, width, avoid) ?? Math.max(0, Math.min(width - towerWidth, Math.round(anchorX - towerWidth / 2)));
        const zone: Range = [x - gap, x + towerWidth + gap];
        // Carve the zone out of the generated city, trimming neighbours that straddle it.
        const carved: SkylineBuilding[] = [];
        for (const b of buildings) {
          const bRange: Range = [b.x, b.x + b.width];
          if (!rangesOverlap(bRange, zone) || b.partner) {
            carved.push(b);
            continue;
          }
          if (b.x < zone[0]) {
            const w = zone[0] - b.x;
            if (w >= bounds.minWidth) carved.push({ ...b, width: w, sign: null });
          }
          if (b.x + b.width > zone[1]) {
            const w = b.x + b.width - zone[1];
            if (w >= bounds.minWidth) carved.push({ ...b, x: zone[1], width: w, sign: null });
          }
        }
        carved.push({
          x,
          width: towerWidth,
          height: partner.featured ? bounds.maxHeight : Math.round(bounds.minHeight + (bounds.maxHeight - bounds.minHeight) * 0.7),
          roof: partner.featured ? 'flat' : 'step',
          lit: 0.7,
          seed: (seed * 31 + hashId(partner.id)) >>> 0,
          facade: partner.featured ? 0.65 : 0.45,
          windows: 'grid',
          setback: 0,
          antenna: !partner.featured,
          sign: partnerSign(partner),
          partner: partnerRef(partner),
        });
        buildings = carved.sort((a, b) => a.x - b.x);
        avoid.push([x - gap, x + towerWidth + gap]);
      }
      return buildings;
    },
  };
}

/** Buildings that carry partner metadata, in left-to-right order. */
export function partnerBuildings(buildings: readonly SkylineBuilding[]): SkylineBuilding[] {
  return buildings.filter(b => b.partner).sort((a, b) => a.x - b.x);
}
