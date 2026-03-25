import { STALE_CHECK_INTERVAL_MS } from '../shared/constants.js';
import type { StateManager } from './state.js';

export function startStaleReaper(state: StateManager): NodeJS.Timeout {
  return setInterval(() => {
    const reaped = state.reapStale();
    if (reaped.length > 0) {
      console.log(`[cleanup] Reaped ${reaped.length} stale session(s): ${reaped.join(', ')}`);
    }
  }, STALE_CHECK_INTERVAL_MS);
}
