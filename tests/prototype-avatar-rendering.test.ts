import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_AVATAR } from '../shared/constants';

vi.mock('../client/rendering/avatarPainter', async importOriginal => ({
  ...await importOriginal<typeof import('../client/rendering/avatarPainter')>(), drawCharacter: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('document', {
    body: { classList: { add() {}, remove() {} } }, querySelector: () => null,
    createElement: () => ({ width: 0, height: 0, getContext: () => ({
      getImageData: (_x: number, _y: number, width: number, height: number) => {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let row = 0; row < height / 32; row++) for (let frame = 0; frame < 4; frame++)
          data[((row * 32 + 25 + frame) * width + frame * 32) * 4 + 3] = 255;
        return { data };
      },
    }) }),
  });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('shared avatar artwork', () => {
  it('reuses identical resolved looks, but repaints changed appearances and animation sets', async () => {
    const { avatarSheet } = await import('../client/prototypes/factory25dAvatar');
    const { drawCharacter } = await import('../client/rendering/avatarPainter');
    vi.mocked(drawCharacter).mockClear();
    const avatar = { ...DEFAULT_AVATAR }, sheet = avatarSheet(avatar);
    expect(drawCharacter).toHaveBeenCalledTimes(28);
    expect(avatarSheet({ ...avatar })).toBe(sheet);
    expect(drawCharacter).toHaveBeenCalledTimes(28);
    expect(sheet.feet.every(row => row.join() === '26,27,28,29')).toBe(true);
    avatar.shirtColor = '#abcdef'; expect(avatarSheet(avatar)).not.toBe(sheet);
    const portrait = avatarSheet(DEFAULT_AVATAR, ['idle']);
    expect(portrait.canvas.height).toBe(32); expect(portrait.feet).toEqual([[26, 27, 28, 29]]);
    expect(avatarSheet(DEFAULT_AVATAR, ['climb'])).not.toBe(portrait);
  });

  it('bounds color-picker cache growth while preserving recently used looks', async () => {
    const { avatarSheet } = await import('../client/prototypes/factory25dAvatar');
    const looks = Array.from({ length: 33 }, (_, i) => ({ ...DEFAULT_AVATAR, shirtColor: `#${i.toString(16).padStart(6, '0')}` }));
    const first = avatarSheet(looks[0]), second = avatarSheet(looks[1]);
    looks.slice(2, 32).forEach(look => avatarSheet(look));
    expect(avatarSheet(looks[0])).toBe(first);
    avatarSheet(looks[32]);
    expect(avatarSheet(looks[0])).toBe(first); expect(avatarSheet(looks[1])).not.toBe(second);
  });

  it('shares pixels without coupling animation offsets or texture disposal between agents', async () => {
    const { avatarTexture } = await import('../client/prototypes/factory25dAvatarTexture');
    const a = avatarTexture(DEFAULT_AVATAR), b = avatarTexture(DEFAULT_AVATAR);
    expect(a.sheet).toBe(b.sheet); expect(a.texture).not.toBe(b.texture);
    a.texture.offset.set(.5, .25); expect(b.texture.offset.toArray()).toEqual([0, 0]);
    const dispose = vi.fn(); b.texture.addEventListener('dispose', dispose);
    a.texture.dispose(); expect(dispose).not.toHaveBeenCalled();
    expect(b.texture.image).toBe(b.sheet.canvas); expect(b.texture.minFilter).toBe(THREE.NearestFilter);
    b.texture.dispose();
  });
});

describe('in-room avatar camera', () => {
  async function setup() {
    const { createAvatarStage } = await import('../client/prototypes/factory25dAvatarStage');
    const factory = new THREE.Scene(), patio = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-8, 8, 5.64, -5.64, .1, 50);
    camera.position.set(0, 9, 14.6); camera.lookAt(0, .35, .45);
    const canvas = { clientWidth: 1000, clientHeight: 800 }, renderer = { setSize: vi.fn() };
    const mesh = new THREE.Object3D(); mesh.position.set(1, .5, .6); factory.add(mesh);
    const entry = { mesh, baseHeight: .48, session: { sessionId: 'mine', ownerId: 'me', avatar: DEFAULT_AVATAR } };
    const agents = { entries: new Map([['mine', entry]]) };
    const stage = createAvatarStage(factory, patio, agents as unknown as Parameters<typeof createAvatarStage>[2],
      canvas as HTMLCanvasElement, renderer as unknown as THREE.WebGLRenderer, () => camera, () => 'mine');
    let now = 1000; vi.spyOn(performance, 'now').mockImplementation(() => now);
    stage.open({ ownerId: 'me' });
    return { stage, camera, canvas, renderer, mesh, factory, tick(time: number) { now = time; stage.update(now); } };
  }

  it('stops rebuilding the settled camera, then reframes after a viewport resize', async () => {
    const { stage, renderer, canvas, tick } = await setup();
    const clones = vi.spyOn(THREE.OrthographicCamera.prototype, 'clone');
    tick(1000); tick(1900);
    const projection = vi.spyOn(stage.camera, 'updateProjectionMatrix');
    for (let i = 0; i < 60; i++) tick(2000 + i * 16);
    expect(clones).not.toHaveBeenCalled(); expect(projection).not.toHaveBeenCalled();
    expect(renderer.setSize).toHaveBeenCalledOnce();
    canvas.clientWidth = 390; canvas.clientHeight = 844; tick(3000);
    expect(renderer.setSize).toHaveBeenCalledTimes(2); expect(projection).toHaveBeenCalledOnce();
    expect(stage.camera.top - stage.camera.bottom).toBeCloseTo(2.55);
    stage.dispose();
  });

  it('returns to the original framing and restores the real agent after an interrupted zoom', async () => {
    const { stage, mesh, factory, camera, tick } = await setup();
    tick(1100); expect(mesh.visible).toBe(false);
    stage.close(); tick(2000);
    expect(stage.isActive()).toBe(false); expect(mesh.visible).toBe(true);
    expect(stage.camera.position.distanceTo(camera.position)).toBeLessThan(1e-9);
    expect(stage.camera.quaternion.angleTo(camera.quaternion)).toBeLessThan(1e-6);
    expect(factory.children).toEqual([mesh]); stage.dispose();
  });
});
