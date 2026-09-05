import { createKeySequenceMatcher, readStoredSkyDebug, storeSkyDebug } from '../sky/skyDebug';
import { requireElement } from './dom';

/** The same local Konami preference as the live factory; hidden on first visit. */
export function installWeatherShortcut() {
  const room = requireElement<HTMLDetailsElement>('.scene-settings');
  const windowSettings = requireElement<HTMLDetailsElement>('.window-settings');
  const announcement = requireElement<HTMLElement>('#weather-shortcut-status');
  let storage: Storage | undefined;
  try {
    storage = window.localStorage;
  } catch {
    /* Private browsing still supports the shortcut. */
  }
  let enabled = new URLSearchParams(location.search).has('skyDebug') || readStoredSkyDebug(storage);

  function apply(reveal = false) {
    for (const settings of [room, windowSettings]) {
      if (!enabled && settings.contains(document.activeElement)) {
        requireElement<HTMLButtonElement>(
          document.body.classList.contains('weather-open') ? '#window-back' : '#window-open',
        ).focus({ preventScroll: true });
      }
      settings.hidden = !enabled;
      settings.open = enabled && reveal;
    }
  }
  apply();
  const matchCode = createKeySequenceMatcher();
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
    )
      return;
    if (!matchCode(event.key)) return;
    enabled = !enabled;
    storeSkyDebug(storage, enabled);
    // Disabling a URL-unlocked menu should remain disabled after reloading.
    if (!enabled) {
      const url = new URL(location.href);
      url.searchParams.delete('skyDebug');
      history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
    apply(true);
    announcement.textContent = enabled
      ? 'Weather and light controls unlocked.'
      : 'Weather and light controls hidden.';
  });
}
