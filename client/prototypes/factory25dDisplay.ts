import * as THREE from 'three';
import { requireElement } from './dom';
import { FOCUS_GLSL } from './factory25dFocus';

type DisplayLook = 'clean' | 'crt' | 'phosphor';

/** Opt-in screen study. Only the final scene is filtered; DOM controls stay crisp. */
export function createDisplayStudy(renderer: THREE.WebGLRenderer) {
  const controls = requireElement<HTMLElement>('#display-study');
  const buttons = [...controls.querySelectorAll<HTMLButtonElement>('[data-display]')];
  const params = new URLSearchParams(location.search);
  const query = params.get('display');
  let look: DisplayLook = query === 'crt' || query === 'phosphor' ? query : 'clean';
  let dof = params.get('dof') === 'on';
  let landscape: 'current' | 'blender' = 'current';
  controls.hidden = !['clean', 'crt', 'phosphor'].includes(query ?? '') && !params.has('landscape') && !params.has('dof');
  const terrainButtons = [...controls.querySelectorAll<HTMLButtonElement>('[data-landscape]')];
  const focusButton = requireElement<HTMLButtonElement>('#display-focus');
  const status = requireElement<HTMLElement>('#display-study-status');
  let selectLandscape: ((style: 'current' | 'blender') => Promise<void>) | undefined;
  let selection = 0;
  let target: THREE.WebGLRenderTarget | undefined;
  let filteringFrame = false;
  const size = new THREE.Vector2();
  const uniforms = {
    sceneImage: { value: null as THREE.Texture | null },
    imageSize: { value: size },
    strength: { value: 0 },
    depthImage: { value: null as THREE.DepthTexture | null },
    cameraRange: { value: new THREE.Vector2() },
    focusDistance: { value: 14 }, focusRange: { value: 2.5 }, focusRadius: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: `varying vec2 screenUv;
      void main() { screenUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      varying vec2 screenUv;
      uniform sampler2D sceneImage;
      uniform vec2 imageSize;
      uniform float strength;
      ${FOCUS_GLSL}
      void main() {
        vec2 texel = 1.0 / imageSize;
        vec3 center = focusImage(sceneImage, screenUv, texel).rgb;
        if (strength < 0.01) {
          gl_FragColor = vec4(center, 1.0);
          #include <colorspace_fragment>
          return;
        }
        vec2 fringe = vec2(texel.x * strength * 0.65, 0.0);
        vec3 fringed = vec3(texture2D(sceneImage, screenUv + fringe).r,
                           center.g, texture2D(sceneImage, screenUv - fringe).b);
        vec3 signal = mix(fringed, center, step(0.01, focusRadius));
        vec3 spread = (texture2D(sceneImage, screenUv + texel * vec2(1.4, 0.0)).rgb
                     + texture2D(sceneImage, screenUv - texel * vec2(1.4, 0.0)).rgb
                     + texture2D(sceneImage, screenUv + texel * vec2(0.0, 1.4)).rgb
                     + texture2D(sceneImage, screenUv - texel * vec2(0.0, 1.4)).rgb) * 0.25;
        // Small bright details bleed into adjacent phosphors, without a
        // full-resolution bloom pyramid or lifting every dark surface.
        signal = mix(signal, spread, 0.12 * strength);
        signal += max(spread - vec3(0.26), vec3(0.0)) * strength * 0.18;
        gl_FragColor = vec4(signal, 1.0);
        #include <colorspace_fragment>
        // The mask belongs to the display, so apply it after linear -> sRGB.
        // A stable pattern avoids flicker and respects reduced-motion users.
        float row = 0.5 + 0.5 * cos(gl_FragCoord.y * 2.0943951);
        float column = mod(floor(gl_FragCoord.x), 3.0);
        vec3 mask = column < 1.0 ? vec3(1.0, 0.91, 0.91)
                  : column < 2.0 ? vec3(0.91, 1.0, 0.91) : vec3(0.91, 0.91, 1.0);
        gl_FragColor.rgb *= (1.0 - row * strength * 0.14) * mix(vec3(1.0), mask, strength);
        vec2 edge = abs(screenUv * 2.0 - 1.0);
        float vignette = smoothstep(0.4, 1.35, length(edge));
        gl_FragColor.rgb *= 1.0 + strength * (0.075 - vignette * 0.12);
      }`,
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  const screen = new THREE.Scene();
  screen.add(new THREE.Mesh(geometry, material));
  const camera = new THREE.Camera();

  function updateControls() {
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.display === look)));
    terrainButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.landscape === landscape)));
    focusButton.setAttribute('aria-pressed', String(dof));
  }
  function releaseTarget() {
    target?.dispose();
    target = undefined;
    uniforms.sceneImage.value = null;
    uniforms.depthImage.value = null;
  }
  function updateUrl() {
    const url = new URL(location.href);
    url.searchParams.set('display', look);
    url.searchParams.set('landscape', landscape);
    url.searchParams.set('dof', dof ? 'on' : 'off');
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }
  async function changeLandscape(style: 'current' | 'blender') {
    if (!selectLandscape) return;
    const request = ++selection;
    status.textContent = style === 'blender' ? 'loading Blender mountains…' : '';
    try {
      await selectLandscape(style);
      if (request !== selection) return;
      landscape = style; updateControls(); updateUrl();
      status.textContent = '';
    } catch {
      if (request === selection) status.textContent = 'mountains could not load · tap Blender to retry';
    }
  }
  const events = new AbortController();
  buttons.forEach(button => button.addEventListener('click', () => {
    look = button.dataset.display as DisplayLook;
    if (look === 'clean') releaseTarget();
    updateUrl();
    updateControls();
  }, { signal: events.signal }));
  terrainButtons.forEach(button => button.addEventListener('click', () => {
    void changeLandscape(button.dataset.landscape as 'current' | 'blender');
  }, { signal: events.signal }));
  focusButton.addEventListener('click', () => {
    dof = !dof; releaseTarget(); updateControls(); updateUrl();
  }, { signal: events.signal });
  requireElement<HTMLButtonElement>('#display-study-close').addEventListener('click', () => {
    look = 'clean';
    dof = false; landscape = 'current'; ++selection;
    void selectLandscape?.('current');
    releaseTarget();
    controls.hidden = true;
    const url = new URL(location.href);
    url.searchParams.delete('display');
    url.searchParams.delete('landscape'); url.searchParams.delete('dof');
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    const classes = document.body.classList;
    const returnButton = classes.contains('inspect-open') ? '#inspect-back'
      : classes.contains('weather-open') ? '#window-back'
      : classes.contains('board-open') ? '#board-back'
      : classes.contains('secondary-room') ? '#room-return' : '#window-open';
    requireElement<HTMLButtonElement>(returnButton).focus({ preventScroll: true });
  }, { signal: events.signal });
  updateControls();

  return {
    get depthOfField() { return dof; },
    connectLandscape(handler: NonNullable<typeof selectLandscape>) {
      selectLandscape = handler;
      if (params.get('landscape') === 'blender') void changeLandscape('blender');
    },
    begin(viewCamera: THREE.OrthographicCamera, focusPoint: THREE.Vector3, closeUp: boolean, outside: boolean) {
      filteringFrame = look !== 'clean' || (dof && !outside);
      if (!filteringFrame) {
        if (target) releaseTarget();
        return;
      }
      renderer.getDrawingBufferSize(size);
      if (!target) {
        // Half-float keeps the existing lighting precision through the extra
        // pass. All source rendering remains at the existing pixel resolution.
        target = new THREE.WebGLRenderTarget(size.x, size.y, {
          type: renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType,
          minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
          generateMipmaps: false,
          depthTexture: new THREE.DepthTexture(size.x, size.y, THREE.UnsignedIntType),
        });
        uniforms.sceneImage.value = target.texture;
        uniforms.depthImage.value = target.depthTexture;
      } else if (target.width !== size.x || target.height !== size.y) {
        target.setSize(size.x, size.y);
      }
      uniforms.strength.value = look === 'clean' ? 0 : look === 'crt' ? 0.38 : 1;
      uniforms.cameraRange.value.set(viewCamera.near, viewCamera.far);
      uniforms.focusDistance.value = -focusPoint.applyMatrix4(viewCamera.matrixWorldInverse).z;
      uniforms.focusRange.value = closeUp ? 0.45 : 4;
      uniforms.focusRadius.value = dof && !outside ? (closeUp ? 2.2 : 0.75) : 0;
      renderer.setRenderTarget(target);
    },
    finish() {
      if (!filteringFrame) return;
      renderer.setRenderTarget(null);
      renderer.render(screen, camera);
    },
    dispose() {
      events.abort(); releaseTarget(); geometry.dispose(); material.dispose();
    },
  };
}
