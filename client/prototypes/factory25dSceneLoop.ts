/**
 * Own the frame callback so replacing a scene cannot leave it running.
 * `interval` caps the frame rate: refreshes that arrive sooner are skipped, so a 120Hz
 * display renders every other refresh at a 60fps cap. The 1ms tolerance absorbs timer jitter.
 */
export function startSceneLoop(update: () => void, interval: () => number = () => 0): () => void {
  let stopped = false;
  let frame = 0;
  let last = -Infinity;
  const tick = (now: number = performance.now()) => {
    if (stopped) return;
    if (now - last >= interval() - 1) { last = now; update(); }
    if (!stopped) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
  };
}
