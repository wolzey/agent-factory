/**
 * Runtime toggle for the skyline QA controls (clock drag and weather menu). They are
 * always local to the viewer: `?skyDebug` turns them on for a URL, and the key sequence
 * below toggles them for this browser, remembered in localStorage.
 */
export const SKY_DEBUG_CODE: readonly string[] = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a',
];

export const SKY_DEBUG_STORAGE_KEY = 'skyDebug';

/** Feed keys one at a time; returns true on the keystroke that completes the sequence. */
export function createKeySequenceMatcher(sequence: readonly string[] = SKY_DEBUG_CODE): (key: string) => boolean {
  const recent: string[] = [];
  return (key: string) => {
    recent.push(key.length === 1 ? key.toLowerCase() : key);
    if (recent.length > sequence.length) recent.shift();
    if (recent.length < sequence.length || recent.some((typed, index) => typed !== sequence[index])) return false;
    recent.length = 0;
    return true;
  };
}

export function readStoredSkyDebug(storage: Pick<Storage, 'getItem'> | null | undefined): boolean {
  try {
    return storage?.getItem(SKY_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function storeSkyDebug(storage: Pick<Storage, 'setItem' | 'removeItem'> | null | undefined, enabled: boolean): void {
  try {
    if (enabled) storage?.setItem(SKY_DEBUG_STORAGE_KEY, '1');
    else storage?.removeItem(SKY_DEBUG_STORAGE_KEY);
  } catch {
    // storage unavailable (private mode, blocked): the toggle still works for this page load
  }
}
