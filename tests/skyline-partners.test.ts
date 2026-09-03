import { describe, expect, it } from 'vitest';
import {
  FEATURED_ANCHORS,
  QUIET_ANCHORS,
  SKYLINE_PARTNERS,
  SILICON_SLOPES_HEADING,
  SILICON_SLOPES_SOURCES,
  createPartnerSkylineSource,
  partnerBuildings,
  partnerSign,
} from '../client/sky/partners';
import type { SkylinePartner } from '../client/sky/partners';
import {
  generateSkyline,
  isQuietBuilding,
  resolveSkyline,
  sanitizePartner,
  sanitizeSign,
  sanitizeSkyline,
  signKind,
} from '../client/sky/skylineData';
import type { SkylineBuilding } from '../client/sky/skylineData';
import {
  PixelBuffer,
  buildingTiers,
  buildingWorldRect,
  createSkylineGeometry,
  hitTestBuilding,
  metricsFor,
  paintSkyline,
  signLayout,
  textBitmap,
} from '../client/sky/skylinePainter';
import { placeTooltip } from '../client/sky/tooltipLayout';
import { screenToWorld, worldRectToScreen, worldToScreen } from '../client/sky/screenMap';
import { skyStateFromSnapshot } from '../client/sky/skyPhase';
import { solarSnapshot, sunTimesForLocalDay } from '../client/sky/solar';
import { HEADER_HEIGHT, VIEW_HEIGHT, WALL_BAND, skylineWindowRect } from '../client/scenes/viewport';
import { hangingObstacleRanges, mullionRanges, rangesOverlap } from '../client/sky/obstacles';
import { ARCADE_THEME } from '../client/environments/ArcadeTheme';

const GLASS = skylineWindowRect();
const METRICS = metricsFor(GLASS.height);
const NIGHT = sunTimesForLocalDay(2026, 1, 15, -420).sunriseMs - 5 * 3_600_000;
const NOON = sunTimesForLocalDay(2026, 7, 4, -360).solarNoonMs;

const OBSTACLES = hangingObstacleRanges(ARCADE_THEME.signs, ARCADE_THEME.props, GLASS);

function geometryWith(partners: readonly SkylinePartner[] = SKYLINE_PARTNERS) {
  return createSkylineGeometry(GLASS.width, GLASS.height, undefined, createPartnerSkylineSource(partners, undefined, { avoid: OBSTACLES, panes: 6 }));
}

function paint(geometry: ReturnType<typeof createSkylineGeometry>, nowMs: number) {
  const pixels = new PixelBuffer(GLASS.width, GLASS.height);
  paintSkyline(pixels, geometry, skyStateFromSnapshot(solarSnapshot(nowMs)), 6);
  return pixels;
}

/** Count lit glyph pixels inside a building's sign panel that stand out from the panel background. */
function glyphPixels(b: SkylineBuilding, pixels: PixelBuffer): number {
  const layout = signLayout(b, buildingTiers(b, GLASS.height, METRICS.windowCell));
  if (!layout || layout.bitmap.length === 0) return 0;
  const panel = pixels.get(layout.x + 1, layout.y + 1);
  let count = 0;
  for (let r = 0; r < layout.bitmap.length; r++) {
    for (let c = 0; c < layout.bitmap[r].length; c++) {
      if (!layout.bitmap[r][c]) continue;
      const [red, green, blue] = pixels.get(layout.x + 2 + c, layout.y + 2 + r);
      const distance = Math.abs(red - panel[0]) + Math.abs(green - panel[1]) + Math.abs(blue - panel[2]);
      if (distance > 60) count++;
    }
  }
  return count;
}

describe('partner metadata', () => {
  it('lists five visible Silicon Slopes companies from public sources', () => {
    expect(SKYLINE_PARTNERS.map(p => p.name).sort()).toEqual(['Domo', 'Entrata', 'Pattern', 'Podium', 'Route']);
    expect(SKYLINE_PARTNERS.every(p => p.featured)).toBe(true);
    expect(new Set(SKYLINE_PARTNERS.map(p => p.id)).size).toBe(5);
    expect(SILICON_SLOPES_SOURCES).toHaveLength(5);
    expect(SILICON_SLOPES_HEADING).toBe('Silicon Slopes companies');
    expect(FEATURED_ANCHORS.length).toBeGreaterThanOrEqual(5);
    expect(QUIET_ANCHORS).toHaveLength(0);
  });

  it('derives signs from featured status: wordmarks for featured, quiet panels otherwise', () => {
    for (const partner of SKYLINE_PARTNERS) {
      const sign = partnerSign(partner);
      if (partner.featured) {
        expect(signKind(sign)).toBe(partner.logo ? 'logo' : 'label');
        expect(sign.font).toBe(partner.logo ? undefined : 'large');
      } else {
        expect(signKind(sign)).toBe('quiet');
        expect(sign.label).toBeUndefined();
        expect(sign.logo).toBeUndefined();
      }
    }
  });

  it('sanitizes partner metadata and drops malformed attachments', () => {
    expect(sanitizePartner({ id: 'yoli', name: '  Yoli ', featured: false, priority: 4 })).toEqual({ id: 'yoli', name: 'Yoli', featured: false, priority: 4 });
    expect(sanitizePartner({ id: 'Bad Id', name: 'x', featured: true, priority: 1 })).toBeNull();
    expect(sanitizePartner({ id: 'ok', name: '', featured: true, priority: 1 })).toBeNull();
    expect(sanitizePartner({ id: 'ok', name: 'x'.repeat(41), featured: true, priority: 1 })).toBeNull();
    expect(sanitizePartner({ id: 'ok', name: 'x', featured: 'yes', priority: 1 })).toBeNull();
    expect(sanitizePartner({ id: 'ok', name: 'x', featured: true, priority: Number.NaN })).toBeNull();
    expect(sanitizePartner(null)).toBeNull();
    expect(sanitizeSign({ quiet: true, font: 'large', color: [1, 2, 3] })).toEqual({ quiet: true, font: 'large', color: [1, 2, 3] });
    expect(sanitizeSign({ font: 'huge' })).toEqual({});
    const [clean] = sanitizeSkyline([{
      x: 10, width: 30, height: 20, roof: 'flat', lit: 0.5, seed: 1, facade: 0.5, windows: 'grid', setback: 0, antenna: false,
      sign: { label: 'PATTERN', font: 'large' }, partner: { id: 'pattern', name: 'Pattern', featured: true, priority: 1 },
    }], 200, { minWidth: 1, maxWidth: 100, minHeight: 1, maxHeight: 100, gap: 1 });
    expect(clean.partner).toEqual({ id: 'pattern', name: 'Pattern', featured: true, priority: 1 });
    expect(clean.sign).toEqual({ label: 'PATTERN', font: 'large' });
  });
});

describe('partner skyline source', () => {
  it('attaches every partner to its own building, wide enough for its wordmark, without overlaps', () => {
    const geometry = geometryWith();
    expect(geometry.buildingSource).toBe('custom');
    const partners = partnerBuildings(geometry.buildings);
    expect(partners.map(b => b.partner!.id).sort()).toEqual(['domo', 'entrata', 'pattern', 'podium', 'route']);
    for (let i = 1; i < geometry.buildings.length; i++) {
      expect(geometry.buildings[i].x).toBeGreaterThanOrEqual(geometry.buildings[i - 1].x + geometry.buildings[i - 1].width);
    }
    for (const b of partners) {
      expect(b.x + b.width).toBeLessThanOrEqual(GLASS.width);
      const layout = signLayout(b, buildingTiers(b, GLASS.height, METRICS.windowCell))!;
      expect(layout).not.toBeNull();
      if (b.partner!.featured) {
        expect(layout.kind).toBe('label');
        expect(layout.rooftop).toBe(false);
        expect(layout.bitmap).toHaveLength(7);
      } else {
        expect(layout.kind).toBe('quiet');
      }
    }
  });

  it('is deterministic and respects priority for anchor placement, not array order', () => {
    const a = geometryWith();
    const b = geometryWith([...SKYLINE_PARTNERS].reverse());
    expect(partnerBuildings(a.buildings)).toEqual(partnerBuildings(b.buildings));
    const byId = Object.fromEntries(partnerBuildings(a.buildings).map(p => [p.partner!.id, p]));
    const center = (p: SkylineBuilding) => p.x + p.width / 2;
    expect(Math.abs(center(byId.pattern) - GLASS.width * FEATURED_ANCHORS[0])).toBeLessThan(GLASS.width * 0.08);
    expect(center(byId.route)).toBeLessThan(center(byId.pattern));
    expect(center(byId.entrata)).toBeGreaterThan(center(byId.pattern));
    const blocked = [...OBSTACLES, ...mullionRanges(GLASS.width, 6)];
    for (const b of partnerBuildings(a.buildings)) {
      for (const range of blocked) expect(rangesOverlap([b.x, b.x + b.width], range)).toBe(false);
    }
  });
});

describe('featured vs hover visibility', () => {
  it('always paints featured wordmarks and never paints quiet partners, by day and by night', () => {
    const geometry = geometryWith();
    for (const nowMs of [NOON, NIGHT]) {
      const pixels = paint(geometry, nowMs);
      for (const b of partnerBuildings(geometry.buildings)) {
        if (b.partner!.featured) expect(glyphPixels(b, pixels)).toBeGreaterThan(20);
        else expect(glyphPixels(b, pixels)).toBe(0);
      }
    }
  });

  it('is controlled by the featured flag alone: the same partner flips between logo and quiet panel', () => {
    const base = SKYLINE_PARTNERS.find(p => p.id === 'pattern')!;
    const featured = geometryWith([{ ...base, featured: true }]);
    const quiet = geometryWith([{ ...base, featured: false }]);
    const fb = partnerBuildings(featured.buildings)[0];
    const qb = partnerBuildings(quiet.buildings)[0];
    expect(isQuietBuilding(fb)).toBe(false);
    expect(isQuietBuilding(qb)).toBe(true);
    expect(glyphPixels(fb, paint(featured, NIGHT))).toBeGreaterThan(20);
    expect(glyphPixels(qb, paint(quiet, NIGHT))).toBe(0);
    // Even a labelled sign goes dark when the partner is not featured.
    const forced: SkylineBuilding = { ...fb, partner: { ...fb.partner!, featured: false } };
    expect(signLayout(forced, buildingTiers(forced, GLASS.height, METRICS.windowCell))!.kind).toBe('quiet');
  });

  it('renders the large wordmark font with 5x7 glyphs', () => {
    const bitmap = textBitmap('DOMO', 'large');
    expect(bitmap).toHaveLength(7);
    expect(bitmap[0]).toHaveLength(4 * 6 - 1);
    expect(textBitmap('PATTERN', 'large')[0].length).toBe(7 * 6 - 1);
  });
});

describe('fallback privacy', () => {
  it('keeps generated buildings free of names, logos and partner metadata without the approved source', () => {
    const plain = resolveSkyline(GLASS.width, undefined, undefined, METRICS.buildings);
    expect(plain.source).toBe('default');
    for (const b of plain.buildings) {
      expect(b.partner).toBeUndefined();
      expect(b.sign?.label).toBeUndefined();
      expect(b.sign?.logo).toBeUndefined();
      expect(['none', 'placeholder']).toContain(signKind(b.sign));
    }
    const names = SKYLINE_PARTNERS.map(p => p.name.toUpperCase());
    const text = JSON.stringify(generateSkyline(GLASS.width, undefined, METRICS.buildings)).toUpperCase();
    for (const name of names) expect(text).not.toContain(name);
    // A source that fails also leaves nothing behind.
    const broken = resolveSkyline(GLASS.width, { buildings: () => { throw new Error('offline'); } }, undefined, METRICS.buildings);
    expect(broken.source).toBe('default');
    expect(partnerBuildings(broken.buildings)).toHaveLength(0);
  });
});

describe('building hit testing', () => {
  const geometry = geometryWith();
  const targets = partnerBuildings(geometry.buildings);

  it('returns the partner building under a world point and null elsewhere', () => {
    for (const b of targets) {
      const rect = buildingWorldRect(b, GLASS);
      expect(rect.y + rect.height).toBe(GLASS.y + GLASS.height);
      expect(hitTestBuilding(targets, GLASS, rect.x + 1, rect.y + 1)).toBe(b);
      expect(hitTestBuilding(targets, GLASS, rect.x + rect.width - 1, rect.y + rect.height - 1)).toBe(b);
      // Just above the roof is sky, not the building.
      expect(hitTestBuilding(targets, GLASS, rect.x + 1, rect.y - 1)).not.toBe(b);
    }
    expect(hitTestBuilding(targets, GLASS, GLASS.x + 1, GLASS.y + 1)).toBeNull();
    expect(hitTestBuilding(targets, GLASS, GLASS.x - 5, GLASS.y + GLASS.height - 1)).toBeNull();
    expect(hitTestBuilding(targets, GLASS, 400, 300)).toBeNull();
  });

  it('ignores non-partner buildings even when the point is inside one', () => {
    const plain = geometry.buildings.find(b => !b.partner)!;
    const rect = buildingWorldRect(plain, GLASS);
    expect(hitTestBuilding(targets, GLASS, rect.x + 1, rect.y + rect.height - 1)).toBeNull();
    expect(hitTestBuilding(geometry.buildings, GLASS, rect.x + 1, rect.y + rect.height - 1)).toBe(plain);
  });
});

describe('tooltip clamping', () => {
  const bounds = { left: 4, top: WALL_BAND.top + HEADER_HEIGHT + 2, right: 796, bottom: 476 };

  it('centres above the target and stays inside the canvas horizontally', () => {
    const mid = placeTooltip({ x: 380, y: 0, width: 40, height: 30 }, 60, 14, bounds);
    expect(mid.x).toBe(370);
    expect(mid.y).toBe(-18);
    expect(mid.below).toBe(false);
    const left = placeTooltip({ x: GLASS.x, y: 0, width: 10, height: 30 }, 60, 14, bounds);
    expect(left.x).toBe(bounds.left);
    expect(left.notchX).toBeGreaterThanOrEqual(left.x + 3);
    const right = placeTooltip({ x: 780, y: 0, width: 16, height: 30 }, 60, 14, bounds);
    expect(right.x + right.width).toBe(bounds.right);
    expect(right.notchX).toBeLessThanOrEqual(right.x + right.width - 3);
  });

  it('never covers the header band: a tall target pushes the tooltip below itself', () => {
    const tall = placeTooltip({ x: 300, y: GLASS.y, width: 40, height: 20 }, 60, 14, bounds);
    expect(tall.y).toBeGreaterThanOrEqual(bounds.top);
    expect(tall.below).toBe(true);
    expect(tall.y).toBe(GLASS.y + 20 + 4);
    // Every partner building's tooltip lands inside the bounds.
    for (const b of partnerBuildings(geometryWith().buildings)) {
      const place = placeTooltip(buildingWorldRect(b, GLASS), 80, 14, bounds);
      expect(place.x).toBeGreaterThanOrEqual(bounds.left);
      expect(place.x + place.width).toBeLessThanOrEqual(bounds.right);
      expect(place.y).toBeGreaterThanOrEqual(bounds.top);
      expect(place.y + place.height).toBeLessThanOrEqual(bounds.bottom);
    }
  });
});

describe('responsive coordinate mapping', () => {
  const view = { width: 800, height: VIEW_HEIGHT, top: WALL_BAND.top };

  it('maps world points to CSS pixels and back at different canvas scales and offsets', () => {
    const canvases = [
      { left: 0, top: 0, width: 800, height: VIEW_HEIGHT },
      { left: 135.78, top: 0, width: 1418.44, height: 1000 },
      { left: 20, top: 60, width: 400, height: VIEW_HEIGHT / 2 },
    ];
    for (const canvas of canvases) {
      const scale = canvas.width / 800;
      const origin = worldToScreen({ x: 0, y: WALL_BAND.top }, canvas, view);
      expect(origin).toEqual({ x: canvas.left, y: canvas.top });
      const corner = worldToScreen({ x: 800, y: WALL_BAND.top + VIEW_HEIGHT }, canvas, view);
      expect(corner.x).toBeCloseTo(canvas.left + canvas.width, 2);
      expect(corner.y).toBeCloseTo(canvas.top + canvas.height, 2);
      const world = { x: 123.4, y: 56.7 };
      const back = screenToWorld(worldToScreen(world, canvas, view), canvas, view);
      expect(back.x).toBeCloseTo(world.x, 6);
      expect(back.y).toBeCloseTo(world.y, 6);
      const rect = worldRectToScreen({ x: 16, y: -66, width: 768, height: 106 }, canvas, view);
      expect(rect.width).toBeCloseTo(768 * scale, 2);
      expect(rect.height).toBeCloseTo(106 * scale, 2);
    }
  });

  it('keeps focus targets aligned with the hit test after scaling', () => {
    const canvas = { left: 135.78, top: 0, width: 1418.44, height: 1000 };
    const geometry = geometryWith();
    for (const b of partnerBuildings(geometry.buildings)) {
      const rect = buildingWorldRect(b, GLASS);
      const screen = worldRectToScreen(rect, canvas, view);
      const centre = screenToWorld({ x: screen.left + screen.width / 2, y: screen.top + screen.height / 2 }, canvas, view);
      expect(hitTestBuilding(partnerBuildings(geometry.buildings), GLASS, centre.x, centre.y)).toBe(b);
    }
  });
});
