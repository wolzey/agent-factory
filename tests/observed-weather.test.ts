import { expect, it, vi, afterEach } from 'vitest';
import Fastify from 'fastify';
import { weatherFromObservation, ObservedLehiWeatherProvider } from '../client/sky/observedWeather';
import { CLEAR_WEATHER } from '../client/sky/weather';
import { registerWeatherRoutes } from '../server/routes/weather';
const now = Date.now();
const observation = { station: 'KPVU', observedAt: now, conditions: '-TSRA', clouds: ['SCT','OVC'], windKnots: 6 };
afterEach(()=>vi.unstubAllGlobals());
it('uses observed thunder and rain even when the model is dry',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>observation}));
  const fallback={current:vi.fn().mockResolvedValue(CLEAR_WEATHER)}, provider=new ObservedLehiWeatherProvider(fallback);
  expect(await provider.current()).toMatchObject({mode:'thunderstorm',rain01:.3,thunder01:.72});
  expect(fallback.current).not.toHaveBeenCalled(); expect(provider.status).toContain('nearby Provo observation');
});
it('does not infer lightning from heavy rain or nearby thunder, and separates snow',()=>{
  expect(weatherFromObservation({...observation,conditions:'+RA'},now)).toMatchObject({mode:'rain',rain01:1,thunder01:0});
  expect(weatherFromObservation({...observation,conditions:'VCTS -RA'},now)).toMatchObject({mode:'rain',thunder01:0});
  expect(weatherFromObservation({...observation,conditions:'-SN'},now)).toMatchObject({mode:'snow',rain01:0,snow01:.3});
});
it('rejects stale, future, wrong-station and malformed observations',()=>{
  for(const change of [{observedAt:now-46*60_000},{observedAt:now+120_000},{station:'KSLC'},{observedAt:NaN}]) expect(weatherFromObservation({...observation,...change},now)).toBeNull();
});
it('falls back explicitly on stale observations or upstream failure',async()=>{
  const fallback={current:vi.fn().mockResolvedValue(CLEAR_WEATHER)}, provider=new ObservedLehiWeatherProvider(fallback);
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({...observation,observedAt:now-3600000})}).mockRejectedValueOnce(new Error('offline')));
  expect(await provider.current()).toEqual(CLEAR_WEATHER); expect(provider.status).toContain('model estimate');
  expect(await provider.current()).toEqual(CLEAR_WEATHER); expect(fallback.current).toHaveBeenCalledTimes(2);
});
it('shares and caches observation fetches, then refreshes; errors do not become cached observations',async()=>{
  let time=now;const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>[{icaoId:'KPVU',obsTime:now/1000,wxString:'-TSRA',clouds:[{cover:'OVC'}],wspd:6}]});
  const app=Fastify();registerWeatherRoutes(app,fetcher,()=>time);
  const replies=await Promise.all([app.inject('/api/weather/observation'),app.inject('/api/weather/observation')]);
  expect(fetcher).toHaveBeenCalledTimes(1);expect(replies[0].json()).toMatchObject({station:'KPVU',conditions:'-TSRA',observedAt:now});
  await app.inject('/api/weather/observation');expect(fetcher).toHaveBeenCalledTimes(1);
  time+=120001;fetcher.mockRejectedValueOnce(new Error('offline'));
  expect((await app.inject('/api/weather/observation')).statusCode).toBe(503);
  expect((await app.inject('/api/weather/observation')).statusCode).toBe(200);await app.close();
});
