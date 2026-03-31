import type { LayoutSpec, Position, Zone } from '../environments';

interface Slot {
  pos: Position;
  occupant: string | null;
}

export class LayoutManager {
  private workSlots: Slot[] = [];
  private waitingSlots: Slot[] = [];
  private idleSlots: Slot[] = [];
  private entrancePos: Position;

  constructor(layout: LayoutSpec) {
    this.entrancePos = { ...layout.entrance };
    this.workSlots = layout.workSlots.map(pos => ({ pos: { ...pos }, occupant: null }));
    this.waitingSlots = layout.waitingSlots.map(pos => ({ pos: { ...pos }, occupant: null }));
    this.idleSlots = layout.idleSlots.map(pos => ({ pos: { ...pos }, occupant: null }));
  }

  get entrance(): Position {
    return { ...this.entrancePos };
  }

  assignToWork(sessionId: string): Position {
    return this.assignToZone(sessionId, 'work');
  }

  assignToWaiting(sessionId: string): Position {
    return this.assignToZone(sessionId, 'waiting');
  }

  assignToIdle(sessionId: string): Position {
    return this.assignToZone(sessionId, 'idle');
  }

  private assignToZone(sessionId: string, zone: Zone): Position {
    const slots = this.slotsFor(zone);

    const existing = slots.find(s => s.occupant === sessionId);
    if (existing) return { ...existing.pos };

    this.clearFromOtherZones(sessionId, zone);

    const empty = slots.find(s => s.occupant === null);
    if (empty) {
      empty.occupant = sessionId;
      return { ...empty.pos };
    }

    const idx = slots.length;
    const slot: Slot = {
      pos: this.overflowPos(zone, idx),
      occupant: sessionId,
    };
    slots.push(slot);
    return { ...slot.pos };
  }

  private clearFromOtherZones(sessionId: string, keep: Zone) {
    if (keep !== 'work') {
      for (const slot of this.workSlots) {
        if (slot.occupant === sessionId) slot.occupant = null;
      }
    }
    if (keep !== 'waiting') {
      for (const slot of this.waitingSlots) {
        if (slot.occupant === sessionId) slot.occupant = null;
      }
    }
    if (keep !== 'idle') {
      for (const slot of this.idleSlots) {
        if (slot.occupant === sessionId) slot.occupant = null;
      }
    }
  }

  private overflowPos(zone: Zone, idx: number): Position {
    const slots = this.slotsFor(zone);
    const base = slots[0]?.pos ?? this.defaultBase(zone);

    if (zone === 'work') {
      const stepX = slots[1] ? slots[1].pos.x - slots[0].pos.x : 110;
      const stepY = slots[6] ? slots[6].pos.y - slots[0].pos.y : 95;
      return {
        x: base.x + (idx % 6) * stepX,
        y: base.y + Math.floor(idx / 6) * stepY,
      };
    }

    if (zone === 'waiting') {
      const stepX = slots[1] ? slots[1].pos.x - slots[0].pos.x : 90;
      return {
        x: base.x + (idx % 4) * stepX,
        y: base.y + Math.floor(idx / 4) * 30,
      };
    }

    const stepX = slots[1] ? slots[1].pos.x - slots[0].pos.x : 70;
    return {
      x: base.x + (idx % 4) * stepX,
      y: base.y + Math.floor(idx / 4) * 30,
    };
  }

  private defaultBase(zone: Zone): Position {
    if (zone === 'work') return { x: 80, y: 110 };
    if (zone === 'waiting') return { x: 60, y: 390 };
    return { x: 550, y: 424 };
  }

  private slotsFor(zone: Zone): Slot[] {
    if (zone === 'work') return this.workSlots;
    if (zone === 'waiting') return this.waitingSlots;
    return this.idleSlots;
  }

  release(sessionId: string) {
    for (const slot of this.workSlots) {
      if (slot.occupant === sessionId) slot.occupant = null;
    }
    for (const slot of this.waitingSlots) {
      if (slot.occupant === sessionId) slot.occupant = null;
    }
    for (const slot of this.idleSlots) {
      if (slot.occupant === sessionId) slot.occupant = null;
    }
  }

  getWorkSlotFor(sessionId: string): Slot | undefined {
    return this.workSlots.find(s => s.occupant === sessionId);
  }

  reserveForTombstone(sessionId: string) {
    const tombId = `__tomb__${sessionId}`;
    const slot = this.workSlots.find(s => s.occupant === sessionId);
    if (slot) slot.occupant = tombId;
  }

  releaseTombstone(sessionId: string) {
    const tombId = `__tomb__${sessionId}`;
    for (const slot of this.workSlots) {
      if (slot.occupant === tombId) slot.occupant = null;
    }
  }

  claimTombstoneSlot(sessionId: string): Position | null {
    const tombId = `__tomb__${sessionId}`;
    const slot = this.workSlots.find(s => s.occupant === tombId);
    if (slot) {
      slot.occupant = sessionId;
      return { ...slot.pos };
    }
    return null;
  }

  getTombstoneSlot(sessionId: string): Slot | undefined {
    const tombId = `__tomb__${sessionId}`;
    return this.workSlots.find(s => s.occupant === tombId);
  }
}
