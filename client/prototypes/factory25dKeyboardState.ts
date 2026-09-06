export interface FloorPoint { x: number; z: number }
export interface FloorKey extends FloorPoint { label: string; width: number; depth: number; color: number }
export const KEYBOARD_ORIGIN = { x: 5.88, z: 7.2 };
export const KEYBOARD_WIDTH = 2.78;
export const KEYBOARD_DEPTH = 1.48;
export const FLOOR_Y = 0.018;
export const RUG_TOP = FLOOR_Y + 0.018;
export const KEY_TOP = FLOOR_Y + 0.023;
export const KEY_TRAVEL = 0.003;
const colors = [0xff547d, 0xffb45c, 0xffe783, 0x78e5ae, 0x65d9f1, 0xa39aff, 0xe68fea];
// A compact 60% layout: complete number row, punctuation and modifier keys.
const rows = [
  { widths: [...Array(13).fill(1), 2], labels: ['esc', ...'1 2 3 4 5 6 7 8 9 0 - ='.split(' '), 'back'] },
  { widths: [1.5, ...Array(12).fill(1), 1.5], labels: ['tab', ...'Q W E R T Y U I O P [ ]'.split(' '), '\\'] },
  { widths: [1.75, ...Array(11).fill(1), 2.25], labels: ['caps', ..."A S D F G H J K L ; '".split(' '), 'enter'] },
  { widths: [2.25, ...Array(10).fill(1), 2.75], labels: ['shift', ...'Z X C V B N M , . /'.split(' '), 'shift'] },
  { widths: [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25], labels: ['ctrl', 'win', 'alt', 'space', 'alt', 'fn', 'menu', 'ctrl'] },
];
const unit = KEYBOARD_WIDTH / 15;
const depthUnit = KEYBOARD_DEPTH / 5;
export const FLOOR_KEYS: FloorKey[] = rows.flatMap((row, r) => {
  let cursor = 0;
  return row.widths.map((width, column) => {
    const key = { label: row.labels[column], x: (cursor + width / 2 - 7.5) * unit,
      z: (r + 0.5 - 2.5) * depthUnit, width: width * unit - 0.032, depth: depthUnit - 0.04,
      color: colors[(r * 3 + column) % colors.length] };
    cursor += width;
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
