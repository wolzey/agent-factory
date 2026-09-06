import type { AvatarConfig } from '@shared/types';
import { AVATAR_STYLES, parseAvatarConfig } from '@shared/avatar-customization';
import { readAvatar } from './factory25dAvatar';
import { resolveAvatar } from '../rendering/avatarPainter';
import './factory25dAvatarEditor.css';

type Context = { ownerId: string; username: string };
export interface AvatarScenePreview {
  open(context: Context): void;
  setAvatar(avatar: AvatarConfig): void;
  pose(direction: number, walking: boolean): void;
  close(): void;
}
type StyleKey = keyof typeof AVATAR_STYLES;
type ColorKey = 'hairColor' | 'skinTone' | 'shirtColor' | 'pantsColor' | 'shoeColor';
const palettes = {
  hairColor: ['#222222', '#332211', '#664422', '#aa6633', '#d4b879', '#e8d5b5', '#880000', '#888888'],
  skinTone: ['#ffcc99', '#f5c28a', '#dba97a', '#c68e5a', '#a16d42', '#7a4e2d'],
  clothes: ['#4a90d9', '#ff6b6b', '#51cf66', '#ffd43b', '#cc5de8', '#ffa94d', '#eeeeee', '#2a2a3e'],
};

export function createAvatarEditor(getContext: () => Context | undefined, onOpen: () => void, onSaved: () => void,
  scenePreview: AvatarScenePreview,
  previewApi?: (method: 'GET' | 'PUT', signal: AbortSignal, avatar?: AvatarConfig) => Promise<{ avatar: AvatarConfig }>) {
  const dialog = document.createElement('dialog'); dialog.className = 'avatar-editor';
  dialog.setAttribute('aria-labelledby', 'avatar-editor-title');
  dialog.innerHTML = `<form>
    <header><h2 id="avatar-editor-title">edit avatar</h2><button type="button" class="avatar-close" aria-label="Close avatar editor">×</button></header>
    <div class="avatar-editor-body">
      <section class="avatar-preview" aria-label="Avatar preview">
        <p class="avatar-preview-name"></p><div class="avatar-turn"><button type="button" data-turn="-1" aria-label="Turn avatar left">←</button><span class="avatar-facing">front</span><button type="button" data-turn="1" aria-label="Turn avatar right">→</button></div>
        <button type="button" class="avatar-walk" aria-pressed="false">preview walking</button>
      </section>
      <section class="avatar-options" aria-label="Appearance"><div class="avatar-tabs" role="group" aria-label="Customize">
        <button type="button" data-page="look" aria-pressed="true">look</button><button type="button" data-page="clothes" aria-pressed="false">clothes</button><button type="button" data-page="extras" aria-pressed="false">extras</button>
      </div><div class="avatar-page" data-section="look"></div><div class="avatar-page" data-section="clothes" hidden></div><div class="avatar-page" data-section="extras" hidden></div></section>
    </div>
    <footer><p class="avatar-editor-status" role="status" aria-live="polite"></p><p class="avatar-save-help">one look for your agents, now and next time.</p><div class="avatar-save-actions"><button type="button" class="avatar-cancel">cancel</button><button type="submit" class="avatar-save">save avatar</button></div></footer>
  </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form')!;
  const status = dialog.querySelector<HTMLElement>('.avatar-editor-status')!;
  const save = dialog.querySelector<HTMLButtonElement>('.avatar-save')!;
  const cancel = dialog.querySelector<HTMLButtonElement>('.avatar-cancel')!, closeButton = dialog.querySelector<HTMLButtonElement>('.avatar-close')!;
  const walking = dialog.querySelector<HTMLButtonElement>('.avatar-walk')!;
  const abort = new AbortController(), events = { signal: abort.signal };
  const fields = new Map<string, HTMLInputElement | HTMLSelectElement>();
  let owner: string | undefined, draft: AvatarConfig | undefined, baseline = '';
  let loading = false, saving = false, direction = 0, walk = false, generation = 0;
  let request: AbortController | undefined, returnFocus: HTMLElement | null = null;

  const reconnectMessage = 'Reconnect this browser to save. Your preview is still here.';
  function current() { const context = getContext(); return dialog.open && !!owner && (!context || owner === context.ownerId); }
  function controls() {
    save.disabled = loading || saving || !draft || owner !== getContext()?.ownerId || JSON.stringify(draft) === baseline;
    save.textContent = saving ? 'saving…' : 'save avatar';
    closeButton.disabled = cancel.disabled = saving;
    for (const element of dialog.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('.avatar-options input, .avatar-options select, .avatar-options button')) element.disabled = loading || saving || !draft;
  }
  function updatePreview() { if (draft) scenePreview.setAvatar(draft); controls(); }
  function setField(key: StyleKey | ColorKey, value: number | string) {
    if (!draft || loading || saving) return;
    draft = { ...draft, [key]: value };
    if (key === 'hairStyle') draft.spriteIndex = Number(value);
    if (key === 'shirtColor') draft.color = String(value);
    status.textContent = ''; paintFields(); updatePreview();
  }
  function style(section: string, key: StyleKey, label: string) {
    const field = document.createElement('label'); field.className = 'avatar-field'; field.append(label);
    const select = document.createElement('select'); select.setAttribute('aria-label', label);
    AVATAR_STYLES[key].forEach((name, index) => { const option = new Option(name, String(index)); select.add(option); });
    select.addEventListener('change', () => setField(key, Number(select.value)), events);
    fields.set(key, select); field.append(select); dialog.querySelector(`[data-section="${section}"]`)!.append(field);
  }
  function color(section: string, key: ColorKey, label: string) {
    const field = document.createElement('fieldset'); field.className = 'avatar-field';
    const legend = document.createElement('legend'); legend.textContent = label; field.append(legend);
    const swatches = document.createElement('div'); swatches.className = 'avatar-swatches';
    for (const value of key === 'hairColor' ? palettes.hairColor : key === 'skinTone' ? palettes.skinTone : palettes.clothes) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'avatar-swatch';
      button.style.setProperty('--swatch', value); button.dataset.colorKey = key; button.dataset.color = value;
      button.setAttribute('aria-label', `${label} ${value}`); button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => setField(key, value), events); swatches.append(button);
    }
    const custom = document.createElement('input'); custom.type = 'color'; custom.setAttribute('aria-label', `Custom ${label}`); custom.title = `Custom ${label}`;
    custom.addEventListener('input', () => setField(key, custom.value), events); fields.set(key, custom);
    swatches.append(custom); field.append(swatches); dialog.querySelector(`[data-section="${section}"]`)!.append(field);
  }
  style('look', 'hairStyle', 'hair'); color('look', 'hairColor', 'hair color'); color('look', 'skinTone', 'skin tone');
  color('clothes', 'shirtColor', 'shirt color'); style('clothes', 'shirtDesign', 'shirt design');
  color('clothes', 'pantsColor', 'pants color'); color('clothes', 'shoeColor', 'shoe color');
  style('extras', 'facialHair', 'facial hair'); style('extras', 'mouthStyle', 'expression');
  style('extras', 'faceAccessory', 'eyewear'); style('extras', 'headAccessory', 'headwear');

  function paintFields() {
    if (!draft) return;
    for (const [key, field] of fields) field.value = String(draft[key as keyof AvatarConfig]);
    for (const swatch of dialog.querySelectorAll<HTMLButtonElement>('[data-color-key]')) swatch.setAttribute('aria-pressed', String(draft[swatch.dataset.colorKey as ColorKey]?.toLowerCase() === swatch.dataset.color));
  }
  function page(name: string) {
    for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-page]')) button.setAttribute('aria-pressed', String(button.dataset.page === name));
    for (const section of dialog.querySelectorAll<HTMLElement>('[data-section]')) section.hidden = section.dataset.section !== name;
  }
  for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-page]')) button.addEventListener('click', () => page(button.dataset.page!), events);
  for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-turn]')) button.addEventListener('click', () => {
    direction = (direction + Number(button.dataset.turn) + 4) % 4;
    dialog.querySelector('.avatar-facing')!.textContent = ['front', 'right', 'back', 'left'][direction];
    scenePreview.pose(direction, walk);
  }, events);
  walking.addEventListener('click', () => { walk = !walk; walking.setAttribute('aria-pressed', String(walk)); walking.textContent = walk ? 'pause walking' : 'preview walking'; scenePreview.pose(direction, walk); }, events);
  function finish() {
    scenePreview.close();
    generation++; request?.abort(); request = undefined;
    owner = undefined; draft = undefined; loading = saving = false;
    document.body.classList.remove('avatar-editor-open');
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }
  function close() { if (!saving) dialog.close(); }
  cancel.addEventListener('click', close, events); closeButton.addEventListener('click', close, events);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); }, events);
  dialog.addEventListener('close', finish, events);
  // Keep movement, chat and camera shortcuts behind the modal from receiving input.
  dialog.addEventListener('keydown', event => event.stopPropagation(), events);
  dialog.addEventListener('keyup', event => event.stopPropagation(), events);
  async function api(method: 'GET' | 'PUT', signal: AbortSignal, avatar?: AvatarConfig) {
    if (previewApi) return previewApi(method, signal, avatar);
    let response: Response;
    try {
      response = await fetch('/api/avatar', { method, credentials: 'same-origin',
        headers: { 'X-Avatar-Owner': owner!, ...(avatar ? { 'Content-Type': 'application/json' } : {}) },
        ...(avatar ? { body: JSON.stringify({ avatar }) } : {}),
        signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) });
    } catch {
      throw new Error(method === 'PUT' ? 'Couldn’t confirm the save. Your changes are still here—try again.' : 'Couldn’t reach the factory. Close the editor and try again.');
    }
    if (!response.ok) throw new Error(response.status === 409 ? 'Your connection changed. Close the editor and open it again.' : response.status === 401 ? 'Your connection expired. Reconnect this browser, then try again.' : method === 'PUT' ? 'Couldn’t save your avatar. Your changes are still here—try again.' : 'Couldn’t load your avatar. Close the editor and try again.');
    try { return await response.json(); } catch { throw new Error('Couldn’t read the saved appearance. Please try again.'); }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!current() || !draft || save.disabled) return;
    const submitted = structuredClone(draft), sequence = generation;
    saving = true; controls(); status.textContent = '';
    request = new AbortController();
    void api('PUT', request.signal, submitted)
      .then(result => {
        if (!current() || sequence !== generation) return;
        if (!parseAvatarConfig(result.avatar)) throw new Error('Couldn’t confirm the saved avatar. Please try again.');
        saving = false; dialog.close(); onSaved();
      }).catch(error => { if (!current() || sequence !== generation) return; saving = false; status.textContent = error.message; controls(); });
  }, events);

  return {
    async open() {
      const context = getContext(); if (!context || dialog.open) return;
      onOpen(); owner = context.ownerId; const sequence = ++generation;
      scenePreview.open(context);
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      loading = true; saving = false; draft = undefined; direction = 0; walk = false;
      scenePreview.pose(direction, walk);
      walking.textContent = 'preview walking'; walking.setAttribute('aria-pressed', 'false');
      dialog.querySelector('.avatar-facing')!.textContent = 'front';
      dialog.querySelector('.avatar-preview-name')!.textContent = context.username;
      status.textContent = 'loading your look…'; page('look'); controls();
      document.body.classList.add('avatar-editor-open'); dialog.showModal();
      request = new AbortController();
      try {
        const result = await api('GET', request.signal);
        if (!current() || sequence !== generation) return;
        const avatar = readAvatar(result.avatar); if (!avatar) throw new Error('Couldn’t load your avatar. Please try again.');
        const resolved = resolveAvatar(avatar);
        draft = { ...avatar, ...resolved, spriteIndex: resolved.hairStyle, color: resolved.shirtColor };
        baseline = JSON.stringify(draft); loading = false; status.textContent = ''; paintFields(); updatePreview();
        fields.get('hairStyle')?.focus({ preventScroll: true });
      } catch (error) {
        if (!current() || sequence !== generation) return;
        loading = false; status.textContent = error instanceof Error ? error.message : 'Couldn’t load your avatar. Please try again.'; controls();
      }
    },
    sync() {
      if (!dialog.open) return;
      const context = getContext();
      if (context && owner !== context.ownerId) { saving = false; dialog.close(); return; }
      if (!saving && !loading) {
        if (!context) status.textContent = reconnectMessage;
        else if (status.textContent === reconnectMessage) status.textContent = '';
      }
      controls();
    },
    invalidate() { if (dialog.open) { saving = false; dialog.close(); } },
    dispose() { if (dialog.open) dialog.close(); finish(); abort.abort(); dialog.remove(); },
  };
}
