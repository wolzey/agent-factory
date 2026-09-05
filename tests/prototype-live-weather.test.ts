import { expect, it, vi, afterEach } from 'vitest';
import { liveSunAt, watchLiveWeather } from '../client/prototypes/factory25dLiveWeather';
import { CLEAR_WEATHER } from '../client/sky/weather';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('follows Salt Lake daylight and the same solar palette across day and night',()=>{
  expect(liveSunAt(Date.parse('2026-09-05T19:00:00Z')).night).toBe(false);
  expect(liveSunAt(Date.parse('2026-09-05T07:00:00Z')).night).toBe(true);
  expect(liveSunAt(Date.parse('2026-09-05T19:00:00Z')).palette.stars).toBe(0);
});
it('keeps the last weather on failure and retries without updating after disposal',async()=>{
  vi.useFakeTimers(); vi.stubGlobal('document',Object.assign(new EventTarget(),{hidden:false}));
  const receive=vi.fn(),status=vi.fn(),current=vi.fn().mockResolvedValueOnce(CLEAR_WEATHER).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(CLEAR_WEATHER);
  const stop=watchLiveWeather(receive,status,{current}); await vi.advanceTimersByTimeAsync(0);
  expect(receive).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(300000); expect(receive).toHaveBeenCalledTimes(1); expect(status).toHaveBeenLastCalledWith(expect.stringContaining('reconnecting'));
  await vi.advanceTimersByTimeAsync(300000); expect(receive).toHaveBeenCalledTimes(2);
  stop(); await vi.advanceTimersByTimeAsync(300000); expect(receive).toHaveBeenCalledTimes(2);
});
