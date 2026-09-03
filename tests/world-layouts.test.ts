import { describe, expect, it } from 'vitest';
import {
  ARCADE_PLANT_OBSTACLES,
  ARCADE_WINDOW_LOOKOUTS,
  arcadePlantWaypoints,
  arcadeWindowWaypoints,
  movementHeadingAt,
  nearestWorkstationSlot,
  WORLD_LAYOUTS,
  positionAt,
  segmentCrossesObstacle,
  slotPosition,
  workstationWaypoints,
  zoneForActivity,
} from '../shared/world-layouts.js';
import type { EnvironmentType } from '../shared/types';

describe('shared world layouts', () => {
  it('maps activities to authoritative zones', () => {
    expect(zoneForActivity('reading')).toBe('work');
    expect(zoneForActivity('waiting')).toBe('waiting');
    expect(zoneForActivity('idle')).toBe('idle');
    expect(zoneForActivity('stopped')).toBe('idle');
  });

  it('places window visitors against the glass with their feet below the sill', () => {
    expect(ARCADE_WINDOW_LOOKOUTS.every(point => point.y === 38)).toBe(true);
  });

  it('uses environment-specific slot coordinates', () => {
    expect(slotPosition('arcade', 'work', 0)).toEqual({ x: 80, y: 164 });
    expect(slotPosition('mining', 'work', 0)).toEqual({ x: 90, y: 144 });
    expect(slotPosition('arcade', 'idle', 4)).toEqual({ x: 560, y: 382 });
  });

  it('recognizes intentional workstation drops without snapping distant floor drops', () => {
    expect(nearestWorkstationSlot('arcade', { x: 92, y: 166 })).toBe(0);
    expect(nearestWorkstationSlot('arcade', { x: 208, y: 274 })).toBe(7);
    expect(nearestWorkstationSlot('arcade', { x: 400, y: 390 })).toBeUndefined();
  });

  it('keeps both workstation rows aligned, evenly spaced and clear of the room boundaries', () => {
    const environments: EnvironmentType[] = ['arcade', 'farm', 'office', 'mining'];
    for (const environment of environments) {
      const slots = WORLD_LAYOUTS[environment].workSlots;
      const topRow = slots.slice(0, 6);
      const bottomRow = slots.slice(6);
      expect(new Set(topRow.map(s => s.y)).size).toBe(1);
      expect(new Set(bottomRow.map(s => s.y)).size).toBe(1);
      const rowGap = bottomRow[0].y - topRow[0].y;
      expect(rowGap).toBeGreaterThanOrEqual(95);
      // Cabinet marquee (slot - 48) clears the wall neon strip; lower-row feet (slot + 24 + 14) clear the counter divider at y 340.
      expect(topRow[0].y - 48).toBeGreaterThan(49);
      expect(bottomRow[0].y + 24 + 14).toBeLessThan(340);
      // Machines and agents move together: the stance is always exactly 24px below the slot.
      slots.forEach((slot, index) => expect(slotPosition(environment, 'work', index)).toEqual({ x: slot.x, y: slot.y + 24 }));
    }
    const standard = WORLD_LAYOUTS.arcade.workSlots;
    expect(standard[0].y).toBe(140);
    expect(standard[6].y).toBe(250);
    // Six evenly spaced columns centred on x = 400 with equal cabinet-edge margins (cabinets are 48px wide).
    const columns = standard.slice(0, 6).map(s => s.x);
    expect(columns).toEqual([80, 208, 336, 464, 592, 720]);
    const pitches = columns.slice(1).map((x, i) => x - columns[i]);
    expect(new Set(pitches).size).toBe(1);
    expect((columns[0] + columns[5]) / 2).toBe(400);
    const leftMargin = columns[0] - 24;
    const rightMargin = 800 - (columns[5] + 24);
    expect(leftMargin).toBe(rightMargin);
    expect(standard.slice(6).map(s => s.x)).toEqual(columns);
    for (const environment of ['farm', 'office'] as EnvironmentType[]) {
      expect(WORLD_LAYOUTS[environment].workSlots).toEqual(standard);
    }
    // Mining keeps its own grid.
    expect(WORLD_LAYOUTS.mining.workSlots[0]).toEqual({ x: 90, y: 120 });
    // The routing aisle sits below the lower row's stance and above the counter divider.
    const aisle = workstationWaypoints('arcade', { x: 80, y: 164 }, { x: 208, y: 274 }, 'work', 'work', 0, 7);
    const aisleY = aisle.find(p => p.y !== 164 && p.y !== 274)!.y;
    expect(aisleY).toBe(316);
    expect(aisleY).toBeGreaterThan(274 + 14);
    expect(aisleY).toBeLessThan(340);
  });

  it('routes every column through an aisle between cabinets, clear of the wall planters', () => {
    const slots = WORLD_LAYOUTS.arcade.workSlots;
    slots.slice(0, 6).forEach((slot, index) => {
      const stance = slotPosition('arcade', 'work', index);
      const route = workstationWaypoints('arcade', { x: 400, y: 470 }, stance, 'entrance', 'work', undefined, index);
      const aisleX = route.find(point => point.y === 316)!.x;
      // Never inside a cabinet footprint (24px half width) and never under the planters at x >= 762.
      for (const other of slots.slice(0, 6)) expect(Math.abs(aisleX - other.x)).toBeGreaterThanOrEqual(24 + 8);
      expect(aisleX + 8).toBeLessThanOrEqual(762);
      expect(aisleX - 8).toBeGreaterThanOrEqual(30);
    });
    // The last column has no room on its right, so it uses the aisle on its left.
    const last = workstationWaypoints('arcade', { x: 400, y: 470 }, slotPosition('arcade', 'work', 5), 'entrance', 'work', undefined, 5);
    expect(last.find(point => point.y === 316)!.x).toBe(720 - 42);
    // Mining still has room on the right of its last column and keeps using it.
    const [mining] = workstationWaypoints('mining', { x: 400, y: 470 }, slotPosition('mining', 'work', 5), 'entrance', 'work', undefined, 5);
    expect(mining.x).toBe(640 + 42);
  });

  it('routes arbitrary drops through clear cabinet aisles before returning', () => {
    const backToWork = workstationWaypoints(
      'arcade', { x: 340, y: 100 }, slotPosition('arcade', 'work', 1), 'manual', 'work', undefined, 1,
    );
    expect(backToWork).toEqual([
      { x: 378, y: 100 },
      { x: 378, y: 316 },
      { x: 250, y: 316 },
      { x: 250, y: 164 },
    ]);

    const backToLounge = workstationWaypoints(
      'arcade', { x: 340, y: 100 }, { x: 550, y: 424 }, 'manual', 'idle', undefined, 0,
    );
    expect(backToLounge).toEqual([
      { x: 378, y: 100 },
      { x: 378, y: 316 },
      { x: 540, y: 332 },
      { x: 540, y: 352 },
    ]);
  });

  it('routes window visitors through a cabinet gap instead of through a machine', () => {
    const route = arcadeWindowWaypoints({ x: 550, y: 424 }, { x: 272, y: 38 });
    const climb = route.find(point => point.y === 38 && point.x !== 272);
    expect(climb).toBeDefined();
    for (const slot of WORLD_LAYOUTS.arcade.workSlots.slice(0, 6)) {
      expect(Math.abs(climb!.x - slot.x)).toBeGreaterThanOrEqual(32);
    }
  });

  it('routes lower-room traffic through the counter and lounge doors', () => {
    const fromEntrance = workstationWaypoints('arcade', { x: 400, y: 470 }, { x: 80, y: 164 }, 'entrance', 'work', undefined, 0);
    expect(fromEntrance.slice(0, 3)).toEqual([
      { x: 330, y: 470 },
      { x: 330, y: 352 },
      { x: 330, y: 332 },
    ]);
    const intoLounge = workstationWaypoints('arcade', { x: 80, y: 164 }, { x: 466, y: 382 }, 'work', 'idle', 0, 0);
    expect(intoLounge.slice(-3)).toEqual([
      { x: 540, y: 332 },
      { x: 540, y: 352 },
      { x: 540, y: 382 },
    ]);
  });

  it('routes lounge walks around the visible floor plants', () => {
    const from = { x: 704, y: 434 };
    const to = { x: 440, y: 382 };
    const route = [from, ...arcadePlantWaypoints(from, [], to), to];
    expect(route.length).toBeGreaterThan(2);
    for (let index = 1; index < route.length; index++) {
      for (const obstacle of ARCADE_PLANT_OBSTACLES) {
        expect(segmentCrossesObstacle(route[index - 1], route[index], obstacle)).toBe(false);
      }
    }
  });

  it('interpolates timestamped movement without client frame history', () => {
    const movement = {
      from: { x: 0, y: 10 },
      to: { x: 100, y: 30 },
      startedAt: 1_000,
      arrivesAt: 2_000,
    };
    expect(positionAt(movement, 500)).toEqual({ x: 0, y: 10 });
    expect(positionAt(movement, 1_500)).toEqual({ x: 50, y: 20 });
    expect(positionAt(movement, 2_500)).toEqual({ x: 100, y: 30 });
  });

  it('uses the active path segment for directional walking animations', () => {
    const movement = {
      from: { x: 0, y: 0 },
      to: { x: 100, y: 0 },
      waypoints: [{ x: 0, y: 100 }, { x: 100, y: 100 }],
      startedAt: 0,
      arrivesAt: 300,
    };
    expect(movementHeadingAt(movement, 50)).toEqual({ x: 0, y: 100 });
    expect(movementHeadingAt(movement, 150)).toEqual({ x: 100, y: 0 });
    expect(movementHeadingAt(movement, 250)).toEqual({ x: 0, y: -100 });
  });
});
