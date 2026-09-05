export interface FloorPoint { x: number; z: number }
export interface FloorKey extends FloorPoint { label: string; width: number; depth: number; color: number }
export const KEYBOARD_ORIGIN = { x: 5.65, z: 7.55 };
export const KEYBOARD_WIDTH = 3.35;
export const KEYBOARD_DEPTH = 1.22;
export const FLOOR_Y = 0.018;
export const RUG_TOP = FLOOR_Y + 0.018;
export const KEY_TOP = FLOOR_Y + 0.023;
export const KEY_TRAVEL = 0.003;
const unit = KEYBOARD_WIDTH / 208;
const depthUnit = KEYBOARD_DEPTH / 76;
const colors = [0xff547d, 0xffb45c, 0xffe783, 0x78e5ae, 0x65d9f1, 0xa39aff, 0xe68fea];
const rows = [
  { z: 0, start: 8, widths: Array(10).fill(15) as number[], labels: 'Q W E R T Y U I O P'.split(' ') },
  { z: 20, start: 4, widths: [...Array(9).fill(15), 28] as number[], labels: 'A S D F G H J K L enter'.split(' ') },
  { z: 40, start: 8, widths: [25, ...Array(7).fill(15), 25] as number[], labels: 'shift Z X C V B N M shift'.split(' ') },
  { z: 60, start: 37, widths: [20, 86, 20], labels: ['ctrl', 'space', 'alt'] },
];
export const FLOOR_KEYS: FloorKey[] = rows.flatMap((row, r) => {
  let cursor = row.start;
  return row.widths.map((width, column) => {
    const key = { label: row.labels[column], x: (cursor + width / 2 - 104) * unit,
      z: (row.z + 7.5 - 38) * depthUnit, width: width * unit, depth: 15 * depthUnit,
      color: colors[(r * 3 + column) % colors.length] };
    cursor += width + 4;
    return key;
  });
});

export function keyAt(point: FloorPoint): number {
  return FLOOR_KEYS.findIndex(key => Math.abs(point.x - key.x) <= key.width / 2 && Math.abs(point.z - key.z) <= key.depth / 2);
}
export function keyIntensity(previous: number, occupied: boolean, dt: number): number {
  return occupied ? 1 : Math.max(0, previous - Math.max(0, dt) / 0.42);
}
export function stepToward(position: FloorPoint, target: FloorPoint, distance: number): FloorPoint {
  const dx = target.x - position.x; const dz = target.z - position.z;
  const length = Math.hypot(dx, dz);
  if (length <= Math.max(0, distance)) return { ...target };
  const step = Math.max(0, distance) / length;
  return { x: position.x + dx * step, z: position.z + dz * step };
}
