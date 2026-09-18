import { type WeatherProvider, type WeatherVisualState } from '../sky/weather';
import { ObservedLehiWeatherProvider } from '../sky/observedWeather';
import { solarSnapshot } from '../sky/solar';
import { paletteForElevation } from '../sky/skyPhase';

export function liveSunAt(timestamp: number) {
  const sun = solarSnapshot(timestamp);
  const night = sun.elevationDeg < -6;
  return { night, arc: ((night ? sun.nightProgress : sun.dayProgress) * 2 - 1) * 7,
    palette: paletteForElevation(sun.elevationDeg, sun.rising) };
}

/** Live Lehi conditions, with the shared weather provider and solar calculation. */
export function watchLiveWeather(receive: (weather: WeatherVisualState) => void,
  status: (message: string) => void, provider: WeatherProvider = new ObservedLehiWeatherProvider()) {
  let stopped = false, request: AbortController | undefined;
  async function refresh() {
    if (stopped || document.hidden || request) return;
    const controller = new AbortController(); request = controller;
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const weather = await provider.current(controller.signal);
      if (!stopped) { receive(weather); status(provider instanceof ObservedLehiWeatherProvider ? provider.status : 'live weather · Lehi'); }
    } catch {
      if (!stopped) status('weather reconnecting · last conditions may be stale');
    } finally { clearTimeout(timeout); if (request === controller) request = undefined; }
  }
  const visible = () => { if (!document.hidden) void refresh(); };
  document.addEventListener('visibilitychange', visible);
  const timer = setInterval(() => void refresh(), 2 * 60_000);
  void refresh();
  return () => { stopped = true; request?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
}
