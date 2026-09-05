/** A bounded, interruptible scroll spring. Gesture targets can change without
 * discarding the current velocity; reduced motion settles immediately. */
export class WindowPan {
  position = 0;
  target = 0;
  velocity = 0;
  limit = 0;
  clamp(value: number) {
    return Math.max(-this.limit, Math.min(this.limit, value));
  }
  set(value: number, immediate = false) {
    this.target = this.clamp(value);
    if (immediate) {
      this.position = this.target;
      this.velocity = 0;
    }
  }
  resize(limit: number) {
    this.limit = Math.max(0, limit);
    this.target = this.clamp(this.target);
    this.position = this.clamp(this.position);
  }
  update(dt: number, reduced: boolean) {
    if (reduced) {
      this.set(this.target, true);
      return;
    }
    let remaining = Math.max(0, Math.min(dt, 0.1));
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 120);
      this.velocity += ((this.target - this.position) * 160 - this.velocity * 25) * step;
      this.position += this.velocity * step;
      const bounded = this.clamp(this.position);
      if (bounded !== this.position) {
        this.position = bounded;
        this.velocity = 0;
      }
      remaining -= step;
    }
    if (Math.abs(this.target - this.position) < 0.0005 && Math.abs(this.velocity) < 0.002)
      this.set(this.target, true);
  }
}
