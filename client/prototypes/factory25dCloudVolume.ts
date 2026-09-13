import * as THREE from 'three';
import type { WeatherVisualState } from '../sky/weather';
import type { SkyPalette } from '../sky/skyPhase';
import { setAtmosphereHaze } from './factory25dAtmosphere';
import { CLOUD_FIGURE_GLSL, cloudFigureAt, cloudFigureCompanyAt, type CloudFigurePreview } from './factory25dCloudFigure';
import { CLOUD_COMPANY_MASK_SIZE, cloudCompanyMaskBytes } from './factory25dCloudCompanyMasks';

export type CloudStyle = 'painted' | 'volume';
export function cloudStyleFromSearch(search: string): CloudStyle {
  return new URLSearchParams(search).get('clouds') === 'painted' ? 'painted' : 'volume';
}

/** A low-resolution density volume, shaded by samples toward the current sun/moon. */
export function createCloudVolume(renderer: THREE.WebGLRenderer, width: number, height: number, cloudyBillows = true, figurePreview: CloudFigurePreview = 'auto') {
  // Hardware-filtered density noise replaces eight trigonometric hashes per
  // sample. The 32 KiB field is shared by the view and sunlight rays.
  const noiseData = new Uint8Array(32 ** 3);
  let seed = 0x61c88647;
  for (let i = 0; i < noiseData.length; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    noiseData[i] = seed >>> 24;
  }
  const noise = new THREE.Data3DTexture(noiseData, 32, 32, 32);
  noise.format = THREE.RedFormat; noise.type = THREE.UnsignedByteType;
  noise.minFilter = noise.magFilter = THREE.LinearFilter;
  noise.wrapS = noise.wrapT = noise.wrapR = THREE.RepeatWrapping;
  noise.unpackAlignment = 1; noise.generateMipmaps = false; noise.needsUpdate = true;
  const masks = new THREE.DataTexture(cloudCompanyMaskBytes(), CLOUD_COMPANY_MASK_SIZE * 3, CLOUD_COMPANY_MASK_SIZE,
    THREE.RedFormat, THREE.UnsignedByteType);
  masks.minFilter = masks.magFilter = THREE.LinearFilter;
  masks.generateMipmaps = false; masks.needsUpdate = true;
  const uniforms = {
    cloudNoise: { value: noise },
    cloudSize: { value: new THREE.Vector2(width, height) },
    cloudTime: { value: 0 },
    cloudCover: { value: 0 },
    cloudFlash: { value: 0 },
    cloudDeck: { value: 0 },
    cloudBillows: { value: 0 },
    cloudLight: { value: new THREE.Vector3(-1, 1.5, 1.5) },
    cloudLit: { value: new THREE.Color() },
    cloudShade: { value: new THREE.Color() },
    cloudHaze: { value: new THREE.Color() },
    cloudFigure: { value: new THREE.Vector3() },
    cloudFigureMasks: { value: masks },
    cloudFigureCompany: { value: -1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false,
    vertexShader: `varying vec2 uvCloud;
      void main() { uvCloud = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `precision highp float;
      varying vec2 uvCloud;
      uniform vec2 cloudSize;
      uniform sampler3D cloudNoise;
      uniform sampler2D cloudFigureMasks;
      uniform float cloudFigureCompany;
      uniform float cloudTime, cloudCover, cloudDeck, cloudFlash, cloudBillows;
      uniform vec3 cloudLight, cloudLit, cloudShade, cloudHaze, cloudFigure;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise3(vec3 p) {
        vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return texture(cloudNoise, (floor(p) + f + 0.5) / 32.0).r;
      }
      float roundedUnion(float a, float b, float softness) {
        float overlap = max(softness - abs(a - b), 0.0) / softness;
        return max(a, b) + overlap * overlap * softness * 0.25;
      }
      ${CLOUD_FIGURE_GLSL}
      float deckBase(vec2 ground) {
        float fold = noise3(vec3(ground.x * 1.25, ground.y * 1.7, 7.3));
        float billow = noise3(vec3(ground.x * 3.6, ground.y * 4.2, 11.7));
        return cloudSize.y * mix(0.69, 0.54, cloudDeck)
          + (fold - 0.5) * 0.78 + (billow - 0.5) * 0.16;
      }
      float billowDensity(vec3 p) {
        float field = -1.0;
        // Equal-sized clouds occupy a horizontal X/Z layer. Perspective, not
        // hand-scaled rows, makes the distant ones smaller. Four neighboring
        // cells cover every lobe, using fewer samples than the old six puffs.
        vec2 spacing = vec2(8.6, 6.8);
        vec2 cell = floor(p.xz / spacing - 0.5);
        for (int z = 0; z < 2; z++) {
          for (int x = 0; x < 2; x++) {
            vec2 id = cell + vec2(float(x), float(z));
            float seed = hash(vec3(id, 3.0));
            float shape = hash(vec3(id, 9.0));
            if (shape < 0.12) continue;
            vec2 ground = (id + 0.5) * spacing + vec2(seed - 0.5, shape - 0.5) * vec2(2.4, 2.6);
            vec3 center = vec3(ground.x, 2.95 + (seed - 0.5) * 0.34, ground.y);
            vec3 q = p - center;
            float spread = 2.05 + seed * 0.4;
            float handed = shape < 0.5 ? -1.0 : 1.0;
            q.x *= handed;
            float puff = 1.0 - length(q / vec3(spread, 0.38, 1.65));
            puff = roundedUnion(puff, 1.0 - length((q - vec3(-spread * 0.44, 0.36, 0.32))
              / vec3(0.83 + seed * 0.16, 0.64, 0.95)), 0.2);
            puff = roundedUnion(puff, 1.0 - length((q - vec3(spread * 0.19, 0.52 + shape * 0.22, -0.4))
              / vec3(0.85, 0.76 + shape * 0.24, 1.02)), 0.18);
            puff = roundedUnion(puff, 1.0 - length((q - vec3(spread * 0.65, 0.17, 0.5))
              / vec3(0.67, 0.48 + seed * 0.16, 0.65)), 0.16);
            // A shared condensation level, softened by low-frequency erosion.
            float base = smoothstep(-0.38, -0.18, q.y);
            field = max(field, puff - (1.0 - base) * 1.8);
          }
        }
        // Broad erosion breaks the spherical lobes into folds; fine noise only
        // feathers their silhouette instead of frosting the entire volume.
        float erosion = (noise3(p * 2.6) - 0.5) * 0.30
          + (noise3(p * 7.2) - 0.5) * 0.06;
        return smoothstep(-0.10, 0.27, field + erosion) * cloudCover;
      }
      float density(vec3 p) {
        if (cloudBillows > 0.5) {
          vec3 wind = vec3(cloudTime * 0.035, 0.0, 0.0);
          return figureDensity(p, billowDensity(p + wind));
        }
        p.x += cloudTime * 0.035;
        // Rain is an unbroken, deep layer whose top continues beyond the
        // window. Broad folds and a shallow lower bank give its underside
        // volume; no repeated ellipsoid silhouettes or gaps at pane edges.
        float sheet = 0.0;
        if (cloudDeck > 0.001) {
          float ripple = noise3(p * vec3(1.7, 2.4, 1.3));
          float base = deckBase(p.xz) + (ripple - 0.5) * 0.12;
          float belly = smoothstep(base - 0.08, base + 0.5, p.y);
          float thickness = 0.48 + noise3(p * vec3(0.8, 1.5, 0.65)) * 0.62;
          sheet = belly * thickness * (1.0 - smoothstep(4.8, 5.6, p.y));
          // A second, lower fold drifts independently beneath the ceiling.
          float lower = noise3(vec3(p.x * 0.36 - cloudTime * 0.008, p.z * 0.8, 12.7));
          float wisp = smoothstep(0.48, 0.76, lower)
            * smoothstep(base - 0.22, base - 0.04, p.y)
            * (1.0 - smoothstep(base + 0.12, base + 0.36, p.y));
          sheet = max(sheet, wisp * 0.6);
        }
        if (cloudDeck > 0.999) return sheet * cloudCover;
        float field = -1.0;
        // Two depths: lower, smaller banks recede toward the horizon. Rounded
        // joined lobes retain broad undersides without identical oval caps.
        for (int bank = 0; bank < 2; bank++) {
          float farBank = float(bank), scale = mix(1.0, 0.54, farBank);
          float spacing = 3.8 * scale;
          float shiftedX = p.x + farBank * 1.71;
          float cell = floor(shiftedX / spacing);
          for (int i = -1; i <= 1; i++) {
            float id = cell + float(i);
            float seed = hash(vec3(id, 8.0 + farBank, 3.0));
            float shape = hash(vec3(id, 2.7, 9.0 + farBank));
            vec3 center = vec3((id + 0.5) * spacing - farBank * 1.71 + (seed - 0.5) * scale,
              cloudSize.y * mix(0.75, 0.57, farBank) + (shape - 0.5) * 0.6 * scale,
              mix(0.6, -1.6, farBank) + (seed - 0.5) * 0.4);
            vec3 radius = vec3(0.7 + seed * 0.52 + cloudCover * 0.18,
              0.3 + shape * 0.36, 0.7 + shape * 0.45) * scale;
            vec3 q = p - center;
            float puff = 1.0 - length(q / radius);
            puff = roundedUnion(puff, 0.84 - length((q - vec3(-radius.x * 0.72, -radius.y * 0.2, 0.11 * scale)) / (radius * vec3(0.86, 0.78, 0.9))), 0.25);
            puff = roundedUnion(puff, 0.88 - length((q - vec3(radius.x * 0.72, -radius.y * 0.32, -0.08 * scale)) / (radius * vec3(0.76, 0.66, 0.8))), 0.22);
            puff = roundedUnion(puff, 0.66 - length((q - vec3(radius.x * 0.18, radius.y * 0.38, 0.05)) / (radius * vec3(0.68, 0.72, 0.8))), 0.18);
            float base = smoothstep(center.y - radius.y * 0.68, center.y - radius.y * 0.4, p.y);
            field = max(field, puff - (1.0 - base) * 2.0);
          }
        }
        float billow = (noise3(p * 4.8) - 0.5) * 0.3 + (noise3(p * 11.0) - 0.5) * 0.07;
        float puffs = clamp((field + billow - 0.04) * 4.2, 0.0, 1.0);
        return mix(puffs, sheet, cloudDeck) * cloudCover;
      }
      void main() {
        if ((cloudCover < 0.01 && cloudFigure.x < 0.001) || uvCloud.y < 0.3) {
          gl_FragColor = vec4(0.0); return;
        }
        vec3 ray = vec3((uvCloud.x - 0.5) * cloudSize.x, uvCloud.y * cloudSize.y, 2.8);
        // Look up from below the overcast. Parallel cross-section rays would
        // see an opaque wall of density, erasing the ceiling's lower folds.
        vec3 upwardRay = normalize(vec3((uvCloud.x - 0.5) * 2.8, 0.13 + uvCloud.y * 0.9, -1.0));
        // Intersect the overhead layer, then spend every step inside it.
        // The window aspect preserves cloud proportions. Shallow rays travel
        // farther toward the shared horizon and see foreshortened undersides.
        vec3 skyRay = normalize(vec3((uvCloud.x - 0.5) * 3.0,
          (uvCloud.y - 0.48) * 3.0 * cloudSize.y / cloudSize.x, -1.0));
        float layerEntry = 2.25 / max(skyRay.y, 0.001);
        float layerExit = min(5.2 / max(skyRay.y, 0.001), 90.0);
        float layerStep = max(0.0, layerExit - layerEntry) / 40.0;
        if (cloudBillows > 0.5 && layerStep <= 0.0) { gl_FragColor = vec4(0.0); return; }
        vec3 radiance = vec3(0.0);
        float alpha = 0.0;
        float ceilingLight = -1.0;
        float figureBounce = -1.0;
        // Use 40 x 4 cloud candidates instead of 28 x 6. Closer samples reduce
        // bands on the shallow horizon rays. Other skies keep their 28 steps.
        for (int step = 0; step < 40; step++) {
          if (cloudBillows < 0.5 && step >= 28) break;
          vec3 p = ray - vec3(0.0, 0.0, float(step) * 0.2);
          vec3 belowDeck = vec3(0.0, 0.15, 3.0) + upwardRay * (float(step) + 0.5) * 0.62;
          p = mix(p, belowDeck, cloudDeck);
          float skyDistance = layerEntry + (float(step) + 0.5) * layerStep;
          if (cloudBillows > 0.5) p = skyRay * skyDistance;
          float d = density(p);
          if (d < 0.01) continue;
          if (cloudDeck > 0.001 && ceilingLight < 0.0) {
            // Diffuse sky bounce describes the first visible lower surface;
            // sunlight samples below still shade the volume behind it.
            vec2 ground = p.xz + vec2(cloudTime * 0.035, 0.0);
            vec3 underside = normalize(vec3(
              deckBase(ground + vec2(0.12, 0.0)) - deckBase(ground - vec2(0.12, 0.0)),
              -0.24,
              deckBase(ground + vec2(0.0, 0.12)) - deckBase(ground - vec2(0.0, 0.12))));
            ceilingLight = clamp(0.22 + dot(underside, normalize(vec3(-0.65, -0.55, 0.4))) * 0.72, 0.08, 0.9);
          }
          float occlusion = density(p + cloudLight * 0.32)
            + density(p + cloudLight * 0.75) * 0.8
            + density(p + cloudLight * 1.4) * 0.45;
          float light = exp(-occlusion * mix(mix(3.4, 3.3, cloudBillows), 0.95, cloudDeck));
          // Sky bounce keeps dense bellies blue; only the sun-facing, thinner
          // edges reach the bright cap. Avoid a luminous ring around every puff.
          float body = noise3(p * vec3(1.4, 2.2, 1.4));
          light *= 0.76 + body * 0.24;
          // Larger connected tone clusters, rather than a bright outline.
          float underfold = noise3(p * vec3(0.66, 1.35, 0.62));
          light = mix(light, ceilingLight * 0.82 + light * 0.12 + underfold * 0.06, cloudDeck);
          if (cloudFigure.x > 0.001) {
            float figureBody = figureDensity(p, 0.0);
            if (figureBody > 0.05) {
              if (figureBounce < 0.0) figureBounce = figureSkylight(p);
              light = mix(light, min(0.95, light * 0.68 + figureBounce * 0.52),
                min(1.0, figureBody) * cloudFigure.x);
            }
          }
          if (cloudBillows < 0.5) light = floor(light * 6.0 + 0.5) / 6.0;
          else light = floor(light * 32.0 + 0.5) / 32.0;
          float bounce = mix(0.08, 0.17, cloudBillows);
          vec3 shade = mix(cloudShade, cloudLit, bounce + light * mix(1.0 - bounce, 0.78, cloudDeck));
          float distantAir = mix(0.58, 1.0, smoothstep(-1.7, 0.0, p.z));
          float opacity = 1.0 - exp(-d * mix(0.64 * distantAir, 0.38, cloudDeck));
          if (cloudBillows > 0.5) {
            float aerialDepth = 1.0 - exp(-max(skyDistance - 6.0, 0.0) * 0.025);
            shade = mix(shade, cloudHaze, aerialDepth * 0.82);
            opacity = 1.0 - exp(-d * layerStep * 2.4);
          }
          radiance += (1.0 - alpha) * opacity * shade;
          alpha += (1.0 - alpha) * opacity;
          if (alpha > 0.985) break;
        }
        // Quantize within the weather palette, not each RGB channel (which
        // introduced green/grey contour fringes between otherwise blue tones).
        vec3 shaded = radiance / max(alpha, 0.001);
        vec3 range = cloudLit - cloudShade;
        float tone = clamp(dot(shaded - cloudShade, range) / max(dot(range, range), 0.0001), 0.0, 1.0);
        float tones = mix(8.0, 32.0, cloudBillows);
        tone = floor(tone * tones + 0.5) / tones;
        float pixelAlpha = floor(smoothstep(0.05, 0.64, alpha) * 8.0 + 0.5) / 8.0;
        if (cloudBillows > 0.5) pixelAlpha = floor(smoothstep(0.02, 0.94, alpha) * 16.0 + 0.5) / 16.0;
        vec3 cloudColor = mix(cloudShade, cloudLit, tone);
        // Preserve the depth-dependent blue air; projecting it back onto a
        // single grey-to-white ramp would discard the atmospheric perspective.
        if (cloudBillows > 0.5) cloudColor = shaded;
        cloudColor = mix(cloudColor, vec3(0.68, 0.8, 1.0), cloudFlash * (0.45 + tone * 0.35));
        gl_FragColor = vec4(cloudColor, pixelAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material); scene.add(quad);
  const camera = new THREE.Camera();
  const target = new THREE.WebGLRenderTarget(640, Math.round(640 * height / width), {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    generateMipmaps: false, depthBuffer: false,
  });
  const previousColor = new THREE.Color();
  let elapsed = 0;
  let figureElapsed = 0;
  let sinceFrame = Infinity;
  const color = (rgb: readonly number[]) => new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
  let disposed = false;
  return {
    texture: target.texture,
    update(dt: number, weather: WeatherVisualState, palette: SkyPalette, arc: number, night: boolean, active: boolean, lightning = 0) {
      if (disposed) return;
      // A slow overhead drift, with a restrained response to stronger wind.
      elapsed += dt * (0.28 + THREE.MathUtils.clamp(weather.wind01, 0, 1) * 0.8);
      if (weather.mode !== 'cloudy' || night || weather.rain01 > 0 || weather.snow01 > 0) figureElapsed = 0;
      else if (active) figureElapsed += Math.max(0, Math.min(dt, 0.1));
      sinceFrame += dt;
      const flash=THREE.MathUtils.clamp(lightning,0,1);
      if (!active || sinceFrame < 1 / 12 && Math.abs(flash-uniforms.cloudFlash.value)<.015) return;
      sinceFrame = 0;
      uniforms.cloudTime.value = elapsed;
      uniforms.cloudCover.value = weather.cloud01;
      uniforms.cloudFlash.value = flash;
      const precipitation = Math.max(weather.rain01, weather.snow01);
      const deck = THREE.MathUtils.smoothstep(precipitation, 0, 0.8);
      uniforms.cloudDeck.value = Math.max(deck,
        THREE.MathUtils.smoothstep(weather.cloud01, 0.8, 1) * weather.cloudForm01);
      // Clear skies keep one softly lit Fluid cloud without adding weather cover.
      const clearBrand = weather.mode === 'clear' && precipitation === 0 && figurePreview !== 'off';
      // Other weather retains its existing formation and lighting.
      uniforms.cloudBillows.value = Number(cloudyBillows && (clearBrand || weather.mode === 'cloudy' && !night)
        && precipitation === 0 && uniforms.cloudDeck.value === 0);
      const figure = clearBrand
        ? { presence: .85, shape: 1, drift: 3 + Math.sin(elapsed * .025) * .18 }
        : cloudFigureAt(figureElapsed, figurePreview);
      uniforms.cloudFigureCompany.value = clearBrand ? -1 : cloudFigureCompanyAt(figureElapsed, figurePreview);
      // Company-specific cloud marks stay disabled until custom cloud masks are supported.
      uniforms.cloudFigure.value.set(0,
        figure.shape, figure.drift);
      uniforms.cloudLight.value.set(arc * 0.35, 1.55 - Math.abs(arc) * 0.12, -0.35).normalize();
      uniforms.cloudLit.value.copy(color(palette.cloud));
      if (!night) {
        uniforms.cloudLit.value.lerp(color(palette.sun), 0.12 * (1 - weather.rain01));
        const horizon = Math.pow(Math.min(1, Math.abs(arc) / 7), 1.35);
        uniforms.cloudLit.value.lerp(color(palette.skyHorizon), horizon * .42 * (1 - weather.rain01));
      } else uniforms.cloudLit.value.lerp(color(palette.skyHorizon), .58).multiplyScalar(.85);
      uniforms.cloudShade.value.copy(color(palette.cloud)).multiplyScalar(0.24).lerp(color(palette.skyTop), 0.4);
      setAtmosphereHaze(uniforms.cloudHaze.value, palette, night);
      if (uniforms.cloudBillows.value > 0.5) {
        uniforms.cloudShade.value.copy(uniforms.cloudHaze.value).multiplyScalar(.64)
          .lerp(uniforms.cloudLit.value, .06);
      }
      if (night) uniforms.cloudShade.value.multiplyScalar(.7);
      // A storm is mostly sky-lit from within the deck, with subdued rims.
      // Night inherits the current sky palette instead of a bright white cap.
      uniforms.cloudLit.value.lerp(color(palette.skyHorizon), uniforms.cloudDeck.value * (night ? 0.78 : 0.52));
      uniforms.cloudShade.value.lerp(color(palette.skyTop), uniforms.cloudDeck.value * 0.22);
      const oldTarget = renderer.getRenderTarget();
      const oldAlpha = renderer.getClearAlpha();
      renderer.getClearColor(previousColor);
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.render(scene, camera);
      renderer.setRenderTarget(oldTarget);
      renderer.setClearColor(previousColor, oldAlpha);
    },
    dispose() { if (disposed) return; disposed = true; noise.dispose(); masks.dispose(); target.dispose(); material.dispose(); quad.geometry.dispose(); },
  };
}
