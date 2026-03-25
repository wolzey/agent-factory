export interface Position {
  x: number;
  y: number;
}

interface Slot {
  pos: Position;
  occupant: string | null;
}

/**
 * Layout zones:
 *   Wall/header:    y 0-44
 *   Arcade floor:   y 55-330  (2 rows of 6 cabinets)
 *   Bottom strip:   y 340-470 (counter LEFT, lounge RIGHT, side by side)
 *   Entrance:       y 470     (center bottom)
 */
export class LayoutManager {
  private arcadeSlots: Slot[] = [];
  private counterSlots: Slot[] = [];
  private loungeSlots: Slot[] = [];
  private entrancePos: Position = { x: 400, y: 470 };

  constructor() {
    // Arcade cabinet positions (2 rows of 6)
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 6; col++) {
        this.arcadeSlots.push({
          pos: { x: 80 + col * 120, y: 110 + row * 110 },
          occupant: null,
        });
      }
    }

    // Front counter positions (LEFT side of bottom strip, y ~380)
    for (let i = 0; i < 4; i++) {
      this.counterSlots.push({
        pos: { x: 60 + i * 90, y: 390 },
        occupant: null,
      });
    }

    // Lounge positions - on the couches (matching prop positions in FactoryScene)
    // Couch 1 at x=560, couch 2 at x=700 (both at y=430 in scene)
    // 2 seats per couch, agents sit slightly above couch center
    const couchPositions = [
      { x: 540, y: 420 }, { x: 580, y: 420 },  // couch 1
      { x: 680, y: 420 }, { x: 720, y: 420 },  // couch 2
    ];
    for (const pos of couchPositions) {
      this.loungeSlots.push({ pos, occupant: null });
    }
  }

  get entrance(): Position {
    return { ...this.entrancePos };
  }

  assignToArcade(sessionId: string): Position {
    const existing = this.arcadeSlots.find(s => s.occupant === sessionId);
    if (existing) return { ...existing.pos };

    const empty = this.arcadeSlots.find(s => s.occupant === null);
    if (empty) {
      empty.occupant = sessionId;
      return { ...empty.pos };
    }

    const idx = this.arcadeSlots.length;
    const row = Math.floor(idx / 6);
    const col = idx % 6;
    const slot: Slot = {
      pos: { x: 80 + col * 120, y: 110 + row * 110 },
      occupant: sessionId,
    };
    this.arcadeSlots.push(slot);
    return { ...slot.pos };
  }

  assignToCounter(sessionId: string): Position {
    const existing = this.counterSlots.find(s => s.occupant === sessionId);
    if (existing) return { ...existing.pos };

    const empty = this.counterSlots.find(s => s.occupant === null);
    if (empty) {
      empty.occupant = sessionId;
      return { ...empty.pos };
    }

    const idx = this.counterSlots.length;
    const slot: Slot = {
      pos: { x: 60 + (idx % 4) * 90, y: 390 + Math.floor(idx / 4) * 30 },
      occupant: sessionId,
    };
    this.counterSlots.push(slot);
    return { ...slot.pos };
  }

  assignToLounge(sessionId: string): Position {
    const existing = this.loungeSlots.find(s => s.occupant === sessionId);
    if (existing) return { ...existing.pos };

    const empty = this.loungeSlots.find(s => s.occupant === null);
    if (empty) {
      empty.occupant = sessionId;
      return { ...empty.pos };
    }

    const idx = this.loungeSlots.length;
    const slot: Slot = {
      pos: { x: 440 + (idx % 4) * 70, y: 400 + Math.floor(idx / 4) * 30 },
      occupant: sessionId,
    };
    this.loungeSlots.push(slot);
    return { ...slot.pos };
  }

  release(sessionId: string) {
    for (const slot of this.arcadeSlots) {
      if (slot.occupant === sessionId) slot.occupant = null;
    }
    for (const slot of this.counterSlots) {
      if (slot.occupant === sessionId) slot.occupant = null;
    }
    for (const slot of this.loungeSlots) {
      if (slot.occupant === sessionId) slot.occupant = null;
    }
  }

  getArcadeSlotFor(sessionId: string): Slot | undefined {
    return this.arcadeSlots.find(s => s.occupant === sessionId);
  }
}
