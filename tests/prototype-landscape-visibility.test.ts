import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createMountainView } from '../client/prototypes/factory25dMountains';
import { CLEAR_WEATHER } from '../client/sky/weather';
import { paletteForElevation } from '../client/sky/skyPhase';

const calls = vi.hoisted(() => ({ render: vi.fn(), bear: vi.fn(), birds: vi.fn(), climbers: vi.fn() }));
vi.mock('../client/prototypes/factory25dLandscape', async () => {
  const THREE = await import('three');
  return { createUtahLandscape: () => ({ group: new THREE.Group(), hazeColor: { value: new THREE.Color() },
    snow: { value: 0 }, windStrength: { value: 0 }, windTime: { value: 0 }, heightAt: () => 0 }) };
});
vi.mock('../client/prototypes/factory25dBear', () => ({ createRidgeBear: () => ({ update: calls.bear }) }));
vi.mock('../client/prototypes/factory25dBirds', () => ({ createValleyBirds: () => ({ update: calls.birds }) }));
vi.mock('../client/prototypes/factory25dClimbers', () => ({ createMountainClimbers: () => ({ update: calls.climbers }) }));
vi.mock('../client/prototypes/factory25dFocus', () => ({ createLandscapeFocus: () => ({ render: calls.render }) }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('does no landscape rendering or visitor animation offscreen, then applies the latest weather on return', () => {
  const document = { hidden: false };
  vi.stubGlobal('document', document); vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
  const renderer = { getRenderTarget: () => null, getClearAlpha: () => 1, getClearColor() {}, setClearColor() {}, setRenderTarget() {} };
  const view = createMountainView(renderer as unknown as THREE.WebGLRenderer, 6);
  view.render(0, true); expect(calls.render).toHaveBeenCalledOnce();
  for (let i = 1; i <= 120; i++) view.render(i / 60, false);
  expect(calls.render).toHaveBeenCalledOnce(); expect(calls.climbers).toHaveBeenCalledOnce();
  const snow = { ...CLEAR_WEATHER, snow01: 1 };
  view.setEnvironment(0, snow, paletteForElevation(-20, false), true);
  view.render(2.01, false); expect(calls.render).toHaveBeenCalledOnce();
  view.render(2.02, true); expect(calls.render).toHaveBeenCalledTimes(2);
  expect(calls.climbers).toHaveBeenLastCalledWith(expect.closeTo(.01), true, false);
  expect(calls.birds).toHaveBeenLastCalledWith(expect.closeTo(.01), snow, true, false);
  document.hidden = true;
  view.render(3, true); expect(calls.render).toHaveBeenCalledTimes(2);
  document.hidden = false;
  view.render(3.016, true); expect(calls.render).toHaveBeenCalledTimes(3);
  expect(calls.bear).toHaveBeenLastCalledWith(expect.closeTo(.016), false);
});
