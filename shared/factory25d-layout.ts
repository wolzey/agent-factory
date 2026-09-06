import type { Position } from './types.js';
import { PATIO_OBSTACLES } from './factory25d-patio.js';
export const INDOOR_COLUMNS = [-5.5, -3.3, -1.1, 1.1, 3.3, 5.5];
export const INDOOR_ROWS = [-3.8, 0.33];
export const INTERIOR_Z = 1.95;
export type Workstation = { id: string; room: 'factory' | 'patio'; x: number; z: number; label: string };
export const INDOOR_STATIONS: Workstation[] = INDOOR_ROWS.flatMap((z, row) =>
  INDOOR_COLUMNS.map((x, column) => ({ id: `inside-${row * 6 + column}`, room: 'factory', x, z: z + INTERIOR_Z, label: 'arcade station' })),
);
export const PATIO_STATIONS: Workstation[] = [
  { id: 'patio-0', room: 'patio', x: 11, z: -1.2, label: 'railing desk' },
  { id: 'patio-1', room: 'patio', x: 16, z: -1.2, label: 'railing desk' },
  { id: 'patio-2', room: 'patio', x: 21, z: -1.2, label: 'railing desk' },
  { id: 'patio-3', room: 'patio', x: 12.3, z: 3.8, label: 'picnic worktable' },
  { id: 'patio-4', room: 'patio', x: 15, z: 3.8, label: 'picnic worktable' },
  { id: 'patio-5', room: 'patio', x: 20, z: 4.5, label: 'solar console' },
];
// Stable shared slot IDs alternate two indoor stations and one patio station.
export const WORKSTATIONS: Workstation[] = PATIO_STATIONS.flatMap((station, i) => [
  ...INDOOR_STATIONS.slice(i * 2, i * 2 + 2), station,
]);
/** Canonical server coordinates for the two rooms; 40 units equal one scene metre. */
export function toFactoryWorld(point: { x: number; z: number }): Position {
  return { x: (point.x + 8) * 40, y: (point.z + 4.5) * 40 };
}
export function fromFactoryWorld(point: Position) {
  return { x: point.x / 40 - 8, z: point.y / 40 - 4.5 };
}
export const FACTORY25D_BOUNDS = { minX: 8, maxX: 1272, minY: 8, maxY: 728 };
export function factory25dWaypoints(from: Position, to: Position): Position[] {
  return routeToStation(fromFactoryWorld(from), fromFactoryWorld(to)).slice(0, -1).map(toFactoryWorld);
}

export type RoomPoint = { x: number; z: number };
type Obstacle = { left: number; right: number; near: number; far: number };
const margin = 0.12;
export const FACTORY_OBSTACLES: Obstacle[] = [
  ...PATIO_OBSTACLES,
  ...WORKSTATIONS.map(station => ({ left: station.x - (station.room === 'patio' ? 0.77 : 0.36), right: station.x + (station.room === 'patio' ? 0.77 : 0.36), near: station.z - 0.3, far: station.z + 0.32 })),
  { left: 7.88, right: 8.01, near: -4.7, far: -3.25 },
  { left: 7.88, right: 8.01, near: -1.75, far: 14.1 },
  { left: -7.88, right: -7.6, near: 5.46, far: 5.62 },
  { left: -6.2, right: 5.8, near: 5.46, far: 5.62 },
  { left: 7.2, right: 7.88, near: 5.46, far: 5.62 },
  { left: -0.22, right: -0.04, near: 5.6, far: 14.1 },
  { left: -5.85, right: -0.55, near: 6.43, far: 6.86 },
  { left: 0.25, right: 1.1, near: 7.05, far: 8.75 },
].map(o => {
  const clearance = 'clearance' in o && typeof o.clearance === 'number' ? o.clearance : margin;
  return { left: o.left - clearance, right: o.right + clearance, near: o.near - clearance, far: o.far + clearance };
});
function inside(p: RoomPoint, o: Obstacle) { return p.x > o.left && p.x < o.right && p.z > o.near && p.z < o.far; }
export function clearFactorySegment(a: RoomPoint, b: RoomPoint) {
  return !FACTORY_OBSTACLES.some(o => {
    let near = 0, far = 1;
    for (const [p, q] of [[a.x-b.x,a.x-o.left],[b.x-a.x,o.right-a.x],[a.z-b.z,a.z-o.near],[b.z-a.z,o.far-a.z]]) {
      if (p === 0) { if (q <= 0) return false; continue; }
      if (p < 0) near = Math.max(near, q/p); else far = Math.min(far, q/p);
      if (near >= far) return false;
    }
    return far > 0 && near < 1;
  });
}
const corners: RoomPoint[] = FACTORY_OBSTACLES.flatMap(o => [
  {x:o.left-.015,z:o.near-.015},{x:o.left-.015,z:o.far+.015},
  {x:o.right+.015,z:o.near-.015},{x:o.right+.015,z:o.far+.015},
]).filter(p => p.x > -7.8 && p.x < 23.8 && p.z > -4.3 && p.z < 13.7 && !FACTORY_OBSTACLES.some(o => inside(p,o)));
/** A restored pose may predate a new planter or wall. Move only blocked poses. */
export function recoverFactoryPosition(position: Position): Position {
  const point = fromFactoryWorld(position);
  if (!FACTORY_OBSTACLES.some(obstacle => inside(point, obstacle))) return position;
  const nearest = corners.reduce((best, corner) =>
    Math.hypot(corner.x - point.x, corner.z - point.z) < Math.hypot(best.x - point.x, best.z - point.z) ? corner : best);
  return toFactoryWorld(nearest);
}
let staticEdges: Array<Array<[number, number]>> | undefined;
/** Visibility routes share the actual wall opening and avoid station/couch footprints. */
export function routeToStation(from: RoomPoint, target: RoomPoint): RoomPoint[] {
  if (clearFactorySegment(from, target)) return [target];
  staticEdges ??= corners.map((a,i) => corners.flatMap((b,j) => i !== j && clearFactorySegment(a,b) ? [[j,Math.hypot(a.x-b.x,a.z-b.z)] as [number,number]] : []));
  const points = [...corners, from, target], start = points.length-2, end = points.length-1;
  const edges = staticEdges.map(list => [...list]); edges.push([],[]);
  for (const index of [start,end]) for (let j=0;j<index;j++) if (clearFactorySegment(points[index],points[j])) {
    const d = Math.hypot(points[index].x-points[j].x,points[index].z-points[j].z);
    edges[index].push([j,d]); edges[j].push([index,d]);
  }
  const costs = points.map(()=>Infinity), previous = points.map(()=>-1), visited = new Set<number>(); costs[start]=0;
  while(visited.size<points.length) {
    let current=-1; for(let i=0;i<points.length;i++) if(!visited.has(i)&&(current<0||costs[i]<costs[current])) current=i;
    if(current===end||!Number.isFinite(costs[current])) break;
    visited.add(current);
    for(const [next,d] of edges[current]) if(costs[current]+d<costs[next]) {costs[next]=costs[current]+d;previous[next]=current;}
  }
  if(!Number.isFinite(costs[end])) return [from]; // Do not walk through a solid prop when a stale pose is inside it.
  const result: RoomPoint[]=[]; for(let i=end;i!==start&&i>=0;i=previous[i]) result.unshift(points[i]);
  return result;
}
export function constrainFactoryStep(from: Position, to: Position): Position {
  const a=fromFactoryWorld(from), b=fromFactoryWorld(to);
  if(clearFactorySegment(a,b)) return to;
  const horizontal={x:b.x,z:a.z};
  if(clearFactorySegment(a,horizontal)) a.x=b.x;
  const vertical={x:a.x,z:b.z};
  if(clearFactorySegment(a,vertical)) a.z=b.z;
  return toFactoryWorld(a);
}

/** Followers can spread out on open floor, but never straddle a stair wall. */
export function factoryCompanionPosition(parent: RoomPoint, index: number): RoomPoint {
  const angle = index * 2.4 + .5;
  const desired = { x: parent.x + Math.cos(angle) * .42, z: parent.z + .2 + Math.sin(angle) * .28 };
  return fromFactoryWorld(constrainFactoryStep(toFactoryWorld(parent), toFactoryWorld(desired)));
}
