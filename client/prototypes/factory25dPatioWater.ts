import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { PATIO } from '@shared/factory25d-patio';
import { createPatioSplashes, PATIO_IMPACT_GRID } from './factory25dPatioSplashes';

// Shallow irregular pools sit in open floor, with a thinner film across the wood.
const puddles = [
  [11.4, -2.3, 1.35, .62], [14.8, -1.85, .95, .64], [18.7, -2.0, 1.6, .8], [22, -1.8, .65, .45],
  [11.6, 1.7, 1.55, .48], [15.1, 2.3, 1.38, .56], [18.35, 4.25, 1.13, .82],
  [10.1, 5.25, .92, .52], [16.8, 6.55, 1.8, .74], [20.6, 6.45, .78, .47],
  [14.8, 9.6, 1.2, .62], [17.75, 10.4, 1.5, .72],
].map(p => new THREE.Vector4(...p as [number, number, number, number]));

const shader = {
  name: 'Patio rainwater',
  uniforms: {
    color: { value: new THREE.Color('#c4d3da') }, tDiffuse: { value: null }, textureMatrix: { value: new THREE.Matrix4() },
    uWet: { value: 0 }, uRain: { value: 0 }, uTime: { value: 0 }, uNight: { value: 0 },
    uPuddles: { value: puddles }, uTexel: { value: new THREE.Vector2(1 / 400, 1 / 282) },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vReflection;
    varying vec3 vWorld;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vReflection = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uWet, uRain, uTime, uNight;
    uniform vec4 uPuddles[12];
    uniform vec2 uTexel;
    varying vec4 vReflection;
    varying vec3 vWorld;
    #include <logdepthbuf_pars_fragment>
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
    }
    float impactHash(vec2 p) {
      vec2 i = mod(p,251.0);
      return mod(i.x*37.0+i.y*61.0+i.x*i.y*17.0,251.0)/251.0;
    }
    void main() {
      #include <logdepthbuf_fragment>
      vec2 p = vWorld.xz;
      float uneven = (noise(p*vec2(2.2,4.5))-.5)*.30 + (noise(p*9.0)-.5)*.09;
      float pool = 0.0;
      for (int i=0; i<12; i++) {
        vec4 puddle = uPuddles[i];
        float edge = length((p-puddle.xy)/puddle.zw) + uneven;
        pool = max(pool, 1.0-smoothstep(.82, .96, edge));
      }
      pool *= smoothstep(.14, .64, uWet);
      // The plank seams interrupt reflections enough to retain a wooden surface.
      float seam = smoothstep(.02,.085,fract(p.y/.49)) * (1.0-smoothstep(.93,.99,fract(p.y/.49)));
      float grain = noise(p*vec2(7.5,43.0));
      float broken = smoothstep(.62,.84,grain) * smoothstep(.40,.76,noise(p*vec2(3.4,13.0)));
      float film = (.12 + noise(p*vec2(.7,3.0))*.12 + broken*.27) * seam;
      float rings = 0.0;
      vec2 displacement = vec2(0.0);
      vec2 cell = floor(p*${PATIO_IMPACT_GRID.toFixed(2)});
      for (int x=-1; x<=1; x++) for (int y=-1; y<=1; y++) {
        vec2 c = cell+vec2(float(x),float(y));
        float seed = impactHash(c);
        vec2 center = (c+vec2(.15+seed*.7,.15+impactHash(c+19.0)*.7))/${PATIO_IMPACT_GRID.toFixed(2)};
        vec2 delta = p-center;
        float age = fract(uTime*.65+seed*7.0);
        float radius = .018+age*.22;
        float d = length(delta);
        float life = 1.0-smoothstep(.12,.52,age);
        float ring = exp(-abs(d-radius)*180.0) * life * smoothstep(0.0,.035,age);
        float strength = step(seed, uRain*.9) * sqrt(uRain);
        rings += ring*strength;
        displacement += delta/max(.03,d) * sin((d-radius)*150.0) * exp(-abs(d-radius)*65.0) * life*strength;
      }
      vec2 uv = vReflection.xy/vReflection.w;
      uv += displacement*.0018 + vec2(sin(p.y*38.0+uTime*.5),cos(p.x*11.0))*uRain*.00022;
      vec2 blur = uTexel*mix(1.3,.25,pool);
      vec3 reflection = texture2D(tDiffuse, uv).rgb*.4;
      reflection += (texture2D(tDiffuse,uv+vec2(blur.x,0)).rgb+texture2D(tDiffuse,uv-vec2(blur.x,0)).rgb
        +texture2D(tDiffuse,uv+vec2(0,blur.y)).rgb+texture2D(tDiffuse,uv-vec2(0,blur.y)).rgb)*.15;
      // Short directional highlights reveal the boards through the water.
      reflection = mix(reflection, vec3(.22,.29,.32), .055*(1.0-uNight));
      reflection += vec3(.29,.36,.39)*(broken*.52 + rings*.64)*(1.0-uNight*.65);
      float alpha = uWet * (film + pool*.43) * mix(.8,1.0,seam) + rings*.32*(.35+pool);
      gl_FragColor = vec4(reflection, min(.73,alpha));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

/** Two low-resolution reflections, one for each actual floor elevation. */
export function createPatioWater(parent: THREE.Group, timber: THREE.MeshPhysicalMaterial) {
  const splashes = createPatioSplashes(parent);
  const surfaces: Reflector[] = [];
  let capturing = false;
  for (const [back, front, y] of [[PATIO.back, PATIO.edgeZ, 0], [PATIO.edgeZ, PATIO.front, PATIO.lowerY]]) {
    const surface = new Reflector(new THREE.PlaneGeometry(PATIO.right-PATIO.left, front-back), {
      shader, textureWidth: 400, textureHeight: 282, multisample: 0, clipBias: .001,
    });
    surface.name = y === 0 ? 'upper terrace water' : 'garden deck water';
    surface.rotation.x = -Math.PI/2;
    surface.position.set((PATIO.left+PATIO.right)/2, y+.006, (front+back)/2);
    const material = surface.material as THREE.ShaderMaterial;
    material.transparent = true; material.depthWrite = false;
    surface.getRenderTarget().texture.minFilter = surface.getRenderTarget().texture.magFilter = THREE.LinearFilter;
    const capture = surface.onBeforeRender;
    let lastCapture = -Infinity;
    const lastView = new THREE.Matrix4(), lastProjection = new THREE.Matrix4();
    surface.onBeforeRender = function(renderer, scene, camera, geometry, material, group) {
      if (capturing) return;
      const now = performance.now();
      const moved = !lastView.equals(camera.matrixWorld) || !lastProjection.equals(camera.projectionMatrix);
      if (!moved && now-lastCapture < 100) return;
      capturing = true;
      const visible = surfaces.map(other => other.visible);
      surfaces.forEach(other => { other.visible = false; });
      try {
        capture.call(this, renderer, scene, camera, geometry, material, group);
        lastView.copy(camera.matrixWorld); lastProjection.copy(camera.projectionMatrix); lastCapture = now;
      } finally {
        surfaces.forEach((other, i) => { other.visible = visible[i]; });
        capturing = false;
      }
    };
    parent.add(surface); surfaces.push(surface);
  }
  return {
    update(wet: number, rain: number, snow: number, night: boolean, time: number, reduced: boolean) {
      const thawed = 1-THREE.MathUtils.smoothstep(snow,.08,.6);
      const liquid = THREE.MathUtils.clamp(wet,0,1)*thawed;
      const liquidRain = rain*thawed;
      timber.roughness = THREE.MathUtils.lerp(.96,.32,liquid);
      timber.clearcoat = liquid*.9;
      timber.clearcoatRoughness = .18;
      splashes.update(liquidRain, time, night, reduced);
      for (const surface of surfaces) {
        surface.visible = liquid > .015;
        const uniforms = (surface.material as THREE.ShaderMaterial).uniforms;
        uniforms.uWet.value = liquid; uniforms.uRain.value = reduced ? 0 : liquidRain;
        uniforms.uTime.value = reduced ? 0 : time; uniforms.uNight.value = Number(night);
      }
    },
    dispose() {
      splashes.dispose();
      for (const surface of surfaces) { surface.removeFromParent(); surface.geometry.dispose(); surface.dispose(); }
    },
  };
}
