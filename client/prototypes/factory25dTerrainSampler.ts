import type { BufferGeometry } from 'three';

/** Small spatial buckets keep grounding exact on the exported, decimated mesh. */
export function createTerrainSampler(geometry: BufferGeometry, fallback: (x: number, z: number) => number) {
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  const count = index?.count ?? position.count;
  const cells = new Map<string, number[]>();
  const step = 0.5;
  const vertex = (i: number) => index ? index.getX(i) : i;
  for (let i = 0; i < count; i += 3) {
    const ids = [vertex(i), vertex(i + 1), vertex(i + 2)];
    const xs = ids.map(v => position.getX(v)), zs = ids.map(v => position.getZ(v));
    for (let x = Math.floor(Math.min(...xs) / step); x <= Math.floor(Math.max(...xs) / step); x++)
      for (let z = Math.floor(Math.min(...zs) / step); z <= Math.floor(Math.max(...zs) / step); z++) {
        const key = `${x},${z}`;
        const bucket = cells.get(key) ?? [];
        bucket.push(i); cells.set(key, bucket);
      }
  }
  return (x: number, z: number): number => {
    const bucket = cells.get(`${Math.floor(x / step)},${Math.floor(z / step)}`) ?? [];
    let highest = -Infinity;
    for (const i of bucket) {
      const a = vertex(i), b = vertex(i + 1), c = vertex(i + 2);
      const ax = position.getX(a), az = position.getZ(a);
      const bx = position.getX(b), bz = position.getZ(b);
      const cx = position.getX(c), cz = position.getZ(c);
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-10) continue;
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
      const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
      const w = 1 - u - v;
      if (Math.min(u, v, w) < -1e-6) continue;
      highest = Math.max(highest, u * position.getY(a) + v * position.getY(b) + w * position.getY(c));
    }
    return highest === -Infinity ? fallback(x, z) : highest;
  };
}
