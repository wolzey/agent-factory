import { CLEAR_WEATHER, OpenMeteoWeatherProvider, type WeatherProvider, type WeatherVisualState } from './weather';

export interface NearbyObservation {
  station: string; observedAt: number; conditions: string; clouds: string[]; windKnots?: number;
}
/** Observations expire rather than leaving yesterday's storm in the room. */
export function weatherFromObservation(observation: NearbyObservation, now = Date.now()): WeatherVisualState | null {
  if (observation.station !== 'KPVU' || !Number.isFinite(observation.observedAt) || now - observation.observedAt > 45 * 60_000 || observation.observedAt > now + 60_000 || typeof observation.conditions !== 'string' || !Array.isArray(observation.clouds)) return null;
  // Only current present-weather groups count. VCTS and distant lightning remarks are not an overhead storm.
  const groups = observation.conditions.split(/\s+/).filter(g => !g.startsWith('VC'));
  const thunder = groups.some(g => /TS/.test(g));
  const rainy = groups.filter(g => /RA|DZ/.test(g));
  const snowy = groups.filter(g => /SN|SG|PL/.test(g));
  const intensity = (groups: string[]) => groups.length ? groups.some(g => g.startsWith('+')) ? 1 : groups.every(g => g.startsWith('-')) ? .3 : .65 : 0;
  const rain01 = intensity(rainy), snow01 = intensity(snowy);
  const fog01 = groups.some(g => /FG/.test(g)) ? .78 : groups.some(g => /BR/.test(g)) ? .25 : 0;
  const cloud01 = Math.max(0, ...observation.clouds.map(c => ({ OVC: 1, BKN: .8, SCT: .45, FEW: .2, VV: 1 }[c] ?? 0)));
  return { ...CLEAR_WEATHER, mode: thunder ? 'thunderstorm' : snow01 ? 'snow' : rain01 ? 'rain' : fog01 > .35 ? 'fog' : cloud01 > .45 ? 'cloudy' : 'clear',
    cloud01: thunder || rain01 || snow01 ? Math.max(.8, cloud01) : cloud01,
    cloudForm01: thunder ? 1 : rain01 || snow01 ? .85 : cloud01 * .8,
    rain01, snow01, thunder01: thunder ? .72 : 0, fog01, wet01: rain01 || snow01 ? 1 : 0,
    wind01: Math.min(1, Math.max(0, (Number(observation.windKnots) || 0) * 1.852 / 45)) };
}

export class ObservedLehiWeatherProvider implements WeatherProvider {
  status = 'weather connecting';
  constructor(private readonly fallback: WeatherProvider = new OpenMeteoWeatherProvider(40.3916, -111.8508)) {}
  async current(signal?: AbortSignal): Promise<WeatherVisualState> {
    try {
      const response = await fetch('/api/weather/observation', { signal });
      if (!response.ok) throw new Error('Observation unavailable');
      const observation = await response.json() as NearbyObservation;
      const weather = weatherFromObservation(observation);
      if (weather) {
        const time = new Date(observation.observedAt).toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: 'numeric', minute: '2-digit' });
        this.status = `${weather.mode} · nearby Provo observation · ${time} MT`;
        return weather;
      }
    } catch { if (signal?.aborted) throw new Error('Weather cancelled'); }
    const weather = await this.fallback.current(signal);
    this.status = `${weather.mode} · Lehi model estimate · observations unavailable`;
    return weather;
  }
}
