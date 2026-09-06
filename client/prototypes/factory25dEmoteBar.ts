import { VALID_EMOTES } from '@shared/constants';
import type { EmoteType } from '@shared/types';
import { EMOTE_GLYPHS } from '../ui/emotes';

/** Ethan's full emote loadout and B shortcut, adapted to the DOM room controls. */
export function createEmoteBar(express: (emote: EmoteType) => void, stop: () => void) {
  const bar = document.createElement('details');
  bar.className = 'factory-emote-bar pixel-island'; bar.hidden = true;
  bar.innerHTML = '<summary>emotes <kbd>B</kbd></summary><div class="factory-emote-choices" role="group" aria-label="Emotes"></div><p>← → choose · enter to react</p>';
  const choices = bar.querySelector('div')!;
  const abort = new AbortController(), events = { signal: abort.signal };
  let selected = 0;
  const buttons = VALID_EMOTES.map((emote, index) => {
    const button = document.createElement('button'); button.type = 'button';
    button.setAttribute('aria-label', emote); button.dataset.emote = emote;
    const glyph = document.createElement('span'); glyph.textContent = EMOTE_GLYPHS[emote]; glyph.setAttribute('aria-hidden', 'true');
    button.append(glyph, emote); choices.append(button);
    button.addEventListener('click', () => {
      selected = index; stop(); express(emote); bar.open = false; button.blur();
    }, events);
    return button;
  });
  bar.addEventListener('toggle', () => { if (bar.open) stop(); }, events);
  bar.addEventListener('keydown', event => {
    event.stopPropagation();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.code)) {
      event.preventDefault();
      selected = event.code === 'Home' ? 0 : event.code === 'End' ? buttons.length - 1
        : ((index < 0 ? selected : index) + (event.code === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length;
      buttons[selected].focus();
    } else if (event.code === 'Escape' || event.code === 'KeyB') {
      event.preventDefault(); bar.open = false; (document.activeElement as HTMLElement)?.blur();
    }
  }, events);
  document.body.append(bar);
  return {
    open() { if (!bar.hidden) { stop(); bar.open = true; buttons[selected].focus(); } },
    sync(active: boolean, available: boolean) {
      bar.hidden = !active || !available;
      if (bar.hidden) bar.open = false;
    },
    dispose() { abort.abort(); bar.remove(); },
  };
}
