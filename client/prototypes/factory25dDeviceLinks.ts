import './factory25dDeviceLinks.css';
type Principal = { ownerId: string; username: string };
type Device = { id: string; name: string; createdAt: number; expiresAt: number };

export function createDeviceLinks(getPrincipal: () => Principal | undefined) {
  const dialog = document.createElement('dialog'); dialog.className = 'factory-device-links'; dialog.setAttribute('aria-labelledby', 'device-links-title');
  dialog.innerHTML = `<header><div><span class="device-eyebrow">YOUR FACTORY / CONNECTIONS</span><h2 id="device-links-title">Link a device</h2></div><button class="device-close" aria-label="Close device connections">×</button></header>
    <div class="device-body"><p class="device-origin"></p><p class="device-account"></p>
    <form><label for="factory-device-code">Code shown in the Mac or iPad app</label><div class="device-code-row"><input id="factory-device-code" placeholder="ABCDE-FGHJK" maxlength="16" autocomplete="off" autocapitalize="characters" spellcheck="false" required><button>Check code</button></div></form>
    <section class="device-approval" hidden><span class="device-eyebrow">REQUESTING DEVICE</span><h3></h3><p>Approve only if this name and code match the app you are connecting.</p><button class="device-approve">Connect this device</button></section>
    <p class="device-status" role="status" aria-live="polite"></p><section><h3>Connected devices</h3><p class="device-scope">Devices can read your identity and avatar. Disconnecting revokes that device’s access.</p><ul class="device-list"></ul><button class="device-refresh">Refresh devices</button></section></div>`;
  document.body.append(dialog);
  const input = dialog.querySelector<HTMLInputElement>('input')!, status = dialog.querySelector<HTMLElement>('.device-status')!, approval = dialog.querySelector<HTMLElement>('.device-approval')!, list = dialog.querySelector('ul')!;
  let owner = '', checkedCode = '', generation = 0, inspection = 0, controller = new AbortController();
  const lifetime = new AbortController(), events = { signal: lifetime.signal };
  async function request(path: string, method = 'GET', body?: unknown) {
    const current = generation, identity = owner;
    const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), 'X-Factory-Owner': identity }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (current !== generation || identity !== owner || !dialog.open) throw new DOMException('Stale request', 'AbortError');
    if (!response.ok) throw new Error(response.status === 401 ? 'Connect this browser first with agent-factory login on your computer.' : response.status === 409 ? 'Your connection changed. Close this panel and open it again.' : response.status === 404 ? 'That code expired or is unavailable. Request a new one in the app.' : response.status === 429 ? 'Too many attempts. Please wait a minute.' : 'Couldn’t complete that request. Try again.');
    const value = await response.json();
    if (current !== generation || identity !== owner || !dialog.open) throw new DOMException('Stale request', 'AbortError');
    return value;
  }
  function fail(error: unknown) { if (!(error instanceof DOMException && error.name === 'AbortError')) status.textContent = error instanceof Error ? error.message : 'Couldn’t connect. Try again.'; }
  async function refresh() {
    if (!owner) return;
    try {
      const data = await request('/api/auth/devices') as { devices: Device[] }; list.replaceChildren();
      if (!data.devices.length) { const row = document.createElement('li'); row.textContent = 'No connected devices yet.'; list.append(row); }
      for (const device of data.devices) {
        const row = document.createElement('li'), info = document.createElement('span'), button = document.createElement('button');
        info.textContent = `${device.name} · expires ${new Date(device.expiresAt).toLocaleDateString()}`;
        button.textContent = 'Disconnect'; let confirming = false;
        button.addEventListener('click', async () => {
          if (!confirming) { confirming = true; button.textContent = 'Confirm disconnect'; return; }
          button.disabled = true;
          try { await request(`/api/auth/devices/${encodeURIComponent(device.id)}`, 'DELETE'); status.textContent = `${device.name} disconnected.`; await refresh(); }
          catch (error) { fail(error); button.disabled = false; }
        }, events);
        row.append(info, button); list.append(row);
      }
    } catch (error) { fail(error); }
  }
  function sync() {
    if (!dialog.open) return;
    const principal = getPrincipal(); if (owner === (principal?.ownerId ?? '')) return;
    generation++; controller.abort(); controller = new AbortController(); owner = principal?.ownerId ?? ''; checkedCode = ''; approval.hidden = true; list.replaceChildren();
    dialog.querySelector('.device-account')!.textContent = principal ? `Connecting as ${principal.username}` : 'Connect this browser first: run agent-factory login on the computer running your agents.';
    input.disabled = !owner; dialog.querySelector<HTMLButtonElement>('form button')!.disabled = !owner;
    status.textContent = ''; void refresh();
  }
  function open(code = '') {
    if (!dialog.open) dialog.showModal(); owner = '\0'; input.value = code; dialog.querySelector('.device-origin')!.textContent = location.origin; sync(); input.focus();
  }
  dialog.querySelector('form')!.addEventListener('submit', async event => {
    event.preventDefault(); approval.hidden = true; checkedCode = ''; status.textContent = 'Checking code…';
    const code = input.value.trim(), attempt = ++inspection;
    try { const link = await request('/api/auth/devices/inspect', 'POST', { code }); if (attempt !== inspection) return; checkedCode = link.userCode; approval.querySelector('h3')!.textContent = `${link.deviceName} · ${link.userCode}`; approval.hidden = false; status.textContent = ''; }
    catch (error) { fail(error); }
  }, events);
  input.addEventListener('input', () => { inspection++; checkedCode = ''; approval.hidden = true; }, events);
  dialog.querySelector('.device-approve')!.addEventListener('click', async () => {
    if (!checkedCode) return;
    const code = checkedCode; checkedCode = ''; approval.hidden = true;
    try { await request('/api/auth/devices/approve', 'POST', { code }); status.textContent = 'Approved. The app will finish connecting; refresh to see it below.'; }
    catch (error) { fail(error); }
  }, events);
  dialog.querySelector('.device-refresh')!.addEventListener('click', () => { void refresh(); }, events);
  dialog.querySelector('.device-close')!.addEventListener('click', () => dialog.close(), events);
  dialog.addEventListener('close', () => { generation++; controller.abort(); controller = new AbortController(); approval.hidden = true; checkedCode = ''; }, events);
  function fromFragment() {
    const params = new URLSearchParams(location.hash.slice(1)), code = params.get('link-device');
    if (code !== null) { params.delete('link-device'); history.replaceState(null, '', `${location.pathname}${location.search}${params.size ? `#${params}` : ''}`); open(code.slice(0,16)); }
  }
  window.addEventListener('hashchange', fromFragment, events); fromFragment();
  return { open, sync, dispose() { lifetime.abort(); controller.abort(); dialog.remove(); } };
}
