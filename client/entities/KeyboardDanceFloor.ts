import Phaser from 'phaser';

type FloorPoint = { x: number; y: number };

const COLORS = [0xff3b6b, 0xffa62b, 0xffe156, 0x5cff8d, 0x35c9ff, 0x7667ff, 0xd95cff];
const FLOOR_SCALE = 0.75;
const FLOOR_CENTER = { x: 678, y: 424 };

export class KeyboardDanceFloor {
  private keys: Array<{
    tile: Phaser.GameObjects.Rectangle;
    x: number;
    y: number;
    intensity: number;
    color: number;
  }> = [];

  constructor(scene: Phaser.Scene) {
    const rows = [
      { y: 394, start: 574, widths: Array(10).fill(15) as number[] },
      { y: 414, start: 582, widths: [...Array(9).fill(15), 28] as number[] },
      { y: 434, start: 574, widths: [25, ...Array(7).fill(15), 25] as number[] },
      { y: 454, start: 610, widths: [20, 86, 20] as number[] },
    ];

    rows.forEach((row, rowIndex) => {
      let cursor = row.start;
      row.widths.forEach((width, column) => {
        const baseX = cursor + width / 2;
        const x = FLOOR_CENTER.x + (baseX - FLOOR_CENTER.x) * FLOOR_SCALE;
        const y = FLOOR_CENTER.y + (row.y - FLOOR_CENTER.y) * FLOOR_SCALE;
        const color = COLORS[(rowIndex * 3 + column) % COLORS.length];
        const tile = scene.add.rectangle(x, y, width * FLOOR_SCALE, 15 * FLOOR_SCALE, 0x39335f, 0.9).setDepth(1.1);
        this.keys.push({ tile, x, y, intensity: 0, color });
        cursor += width + 4;
      });
    });
  }

  update(points: FloorPoint[], delta: number): void {
    for (const key of this.keys) {
      const pressed = points.some(point =>
        Math.abs(point.x - key.x) <= key.tile.width / 2 + 1
        && Math.abs(point.y - key.y) <= key.tile.height / 2 + 1,
      );
      key.intensity = pressed ? 1 : Math.max(0, key.intensity - delta / 420);
      if (key.intensity > 0) {
        key.tile.setFillStyle(key.color, 0.32 + key.intensity * 0.68);
      } else {
        key.tile.setFillStyle(0x39335f, 0.9);
      }
    }
  }
}
