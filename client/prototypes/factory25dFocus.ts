import * as THREE from 'three';

/** Orthographic depth is linear. Keep focused foreground edges from bleeding. */
export const FOCUS_GLSL = `
  uniform sampler2D depthImage;
  uniform vec2 cameraRange;
  uniform float focusDistance, focusRange, focusRadius;
  float viewDepth(vec2 uv) { return mix(cameraRange.x, cameraRange.y, texture2D(depthImage, uv).r); }
  float blurRadius(float depth) {
    return clamp((abs(depth - focusDistance) - focusRange) / max(1.0, focusRange * 1.5), 0.0, 1.0) * focusRadius;
  }
  vec4 focusImage(sampler2D sourceImage, vec2 uv, vec2 texel) {
    vec4 center = texture2D(sourceImage, uv);
    if (focusRadius < 0.01) return center;
    float depth = viewDepth(uv);
    float radius = blurRadius(depth);
    if (radius < 0.1) return center;
    vec4 total = vec4(center.rgb * center.a, center.a) * 2.0;
    float weight = 2.0;
    for (int i = 0; i < 8; i++) {
      float angle = float(i) * 0.78539816;
      vec2 sampleUv = uv + vec2(cos(angle), sin(angle)) * texel * radius;
      float sampleDepth = viewDepth(sampleUv);
      // A focused closer object must not smear over the defocused background.
      float accept = sampleDepth < depth - 0.3 && blurRadius(sampleDepth) < 0.1 ? 0.0 : 1.0;
      vec4 color = texture2D(sourceImage, sampleUv);
      total += vec4(color.rgb * color.a, color.a) * accept;
      weight += accept;
    }
    // Premultiplied accumulation retains a clean alpha edge against the sky.
    return vec4(total.rgb / max(total.a, 0.0001), total.a / weight);
  }
`;

/** The panorama has its own depth; the room only sees its flat display plane. */
export function createLandscapeFocus(renderer: THREE.WebGLRenderer) {
  let source: THREE.WebGLRenderTarget | undefined;
  const uniforms = {
    sceneImage: { value: null as THREE.Texture | null },
    depthImage: { value: null as THREE.DepthTexture | null },
    imageSize: { value: new THREE.Vector2() }, cameraRange: { value: new THREE.Vector2() },
    focusDistance: { value: 14 }, focusRange: { value: 3.2 }, focusRadius: { value: 1.2 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 screenUv; void main(){screenUv=uv; gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: `varying vec2 screenUv; uniform sampler2D sceneImage; uniform vec2 imageSize;
      ${FOCUS_GLSL}
      void main(){gl_FragColor=focusImage(sceneImage,screenUv,1.0/imageSize);}`,
  });
  const quad = new THREE.Scene();
  const geometry = new THREE.PlaneGeometry(2, 2);
  quad.add(new THREE.Mesh(geometry, material));
  const screenCamera = new THREE.Camera();
  function release() { source?.dispose(); source = undefined; uniforms.sceneImage.value = uniforms.depthImage.value = null; }
  return {
    render(scene: THREE.Scene, camera: THREE.OrthographicCamera, output: THREE.WebGLRenderTarget, enabled: boolean) {
      if (!enabled) {
        if (source) release();
        renderer.setRenderTarget(output); renderer.render(scene, camera); return;
      }
      if (!source) {
        source = new THREE.WebGLRenderTarget(output.width, output.height, {
          minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
          depthTexture: new THREE.DepthTexture(output.width, output.height, THREE.UnsignedIntType),
        });
        uniforms.sceneImage.value = source.texture;
        uniforms.depthImage.value = source.depthTexture;
      }
      if (source.width !== output.width || source.height !== output.height) source.setSize(output.width, output.height);
      uniforms.imageSize.value.set(output.width, output.height);
      uniforms.cameraRange.value.set(camera.near, camera.far);
      renderer.setRenderTarget(source); renderer.render(scene, camera);
      renderer.setRenderTarget(output); renderer.render(quad, screenCamera);
    },
    dispose() { release(); material.dispose(); geometry.dispose(); },
  };
}
