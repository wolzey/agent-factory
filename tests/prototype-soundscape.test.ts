import { expect, it } from 'vitest';
import { CLEAR_WEATHER, parseWeatherOverride } from '../client/sky/weather';
import { soundscapeMix, soundVolume, type SoundEnvironment } from '../client/prototypes/factory25dSoundscape';

const room: SoundEnvironment = { weather: CLEAR_WEATHER, patio01: 0, window01: 0, night: false, reading: false };

it('keeps rain behind glass, then opens its level and frequency range on the patio', () => {
  const weather = parseWeatherOverride('?skyWeather=rain-light')!;
  const inside = soundscapeMix({ ...room, weather });
  const window = soundscapeMix({ ...room, weather, window01: 1 });
  const outside = soundscapeMix({ ...room, weather, patio01: 1 });
  expect(inside.rain).toBeGreaterThan(0);
  expect(inside.rain).toBeLessThan(window.rain);
  expect(window.rain).toBeLessThan(outside.rain);
  expect(inside.rainCutoff).toBeLessThan(window.rainCutoff);
  expect(window.rainCutoff).toBeLessThan(outside.rainCutoff);
  expect(outside.windowRain).toBe(0);
  expect(outside.effects).toBe(0);
});

it('only allows bird calls in fair daytime weather, including while precipitation fades away', () => {
  expect(soundscapeMix({ ...room, patio01: 1 }).birds).toBeGreaterThan(soundscapeMix(room).birds);
  for (const preset of ['rain-light', 'rain-heavy', 'snow-light', 'snow-heavy', 'cloudy', 'fog']) {
    expect(soundscapeMix({ ...room, patio01: 1, weather: parseWeatherOverride(`?skyWeather=${preset}`)! }).birds).toBe(0);
  }
  expect(soundscapeMix({ ...room, patio01: 1, night: true }).birds).toBe(0);
  expect(soundscapeMix({ ...room, weather: { ...CLEAR_WEATHER, rain01: 0.1 } }).birds).toBe(0);
  expect(soundscapeMix({ ...room, weather: { ...CLEAR_WEATHER, snow01: 0.1 } }).birds).toBe(0);
});

it('does not invent rain in clear or snowy weather, and quietens the room when reading', () => {
  expect(soundscapeMix(room).rain).toBe(0);
  expect(soundscapeMix({ ...room, weather: parseWeatherOverride('?skyWeather=snow-heavy')! }).rain).toBe(0);
  const ordinary = soundscapeMix(room);
  const focused = soundscapeMix({ ...room, reading: true });
  expect(focused.wind).toBeLessThan(ordinary.wind);
  expect(focused.effects).toBeLessThan(ordinary.effects);
});

it('keeps night insects outside and stops them in rain, snow and daytime', () => {
  expect(soundscapeMix({ ...room, patio01: 1, night: true }).crickets).toBeGreaterThan(0);
  expect(soundscapeMix({ ...room, patio01: 1 }).crickets).toBe(0);
  for (const preset of ['rain-light', 'snow-heavy'])
    expect(soundscapeMix({ ...room, patio01: 1, night: true, weather: parseWeatherOverride(`?skyWeather=${preset}`)! }).crickets).toBe(0);
});

it('uses a quiet default, a real zero, and bounded master gain', () => {
  expect(soundVolume(0)).toBe(0);
  expect(soundVolume(-10)).toBe(0);
  expect(soundVolume(NaN)).toBe(0);
  expect(soundVolume(40)).toBeLessThan(0.25);
  expect(soundVolume(100)).toBe(0.85);
  expect(soundVolume(200)).toBe(0.85);
});
