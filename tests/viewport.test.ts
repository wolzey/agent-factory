import { describe, expect, it } from 'vitest';
import type { EnvironmentType } from '../shared/types';
import { WORLD_LAYOUTS } from '../shared/world-layouts';
import { CONTROL_WORLD_BOUNDS } from '../shared/constants';
import { MACHINE_BASE_OFFSET, MACHINE_HALF_HEIGHT } from '../client/systems/depth';
import { HEADER_HEIGHT, VIEW_HEIGHT, VIEW_TOP, WALL_BAND, WALL_HEADROOM, WORLD_HEIGHT, skylineWindowRect, titleHeaderPosition } from '../client/scenes/viewport';

const ENVIRONMENTS: EnvironmentType[] = ['arcade', 'farm', 'office', 'mining'];

describe('viewport headroom', () => {
  it('adds the headroom above the untouched 800x480 room', () => {
    expect(WORLD_HEIGHT).toBe(480);
    expect(VIEW_HEIGHT).toBe(WORLD_HEIGHT + WALL_HEADROOM);
    expect(VIEW_TOP).toBe(-WALL_HEADROOM);
    expect(WALL_BAND.top).toBe(VIEW_TOP);
    expect(WALL_BAND.bottom).toBe(44);
  });

  it('keeps the whole wall band above every control bound and workstation', () => {
    expect(WALL_BAND.bottom).toBeLessThan(CONTROL_WORLD_BOUNDS.minY);
    for (const environment of ENVIRONMENTS) {
      for (const slot of WORLD_LAYOUTS[environment].workSlots) {
        // Cabinets are placed 24px above the slot and are 48px tall, so this is the marquee top.
        const cabinetTop = slot.y - MACHINE_BASE_OFFSET - MACHINE_HALF_HEIGHT;
        expect(cabinetTop).toBeGreaterThan(WALL_BAND.bottom);
      }
    }
  });
});

describe('skyline window rect', () => {
  const rect = skylineWindowRect();

  it('sits fully inside the wall band with frame room on every side', () => {
    expect(rect.y).toBeGreaterThan(WALL_BAND.top);
    expect(rect.y + rect.height).toBeLessThan(WALL_BAND.bottom);
    expect(rect.x).toBeGreaterThan(0);
    expect(rect.x + rect.width).toBeLessThan(800);
  });

  it('leaves the header band clear above the glass and centres the title in it', () => {
    const title = titleHeaderPosition();
    expect(title.x).toBe(400);
    expect(title.y).toBeGreaterThan(WALL_BAND.top);
    expect(title.y + 6).toBeLessThanOrEqual(rect.y);
    expect(rect.y).toBeGreaterThanOrEqual(WALL_BAND.top + HEADER_HEIGHT);
  });

  it('is a prominent window: 18 to 22 percent of the visible canvas height', () => {
    const share = rect.height / VIEW_HEIGHT;
    expect(share).toBeGreaterThanOrEqual(0.18);
    expect(share).toBeLessThanOrEqual(0.22);
    expect(rect.height).toBeGreaterThanOrEqual(96);
  });
});
