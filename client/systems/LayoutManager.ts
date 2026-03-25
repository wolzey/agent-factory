export interface Position {
  x: number;
  y: number;
}

interface Slot {
  pos: Position;
  occupant: string | null;
}

/** Manages spatial assignment of agents to arcade cabinets and lounge seats */
export class LayoutManager {
  private arcadeSlots: Slot[] = [];
  private loungeSlots: Slot[] = [];
  private entrancePos: Position = { x: 400, y: 440 };

  constructor() {
    // Arcade cabinet positions (2 rows of 6)
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 6; col++) {
        this.arcadeSlots.push({
          pos: { x: 80 + col * 110, y: 120 + row * 100 },
          occupant: null,
        });
      }
    }

    // Lounge area positions (bottom area)
    for (let i = 0; i < 8; i++) {
      this.loungeSlots.push({
        pos: { x: 80 + i * 90, y: 380 },
        occupant: null,
      });
    }
  }

  get entrance(): Position {
    return { ...this.entrancePos };
  }

  assignToArcade(sessionId: string): Position {
    // Check if already assigned
    const existing = this.arcadeSlots.find(s => s.occupant === sessionId);
    if (existing) return { ...existing.pos };

    // Find empty slot
    const empty = this.arcadeSlots.find(s => s.occupant === null);
    if (empty) {
      empty.occupant = sessionId;
      return { ...empty.pos };
    }

    // Overflow: create a dynamic position
    const idx = this.arcadeSlots.length;
    const row = Math.floor(idx / 6);
    const col = idx % 6;
    const slot: Slot = {
      pos: { x: 80 + col * 110, y: 120 + row * 100 },
      occupant: sessionId,
    };
    this.arcadeSlots.push(slot);
    return { ...slot.pos };
  }

  assignToLounge(sessionId: string): Position {
    // Check if already assigned
    const existing = this.loungeSlots.find(s => s.occupant === sessionId);
    if (existing) return { ...existing.pos };

    // Find empty slot
    const empty = this.loungeSlots.find(s => s.occupant === null);
    if (empty) {
      empty.occupant = sessionId;
      return { ...empty.pos };
    }

    // Overflow
    const idx = this.loungeSlots.length;
    const slot: Slot = {
      pos: { x: 80 + (idx % 8) * 90, y: 380 + Math.floor(idx / 8) * 30 },
      occupant: sessionId,
    };
    this.loungeSlots.push(slot);
    return { ...slot.pos };
  }

  release(sessionId: string) {
    for (const slot of this.arcadeSlots) {
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
