import { afterEach, expect, it, vi } from 'vitest';
import { startSceneLoop } from '../client/prototypes/factory25dSceneLoop';

afterEach(() => vi.unstubAllGlobals());

it('cancels pending work and ignores a stale callback after disposal', () => {
  const callbacks: Array<() => void> = [];
  const cancel = vi.fn();
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => callbacks.push(callback));
  vi.stubGlobal('cancelAnimationFrame', cancel);
  const update = vi.fn();
  const stop = startSceneLoop(update);
  callbacks[0]();
  expect(update).toHaveBeenCalledTimes(1);
  stop();
  expect(cancel).toHaveBeenCalledWith(2);
  callbacks[1]();
  expect(update).toHaveBeenCalledTimes(1);
  expect(callbacks).toHaveLength(2);
});

it('caps the frame rate with even pacing on a 120Hz display', () => {
  const callbacks: Array<(now: number) => void> = [];
  vi.stubGlobal('requestAnimationFrame', (callback: (now: number) => void) => callbacks.push(callback));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  let interval = 1000 / 60;
  const update = vi.fn();
  const stop = startSceneLoop(update, () => interval);
  const refresh = 1000 / 120;
  for (let frame = 0; frame < 12; frame++) callbacks[frame](frame * refresh);
  expect(update).toHaveBeenCalledTimes(6); // Every other refresh: 60fps.
  interval = 1000 / 30;
  update.mockClear();
  for (let frame = 12; frame < 24; frame++) callbacks[frame](frame * refresh);
  expect(update).toHaveBeenCalledTimes(3); // Every fourth refresh: 30fps.
  stop();
});

it('does not schedule another frame when disposed during an update', () => {
  let callback = () => {};
  const request = vi.fn((next: () => void) => { callback = next; return 1; });
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const stop = startSceneLoop(() => stop());
  callback();
  expect(request).toHaveBeenCalledTimes(1);
});
