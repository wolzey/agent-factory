import { publicBranding } from '../../shared/factory-branding';
import type { FactoryIdentity } from './factory25dBranding';
import { factoryHost, onFactoryConnection } from './factory25dBoardData';

export function readFactoryTitle(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || !('title' in value) || typeof value.title !== 'string') return;
  const title = value.title.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return title ? Array.from(title).slice(0, 100).join('') : undefined;
}

/** Preserve the last valid title during outages; refresh configuration on return/reconnect. */
export function watchFactoryIdentity(receive: (identity: FactoryIdentity) => void,
  host = factoryHost(), fetcher: typeof fetch = (input, init) => fetch(input, init)) {
  let request: AbortController | undefined, stopped = false, previous = '';
  async function refresh() {
    if (stopped || document.hidden || request) return;
    const controller = new AbortController(); request = controller;
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetcher(new URL('/api/config', host), {
        credentials: 'omit', cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) return;
      const value = await response.json();
      const title = readFactoryTitle(value);
      if (!title) return;
      const branding = publicBranding(value.branding);
      if (value.branding !== undefined && !branding) return;
      const identity = { title, branding }, key = JSON.stringify(identity);
      if (!stopped && key !== previous) { previous = key; receive(identity); }
    } catch { /* Keep the room's title while its server is unavailable. */ }
    finally { clearTimeout(timeout); if (request === controller) request = undefined; }
  }
  const visible = () => { if (!document.hidden) void refresh(); };
  const stopConnection = onFactoryConnection(connected => { if (connected) void refresh(); });
  document.addEventListener('visibilitychange', visible);
  window.addEventListener('focus', visible);
  const timer = setInterval(() => void refresh(), 60_000);
  void refresh();
  return () => {
    stopped = true; request?.abort(); clearInterval(timer); stopConnection();
    document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', visible);
  };
}

export function watchFactoryTitle(receive: (title: string) => void, host = factoryHost(), fetcher: typeof fetch = (input, init) => fetch(input, init)) {
  return watchFactoryIdentity(identity => receive(identity.title), host, fetcher);
}
