import * as THREE from 'three';
import { CLOUD_LAYER_PLAN } from '../sky/cloudLayers';
import { BackRainSim, GlassRainSim, paintBackRain, paintGlassRain } from '../sky/rain';
import { createSkylineGeometry, paintWindowWeather, PixelBuffer } from '../sky/skylinePainter';
import { lerpRgb } from '../sky/skyPhase';
import type { SkyPalette } from '../sky/skyPhase';
import { cloudLayerWeights } from '../sky/weather';
import type { WeatherVisualState } from '../sky/weather';
import { createCloudVolume, cloudStyleFromSearch } from './factory25dCloudVolume';
import type { CloudStyle } from './factory25dCloudVolume';
import { requireElement } from './dom';

/** A Three.js view of the existing factory cloud, snow and wet-glass models. */
export function createWindowWeather(scene: THREE.Scene, renderer: THREE.WebGLRenderer, width: number, height: number, centerY: number) {
  const pixelWidth = 640;
  const pixelHeight = Math.round(pixelWidth * height / width);
  const geometry = createSkylineGeometry(pixelWidth, pixelHeight);
  const rain = new BackRainSim(pixelWidth, pixelHeight);
  const glass = new GlassRainSim(pixelWidth, pixelHeight);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const plane = new THREE.PlaneGeometry(width, height);
  const loader = new THREE.TextureLoader();
  const clouds = CLOUD_LAYER_PLAN.map((spec, index) => {
    const filename = spec.texture.replace('sky_', '').replaceAll('_', '-');
    const texture = loader.load(`/skyline/${filename}.png`);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.RepeatWrapping;
    texture.offset.x = index * 0.18;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0 });
    // Like the live factory's snow tint-fill: lift the dark cloud pixels while
    // keeping the artwork's alpha and internal shape, rather than only tinting
    // their already-dark colors against a bright whiteout.
    const snowLift = { value: 0 };
    const snowColor = { value: new THREE.Color('#cdd9ed') };
    material.onBeforeCompile = shader => {
      shader.uniforms.snowLift = snowLift;
      shader.uniforms.snowColor = snowColor;
      shader.fragmentShader = `uniform float snowLift;\nuniform vec3 snowColor;\n${shader.fragmentShader}`
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, snowColor, snowLift);');
    };
    material.customProgramCacheKey = () => 'factory-weather-cloud-snow';
    const mesh = new THREE.Mesh(plane, material);
    // The nearest bank can drift across the peaks; all rain stays behind the
    // frame and the floor plants, inside exactly the same glass rectangle.
    mesh.position.set(0, centerY, index === 4 ? -4.53 : -4.61 + index * 0.012);
    scene.add(mesh);
    return { spec, texture, material, snowLift, snowColor, mesh };
  });
  const volume = createCloudVolume(renderer, width, height);
  const volumeMesh = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: volume.texture, transparent: true, depthWrite: false }));
  volumeMesh.position.set(0, centerY, -4.57);
  scene.add(volumeMesh);
  let style = cloudStyleFromSearch(location.search);
  const choices = (['painted', 'volume'] as const).map(value => ({ value, button: requireElement<HTMLButtonElement>(`#cloud-${value}`) }));
  function selectStyle(next: CloudStyle, persist = true) {
    style = next;
    clouds.forEach(cloud => { cloud.mesh.visible = style === 'painted'; });
    volumeMesh.visible = style === 'volume';
    choices.forEach(choice => choice.button.setAttribute('aria-pressed', String(choice.value === style)));
    if (!persist) return;
    const url = new URL(location.href);
    if (style === 'painted') url.searchParams.delete('clouds'); else url.searchParams.set('clouds', style);
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }
  choices.forEach(choice => choice.button.addEventListener('click', () => selectStyle(choice.value)));
  selectStyle(style, false);

  function pixelLayer(z: number) {
    const canvas = document.createElement('canvas');
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Weather preview could not create its glass layer');
    const frame = context.createImageData(pixelWidth, pixelHeight);
    const pixels = new PixelBuffer(pixelWidth, pixelHeight);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    const mesh = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
    mesh.position.set(0, centerY, z);
    mesh.visible = false;
    scene.add(mesh);
    return {
      pixels,
      mesh,
      upload() {
        frame.data.set(pixels.data);
        context.putImageData(frame, 0, 0);
        texture.needsUpdate = true;
      },
    };
  }
  const outside = pixelLayer(-4.49);
  const windowSurface = pixelLayer(-4.42);
  const mirrors: Array<{source: THREE.Mesh; copy: THREE.Mesh}> = [];
  let accumulated = 0;
  let motionTime = 0;
  let blank = true;
  return {
    mirrorOutside(parent: THREE.Scene, x: number) {
      // Share sky/cloud textures, but never copy the glass droplet surface outdoors.
      for (const source of [...clouds.map(cloud => cloud.mesh), volumeMesh, outside.mesh]) {
        const copy = source.clone(); copy.position.x += x; parent.add(copy); mirrors.push({source, copy});
      }
    },
    update(dt: number, weather: WeatherVisualState, palette: SkyPalette, arc = -3, night = false, visible = true) {
      mirrors.forEach(({source, copy}) => { copy.visible = source.visible; });
      const step = Math.min(Math.max(dt, 0), 0.1);
      const motionScale = reducedMotion.matches ? 0.2 : 1;
      volume.update(step * motionScale, weather, palette, arc, night, style === 'volume' && visible && !document.hidden);
      motionTime += step * motionScale;
      const weights = cloudLayerWeights(weather);
      for (const { spec, material, texture, snowLift, snowColor } of clouds) {
        texture.offset.x += spec.drift * (0.55 + weather.wind01 * 1.8) * step * motionScale / pixelWidth;
        const tint = lerpRgb(palette.cloud, palette.skyHorizon, spec.horizonMix);
        material.color.setRGB(tint[0] / 255, tint[1] / 255, tint[2] / 255, THREE.SRGBColorSpace);
        snowLift.value = weather.snow01 * 0.64;
        const lift = lerpRgb(palette.skyHorizon, [210, 224, 244], 0.62);
        snowColor.value.setRGB(lift[0] / 255, lift[1] / 255, lift[2] / 255, THREE.SRGBColorSpace);
        material.opacity = Math.min(0.88, weather.cloud01 * spec.weight(weights) * spec.alpha * (1 + weather.snow01 * 0.5));
      }
      accumulated += step;
      if (accumulated < (reducedMotion.matches ? 0.25 : 1 / 30)) return;
      rain.step(accumulated * motionScale, weather);
      glass.step(accumulated * motionScale, weather);
      accumulated = 0;
      const active = rain.streaks.length > 0 || !glass.isDry || weather.snow01 > 0.02 || weather.wet01 > 0.08;
      if (!active && blank) return;
      outside.pixels.data.fill(0);
      windowSurface.pixels.data.fill(0);
      if (active) {
        paintBackRain(outside.pixels, rain, palette, weather);
        // A continuous phase avoids snow jumping when rain/snow are blended.
        paintWindowWeather(windowSurface.pixels, geometry, { palette }, weather, motionTime / 12);
        paintGlassRain(windowSurface.pixels, glass, palette);
      }
      outside.mesh.visible = active;
      windowSurface.mesh.visible = active;
      outside.upload();
      windowSurface.upload();
      blank = !active;
    },
  };
}
