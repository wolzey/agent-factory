export interface PawPoint { x: number; y: number; z: number }

/** A diagonal pair swings while the other pair remains anchored in world space. */
export class BearFootsteps {
  readonly feet: PawPoint[] = [];
  private swing: { indices: number[]; from: PawPoint[]; to: PawPoint[]; elapsed: number } | null = null;
  private pair = 0;
  constructor(private ground: (x: number, z: number) => number) {}
  reset(nominal: PawPoint[]) {
    this.feet.splice(0, this.feet.length, ...nominal.map(p => ({ ...p, y: this.ground(p.x, p.z) })));
    this.swing = null;
  }
  update(dt: number, nominal: PawPoint[], direction: { x: number; z: number }, walking: boolean) {
    dt = Math.max(0, Math.min(0.1, dt));
    if (!this.feet.length) this.reset(nominal);
    if (!this.swing && walking) {
      const pairs = [[0, 3], [1, 2]];
      const indices = pairs[this.pair];
      if (indices.some(i => Math.hypot(nominal[i].x - this.feet[i].x, nominal[i].z - this.feet[i].z) > 0.022)) {
        this.swing = { indices, elapsed: 0, from: indices.map(i => ({ ...this.feet[i] })),
          to: indices.map(i => {
            const x = nominal[i].x + direction.x * 0.025, z = nominal[i].z + direction.z * 0.025;
            return { x, z, y: this.ground(x, z) };
          }),
        };
        this.pair = 1 - this.pair;
      }
    }
    if (this.swing) {
      this.swing.elapsed += dt;
      const t = Math.min(1, this.swing.elapsed / 0.14);
      const eased = t * t * (3 - 2 * t);
      this.swing.indices.forEach((index, i) => {
        const from = this.swing!.from[i], to = this.swing!.to[i];
        const x = from.x + (to.x - from.x) * eased, z = from.z + (to.z - from.z) * eased;
        this.feet[index] = { x, z, y: this.ground(x, z) + Math.sin(t * Math.PI) * 0.012 };
      });
      if (t === 1) this.swing = null;
    }
    return this.feet;
  }
}
