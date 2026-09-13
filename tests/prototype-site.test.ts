import { createBranding } from '../server/branding';
import { afterEach, expect, it, vi } from 'vitest';
import { readFactoryTitle, watchFactoryTitle, watchFactoryIdentity } from '../client/prototypes/factory25dSite';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('keeps configured names as plain text while rejecting empty or malformed titles', () => {
  expect(readFactoryTitle({title:'  Rain & Research — café  '})).toBe('Rain & Research — café');
  expect(readFactoryTitle({title:'Rain\nFactory'})).toBe('Rain Factory');
  for (const value of [undefined, [], {title:42}, {title:'   '}]) expect(readFactoryTitle(value)).toBeUndefined();
  expect(readFactoryTitle({title:'🌧'.repeat(120)})).toHaveLength(200);
});

it('retains the last valid title on server failure and loads changes when returning', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('document', Object.assign(new EventTarget(), {hidden:false}));
  vi.stubGlobal('window', new EventTarget());
  const receive=vi.fn(), fetcher=vi.fn()
    .mockResolvedValueOnce({ok:true,json:async()=>({title:'Rain Factory'})})
    .mockResolvedValueOnce({ok:false})
    .mockResolvedValueOnce({ok:true,json:async()=>({title:'Patio Lab'})});
  const stop=watchFactoryTitle(receive,'https://factory.example',fetcher);
  await vi.advanceTimersByTimeAsync(0);
  expect(receive).toHaveBeenLastCalledWith('Rain Factory');
  expect(fetcher).toHaveBeenCalledWith(new URL('https://factory.example/api/config'),expect.objectContaining({credentials:'omit'}));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(receive).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event('focus')); await vi.advanceTimersByTimeAsync(0);
  expect(receive).toHaveBeenLastCalledWith('Patio Lab');
  stop(); window.dispatchEvent(new Event('focus')); await vi.advanceTimersByTimeAsync(60_000);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it('refreshes changed branding without a title change and handles explicit logo removal', async () => {
  vi.useFakeTimers();vi.stubGlobal('document',Object.assign(new EventTarget(),{hidden:false}));vi.stubGlobal('window',new EventTarget());
  const first=createBranding({title:'Same',accentColor:'#112233'}),next=createBranding({title:'Same',accentColor:'#445566'});
  const receive=vi.fn(),fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>first})
    .mockResolvedValueOnce({ok:true,json:async()=>({...next,branding:{...next.branding,logoUrl:'https://evil.test/logo.png'}})})
    .mockResolvedValueOnce({ok:true,json:async()=>next});
  const stop=watchFactoryIdentity(receive,'https://factory.example',fetcher);
  await vi.advanceTimersByTimeAsync(0);expect(receive).toHaveBeenCalledWith({title:first.title,branding:first.branding});
  await vi.advanceTimersByTimeAsync(60000);expect(receive).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event('focus'));await vi.advanceTimersByTimeAsync(0);expect(receive).toHaveBeenLastCalledWith({title:next.title,branding:next.branding});
  stop();
});
