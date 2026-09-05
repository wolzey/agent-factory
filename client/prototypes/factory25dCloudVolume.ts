import * as THREE from 'three';
import type { WeatherVisualState } from '../sky/weather';
import type { SkyPalette } from '../sky/skyPhase';

export type CloudStyle = 'painted' | 'volume';
export function cloudStyleFromSearch(search: string): CloudStyle {
  return new URLSearchParams(search).get('clouds') === 'volume' ? 'volume' : 'painted';
}

/** A low-resolution density volume, shaded by samples toward the current sun/moon. */
export function createCloudVolume(renderer: THREE.WebGLRenderer, width: number, height: number) {
  const uniforms = {
    cloudSize: { value: new THREE.Vector2(width, height) },
    cloudTime: { value: 0 },
    cloudCover: { value: 0 },
    cloudDeck: { value: 0 },
    cloudLight: { value: new THREE.Vector3(-1, 1.5, 1.5) },
    cloudLit: { value: new THREE.Color() },
    cloudShade: { value: new THREE.Color() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false,
    vertexShader: `varying vec2 uvCloud;
      void main() { uvCloud = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `precision highp float;
      varying vec2 uvCloud;
      uniform vec2 cloudSize;
      uniform float cloudTime, cloudCover, cloudDeck;
      uniform vec3 cloudLight, cloudLit, cloudShade;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise3(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                       mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                       mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float deckBase(vec2 ground) {
        float fold = noise3(vec3(ground.x * 1.25, ground.y * 1.7, 7.3));
        float billow = noise3(vec3(ground.x * 3.6, ground.y * 4.2, 11.7));
        return cloudSize.y * mix(0.69, 0.54, cloudDeck)
          + (fold - 0.5) * 0.78 + (billow - 0.5) * 0.16;
      }
      float density(vec3 p) {
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
        float cell = floor(p.x / 4.1);
        float field = -1.0;
        for (int i = -1; i <= 1; i++) {
          float id = cell + float(i);
          float seed = hash(vec3(id, 8.0, 3.0));
          vec3 center = vec3((id + 0.5) * 4.1, cloudSize.y * 0.7 + seed * 0.22 - cloudCover * 0.08, seed - 0.5);
          vec3 radius = vec3(0.95 + seed * 0.35 + cloudCover * 0.3, 0.35 + cloudCover * 0.3 + seed * 0.12, 0.9 + seed * 0.55);
          vec3 q = (p - center) / radius;
          float puff = 1.0 - length(q);
          puff = max(puff, 0.83 - length((p - center - vec3(-0.8, -0.1, 0.2)) / radius));
          puff = max(puff, 0.76 - length((p - center - vec3(0.85, -0.14, -0.15)) / radius));
          float base = smoothstep(center.y - radius.y * 0.8, center.y - radius.y * 0.48, p.y);
          field = max(field, puff - (1.0 - base) * 2.0);
        }
        float billow = (noise3(p * 2.8) - 0.5) * 0.18;
        float puffs = clamp((field + billow - 0.08) * 3.4, 0.0, 1.0);
        return mix(puffs, sheet, cloudDeck) * cloudCover;
      }
      void main() {
        if (cloudCover < 0.01 || uvCloud.y < 0.3) {
          gl_FragColor = vec4(0.0); return;
        }
        vec3 ray = vec3((uvCloud.x - 0.5) * cloudSize.x, uvCloud.y * cloudSize.y, 2.8);
        // Look up from below the overcast. Parallel cross-section rays would
        // see an opaque wall of density, erasing the ceiling's lower folds.
        vec3 upwardRay = normalize(vec3((uvCloud.x - 0.5) * 2.8, 0.13 + uvCloud.y * 0.9, -1.0));
        vec3 radiance = vec3(0.0);
        float alpha = 0.0;
        float ceilingLight = -1.0;
        for (int step = 0; step < 28; step++) {
          vec3 p = ray - vec3(0.0, 0.0, float(step) * 0.2);
          vec3 belowDeck = vec3(0.0, 0.15, 3.0) + upwardRay * (float(step) + 0.5) * 0.62;
          p = mix(p, belowDeck, cloudDeck);
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
          float light = exp(-occlusion * mix(2.2, 0.95, cloudDeck));
          // Larger connected tone clusters, rather than a bright outline.
          float underfold = noise3(p * vec3(0.66, 1.35, 0.62));
          light = mix(light, ceilingLight * 0.82 + light * 0.12 + underfold * 0.06, cloudDeck);
          light = floor(light * 6.0 + 0.5) / 6.0;
          vec3 shade = mix(cloudShade, cloudLit, 0.08 + light * mix(0.92, 0.78, cloudDeck));
          float opacity = 1.0 - exp(-d * 0.38);
          radiance += (1.0 - alpha) * opacity * shade;
          alpha += (1.0 - alpha) * opacity;
          if (alpha > 0.985) break;
        }
        // Quantize within the weather palette, not each RGB channel (which
        // introduced green/grey contour fringes between otherwise blue tones).
        vec3 shaded = radiance / max(alpha, 0.001);
        vec3 range = cloudLit - cloudShade;
        float tone = clamp(dot(shaded - cloudShade, range) / max(dot(range, range), 0.0001), 0.0, 1.0);
        tone = floor(tone * 8.0 + 0.5) / 8.0;
        float pixelAlpha = floor(smoothstep(0.08, 0.72, alpha) * 5.0 + 0.5) / 5.0;
        gl_FragColor = vec4(mix(cloudShade, cloudLit, tone), pixelAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  const camera = new THREE.Camera();
  const target = new THREE.WebGLRenderTarget(640, Math.round(640 * height / width), {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    generateMipmaps: false, depthBuffer: false,
  });
  const previousColor = new THREE.Color();
  let elapsed = 0;
  let sinceFrame = Infinity;
  const color = (rgb: readonly number[]) => new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
  return {
    texture: target.texture,
    update(dt: number, weather: WeatherVisualState, palette: SkyPalette, arc: number, night: boolean, active: boolean) {
      elapsed += dt * (0.55 + weather.wind01 * 1.8);
      sinceFrame += dt;
      if (!active || sinceFrame < 1 / 12) return;
      sinceFrame = 0;
      uniforms.cloudTime.value = elapsed;
      uniforms.cloudCover.value = weather.cloud01;
      const precipitation = Math.max(weather.rain01, weather.snow01);
      const deck = THREE.MathUtils.smoothstep(precipitation, 0, 0.8);
      uniforms.cloudDeck.value = Math.max(deck,
        THREE.MathUtils.smoothstep(weather.cloud01, 0.8, 1) * weather.cloudForm01);
      uniforms.cloudLight.value.set(arc * 0.35, 1.55 - Math.abs(arc) * 0.12, -0.35).normalize();
      uniforms.cloudLit.value.copy(color(palette.cloud));
      if (!night) uniforms.cloudLit.value.lerp(color(palette.sun), 0.12 * (1 - weather.rain01));
      uniforms.cloudShade.value.copy(color(palette.cloud)).multiplyScalar(0.31).lerp(color(palette.skyTop), 0.32);
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
  };
}
