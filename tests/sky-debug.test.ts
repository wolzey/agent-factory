import { describe, expect, it } from 'vitest';
import {
  SKY_DEBUG_CODE,
  SKY_DEBUG_STORAGE_KEY,
  createKeySequenceMatcher,
  readStoredSkyDebug,
  storeSkyDebug,
} from '../client/sky/skyDebug';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}

describe('sky debug key sequence', () => {
  it('completes only on the final key of the full sequence', () => {
    const match = createKeySequenceMatcher();
    const results = SKY_DEBUG_CODE.map(key => match(key));
    expect(results.slice(0, -1).every(result => result === false)).toBe(true);
    expect(results.at(-1)).toBe(true);
  });

  it('is case-insensitive for letters and recovers from an extra leading key', () => {
    const match = createKeySequenceMatcher();
    const typed = ['ArrowUp', ...SKY_DEBUG_CODE.slice(0, -2), 'B', 'A'];
    expect(typed.map(key => match(key)).filter(Boolean)).toHaveLength(1);
  });

  it('resets after a wrong key and after a match', () => {
    const match = createKeySequenceMatcher(['a', 'b']);
    expect(match('a')).toBe(false);
    expect(match('x')).toBe(false);
    expect(match('b')).toBe(false);
    expect(match('a')).toBe(false);
    expect(match('b')).toBe(true);
    expect(match('b')).toBe(false);
  });
});

describe('sky debug preference', () => {
  it('round-trips through storage and tolerates a missing store', () => {
    const storage = memoryStorage();
    expect(readStoredSkyDebug(storage)).toBe(false);
    storeSkyDebug(storage, true);
    expect(storage.data.get(SKY_DEBUG_STORAGE_KEY)).toBe('1');
    expect(readStoredSkyDebug(storage)).toBe(true);
    storeSkyDebug(storage, false);
    expect(readStoredSkyDebug(storage)).toBe(false);
    expect(readStoredSkyDebug(null)).toBe(false);
    expect(() => storeSkyDebug(null, true)).not.toThrow();
  });

  it('ignores a throwing storage', () => {
    const broken = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(readStoredSkyDebug(broken)).toBe(false);
    expect(() => storeSkyDebug(broken, true)).not.toThrow();
  });
});
