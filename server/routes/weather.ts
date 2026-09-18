import type { FastifyInstance } from 'fastify';

/** One fixed nearby station; share requests across clients, never proxy arbitrary URLs. */
export function registerWeatherRoutes(app: FastifyInstance, fetcher: typeof fetch = fetch, now = Date.now) {
  let expires = 0, cached: unknown = null, pending: Promise<unknown> | undefined;
  app.get('/api/weather/observation', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (now() < expires) return cached;
    if (!pending) pending = (async () => {
      const response = await fetcher('https://aviationweather.gov/api/data/metar?ids=KPVU&format=json', {
        headers: { 'User-Agent': 'AgentFactory weather (github.com/wolzey/agent-factory)' }, signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) throw new Error('Observation unavailable');
      const rows = await response.json();
      const row = Array.isArray(rows) ? rows.find(r => r.icaoId === 'KPVU') : undefined;
      if (!row || typeof row.obsTime !== 'number') throw new Error('Invalid observation');
      cached = { station: 'KPVU', observedAt: row.obsTime * 1000, conditions: typeof row.wxString === 'string' ? row.wxString : '',
        clouds: Array.isArray(row.clouds) ? row.clouds.map((c: { cover?: string }) => c.cover) : [], windKnots: row.wspd };
      expires = now() + 120_000;
      return cached;
    })().finally(() => { pending = undefined; });
    try { return await pending; } catch { return reply.code(503).send({ error: 'Nearby observation unavailable' }); }
  });
}
