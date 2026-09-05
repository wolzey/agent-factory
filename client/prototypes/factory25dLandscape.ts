import * as THREE from 'three';

const mix = THREE.MathUtils.lerp;
const hash = (x: number, z: number) => {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return value - Math.floor(value);
};
function noise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const tx = x - ix;
  const tz = z - iz;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  return mix(mix(hash(ix, iz), hash(ix + 1, iz), sx), mix(hash(ix, iz + 1), hash(ix + 1, iz + 1), sx), sz);
}

type Profile = ReadonlyArray<readonly [number, number]>;

// Art-directed landforms share a continuous ground surface. Distances are
// deliberately compressed for the orthographic panorama, not repeated cones.
type GroundPoint = readonly [number, number];
const lakeOutline: GroundPoint[] = [
  [-2.35, -7],
  [-0.75, -8],
  [0.45, -7.15],
  [0.8, -5.85],
  [0.12, -4.6],
  [-0.35, -3.8],
  [-0.15, -2.9],
  [-0.75, -2.5],
  [-1.65, -3.1],
  [-1.9, -4.35],
  [-2.7, -5.1],
  [-2.65, -6.2],
].map(([x, z]) => [-1.1 + (x + 1.1) * 0.62, z] as const);
const lakeY = 0.06;
function polygonDistance(x: number, z: number, points: readonly GroundPoint[]) {
  let inside = false;
  let distance = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, az] = points[j];
    const [bx, bz] = points[i];
    const dx = bx - ax;
    const dz = bz - az;
    const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    distance = Math.min(distance, Math.hypot(x - ax - dx * t, z - az - dz * t));
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside ? -distance : distance;
}
const westMesa: GroundPoint[] = [
  [-11, -7.5],
  [-8, -7.9],
  [-5.4, -6.9],
  [-4.85, -5.35],
  [-5.75, -4.45],
  [-6.4, -4.7],
  [-7.1, -4.06],
  [-7.95, -4.28],
  [-8.55, -3.75],
  [-10.2, -3.8],
];
const westLedges: GroundPoint[][] = [
  [[-10.6, -3.5], [-8.4, -3.7], [-7.45, -3.35], [-7.55, -2.55], [-8.55, -2.0], [-10.5, -2.35]],
  [[-7.8, -3.85], [-6.6, -4.35], [-5.3, -3.75], [-4.85, -2.75], [-5.8, -2.55], [-6.8, -2.95]],
  [[-9.0, -1.9], [-7.85, -2.45], [-6.65, -1.8], [-6.1, -0.9], [-7.3, -0.3], [-9.6, -0.85]],
];
const eastShelf: GroundPoint[] = [
  [3.1, -2.1],
  [5.6, -2.6],
  [7.5, -1.3],
  [8.7, 0.3],
  [6.1, 1.5],
  [3.7, 0.7],
];
const nearShelf: GroundPoint[] = [
  [7.3, 1.7],
  [9.5, 1.05],
  [11, 2.2],
  [11, 4.3],
  [8.5, 3.6],
];
// x, y, z endpoints describe the summit's branching, descending ridgelines.
const ribs = [
  [[4.7, 2.62, -6.3], [3.65, 1.9, -4.5], 0.73],
  [[3.65, 1.9, -4.5], [2.05, 1.03, -2.7], 0.65],
  [[2.05, 1.03, -2.7], [0.45, 0.24, -0.4], 0.62],
  [[3.65, 1.9, -4.5], [4.35, 1.3, -2.3], 0.86],
  [[4.7, 2.62, -6.3], [6.45, 1.87, -4.65], 0.76],
  [[6.45, 1.87, -4.65], [7.7, 1.17, -1.65], 0.72],
  [[6.45, 1.87, -4.65], [8.6, 1.72, -5.2], 0.7],
  [[8.6, 1.72, -5.2], [10.8, 0.67, -2], 0.65],
] as const;
function terracedMesa(x: number, z: number, outline: readonly GroundPoint[], top: number, cliff: number) {
  const edge = polygonDistance(x, z, outline);
  // Polygon shoulders define the rock faces. Random edge offsets used to
  // turn this continuous escarpment into a field of unrelated tiny facets.
  const d = edge;
  if (d <= 0) return top;
  // Two unequal rock courses with a short bedding shelf between them.
  if (d < 0.18) return top - (d / 0.18) * cliff * 0.55;
  if (d < 0.27) return top - cliff * 0.55 - (d - 0.18) * 0.18;
  if (d < 0.49) return top - cliff * 0.55 - 0.0162 - (d - 0.27) / 0.22 * cliff * 0.45;
  if (d < 0.69) return top - cliff - 0.0162 - (d - 0.49) * 0.13;
  return top - cliff - 0.0422 - (d - 0.69) * 0.62;
}
export function meadowHeight(x: number, z: number) {
  const valley = -1.05 + Math.sin(z * 0.32) * 0.4;
  const foothills = Math.min(0.75, Math.abs(x - valley) * 0.085);
  let height = 0.19 + foothills + (noise(x * 0.48, z * 0.53) - 0.5) * 0.18;
  height +=
    Math.max(0, 1 - Math.pow((x + 5) / 4, 2) - Math.pow((z - 2.5) / 3, 2)) * 0.36 +
    Math.max(0, 1 - Math.pow((x - 4.2) / 3.8, 2) - Math.pow((z - 3.8) / 2.8, 2)) * 0.28;
  height *= 1 - THREE.MathUtils.smoothstep(z, 3, 8) * 0.55;
  for (const [a, b, slope] of ribs) {
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[2]) * dz) / (dx * dx + dz * dz), 0, 1);
    const distance = Math.hypot(x - a[0] - dx * t, z - a[2] - dz * t);
    height = Math.max(height, mix(a[1], b[1], t) - distance * slope);
  }
  // Recessed drainage gullies split the broad summit slopes into projecting
  // stone ribs. Cuts taper out at both ends and stay above the lower meadows.
  if (height > 0.9) {
    let cut = 0;
    for (const [ax, az, bx, bz, width, depth] of [
      [4.5, -6.2, 2.2, -2.8, 0.56, 0.46],
      [4.95, -6, 5.3, -2.1, 0.5, 0.38],
      [5.7, -5.2, 7.5, -1.7, 0.58, 0.4],
      [3.7, -4.9, 1.1, -3.5, 0.44, 0.34],
      [6.7, -4.5, 8.6, -3.6, 0.45, 0.32],
    ]) {
      const dx = bx - ax;
      const dz = bz - az;
      const t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz);
      if (t <= 0 || t >= 1) continue;
      const across = Math.abs((x - ax) * dz - (z - az) * dx) / Math.hypot(dx, dz);
      cut = Math.max(cut, depth * Math.sin(t * Math.PI) * Math.max(0, 1 - across / (width * (0.4 + t))));
    }
    height -= cut;
  }
  height = Math.max(
    height,
    terracedMesa(x, z, westMesa,
      1.78 + (x + 7) * 0.035 + Math.sin(x * 1.12 + 1.8) * 0.045 +
      Math.max(0, 1 - Math.abs(x + 5.6) / 2.3) * 0.34, 0.72),
    ...westLedges.map((outline, index) => terracedMesa(x, z, outline,
      [1.45, 1.55, 1.04][index] + Math.sin(x * 1.4 + index) * 0.065, [0.46, 0.51, 0.35][index])),
    terracedMesa(x, z, eastShelf, 1.22 + (x - 5) * 0.025, 0.4),
    terracedMesa(x, z, nearShelf, 1.05 + (x - 9) * 0.035, 0.32),
  );
  height -= THREE.MathUtils.smoothstep(-z, 7.5, 16) * 0.85;
  const shore = polygonDistance(x, z, lakeOutline);
  if (shore < 0.7) height = Math.min(height, lakeY + Math.max(-0.45, shore) * 0.55);
  return height;
}
function groundSlope(x: number, z: number, heightAt: typeof meadowHeight) {
  return (
    Math.hypot(
      heightAt(x + 0.06, z) - heightAt(x - 0.06, z),
      heightAt(x, z + 0.06) - heightAt(x, z - 0.06),
    ) / 0.12
  );
}

export function createUtahLandscape(asset?: { geometry: THREE.BufferGeometry; heightAt: typeof meadowHeight }) {
  const heightAt = asset?.heightAt ?? meadowHeight;
  const group = new THREE.Group();
  const snow = { value: 0 };
  const windTime = { value: 0 };
  const windStrength = { value: 0.012 };
  const hazeColor = { value: new THREE.Color('#bdcbd9') };
  const materials: THREE.MeshStandardMaterial[] = [];

  function material(color: string, distance = 0, vertexColors = false, wind = false, ground = false) {
    const result = new THREE.MeshStandardMaterial({
      color,
      vertexColors,
      roughness: 1,
      metalness: 0,
      flatShading: !ground,
    });
    result.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        landscapeSnow: snow,
        landscapeWindTime: windTime,
        landscapeWindStrength: windStrength,
        landscapeHaze: hazeColor,
        landscapeDistance: { value: distance },
      });
      shader.vertexShader =
        `varying float landscapeDepth;\nvarying vec3 landscapePoint;\nvarying float landscapeUp;\nuniform float landscapeWindTime;\nuniform float landscapeWindStrength;\n${shader.vertexShader}`.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          landscapeUp = max(0.0, normal.y);
          landscapePoint = position;
          vec4 atmospherePoint = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            atmospherePoint = instanceMatrix * atmospherePoint;
          #endif
          landscapeDepth = -(modelMatrix * atmospherePoint).z;
          ${
            wind
              ? `float phase = 0.0;
            #ifdef USE_INSTANCING
              phase = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z;
            #endif
            transformed.x += sin(landscapeWindTime * 0.8 + phase) * position.y * position.y * landscapeWindStrength;`
              : ''
          }
        `,
        );
      shader.fragmentShader =
        `varying float landscapeDepth;\nvarying vec3 landscapePoint;\nvarying float landscapeUp;\nuniform float landscapeSnow;\nuniform vec3 landscapeHaze;\nuniform float landscapeDistance;\n${shader.fragmentShader}`
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
          ${
            vertexColors && !ground
              ? `vec3 grainCell = floor(landscapePoint * vec3(16.0, 13.0, 15.0));
          float grain = fract(sin(dot(grainCell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
          diffuseColor.rgb *= 0.975 + floor(grain * 3.0) * 0.025;`
              : ''
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.68, 0.75, 0.84), landscapeSnow * ${wind ? "smoothstep(0.02, 0.28, landscapeUp) * 0.96" : "smoothstep(0.15, 0.8, landscapeUp) * 0.88"});
        `,
          )
          .replace(
            '#include <opaque_fragment>',
            `float aerialDepth = max(landscapeDistance, smoothstep(-1.0, 18.0, landscapeDepth) * 0.58);
          outgoingLight = mix(outgoingLight, landscapeHaze, aerialDepth);
          #include <opaque_fragment>`,
          );
    };
    result.customProgramCacheKey = () => `utah-layered-${distance}-${vertexColors}-${wind}-${ground}`;
    materials.push(result);
    return result;
  }

  function surface(points: THREE.Vector3[], indices: number[], mat: THREE.Material, shadows = false) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        indices.flatMap((i) => points[i].toArray()),
        3,
      ),
    );
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.castShadow = mesh.receiveShadow = shadows;
    group.add(mesh);
    return mesh;
  }

  function ridge(profile: Profile, depth: number, color: string, distance: number, shoulders = true) {
    const mat = material(color, distance);
    const snowMat = material('#c5cdc9', distance);
    const crest = profile.map(([x, y], i) => new THREE.Vector3(x, y, depth + Math.sin(i * 1.9) * 0.22));
    const flank = crest.map((p, i) => {
      const prominent = Math.max(
        0,
        p.y - (crest[Math.max(0, i - 1)].y + crest[Math.min(crest.length - 1, i + 1)].y) / 2,
      );
      return new THREE.Vector3(
        p.x - Math.tanh((p.x + 1.2) / 2) * 0.65,
        p.y * 0.32 - 0.12,
        depth + 2.9 + prominent * 1.5,
      );
    });
    const toe = crest.map(
      (p) => new THREE.Vector3(p.x - Math.tanh((p.x + 1.2) / 2) * 0.8, -0.6, depth + 5.1),
    );
    for (let i = 1; i < crest.length; i += 1) {
      const a = crest[i - 1];
      const b = crest[i];
      const c = flank[i - 1];
      const d = flank[i];
      if (shoulders) {
        // A branching spur is actual relief: its raised shoulder divides two
        // broad slopes, then forks into unequal lower ribs. Shared gullies keep
        // adjacent slopes joined. All faces use the same rock and moving light.
        const relief = THREE.MathUtils.smoothstep(Math.max(a.y, b.y), 0.35, 1.9) * (distance > 0.2 ? 0.4 : 1);
        const branch = 0.38 + hash(i, depth) * 0.24;
        const shoulder = a.clone().lerp(b, branch).lerp(c.clone().lerp(d, branch), 0.32);
        shoulder.z += 0.55 * relief;
        shoulder.y += Math.max(a.y, b.y) * 0.035 * relief;
        const knee = c.clone().lerp(d, branch + 0.12);
        knee.y += 0.18 * relief;
        knee.z += 0.6 * relief;
        const fork = c
          .clone()
          .lerp(d, branch * 0.45)
          .lerp(toe[i - 1].clone().lerp(toe[i], branch * 0.5), 0.38);
        fork.y += 0.04 * relief;
        fork.z += 0.35 * relief;
        surface(
          [a, b, c, d, shoulder, knee, fork, toe[i - 1], toe[i]],
          [0, 2, 4, 0, 4, 1, 1, 4, 3, 4, 2, 5, 4, 5, 3, 2, 6, 5, 2, 7, 6, 6, 7, 8, 6, 8, 5, 5, 8, 3],
          mat,
        );
      } else surface([a, b, toe[i - 1], toe[i]], [0, 2, 1, 1, 2, 3], mat);
      if (shoulders && crest[i].y > 1.65 && crest[i].y > crest[i - 1].y && i < crest.length - 1) {
        // Small snowfields follow the ridge surface; no storm color is in the rock.
        const peak = crest[i].clone().add(new THREE.Vector3(0, 0.009, 0.008));
        const left = peak.clone().lerp(crest[i - 1], 0.12);
        const right = peak.clone().lerp(crest[i + 1], 0.15);
        const run = peak.clone().lerp(flank[i], 0.28);
        surface([peak, left, right, run], [0, 1, 3, 0, 3, 2], snowMat);
      }
    }
  }

  ridge(
    [
      [-10, 0.6],
      [-7, 1.1],
      [-5.2, 0.65],
      [-3.1, 0.5],
      [-2.2, 0.82],
      [-1.3, 0.57],
      [-0.4, 0.73],
      [0.7, 0.48],
      [1.8, 0.92],
      [3.4, 0.72],
      [5.5, 1.25],
      [8, 0.9],
      [10, 0.7],
    ],
    -18,
    '#7799bc',
    0.66,
    false,
  );
  ridge(
    [
      [-10, 0.64],
      [-8, 0.9],
      [-6.5, 0.69],
      [-4.7, 0.8],
      [-3.2, 0.58],
      [-2.5, 0.81],
      [-1.7, 0.6],
      [-0.7, 0.69],
      [0.2, 0.5],
      [1.1, 0.67],
      [2, 0.86],
      [3.9, 1.07],
      [5.5, 0.8],
      [7.5, 0.9],
      [10, 0.63],
    ],
    -14,
    '#819dbd',
    0.5,
    false,
  );
  ridge(
    [
      [-10, 1.45],
      [-8.2, 1.72],
      [-6.4, 1.46],
      [-4.9, 1.22],
      [-3.8, 0.85],
      [-2.8, 0.64],
      [-1.9, 0.49],
      [-1.0, 0.61],
      [-0.2, 0.43],
      [0.5, 0.65],
      [1.9, 1.23],
      [3.1, 1.68],
      [4.5, 2.03],
      [5.7, 1.77],
      [7.6, 1.36],
      [10, 1.68],
    ],
    -9.8,
    '#617f9f',
    0.3,
  );
  // Limestone escarpments, summit ribs, meadow and shoreline form one mesh,
  // so all vegetation can sample the same surface instead of floating cards.
  let terrainGeometry = asset?.geometry;
  if (!terrainGeometry) {
    const terrainPositions: number[] = [];
    const terrainColors: number[] = [];
    const terrainNormals: number[] = [];
    const terrainIndices: number[] = [];
    const columns = 220;
    const rows = 230;
    const step = 0.1;
    // Shared height samples also supply normals and broad recess shading. A
    // three-cell border avoids resampling the full landform for every vertex.
    const stride = columns + 7;
    const heights = new Float32Array(stride * (rows + 7));
    for (let row = -3; row <= rows + 3; row++)
      for (let col = -3; col <= columns + 3; col++)
        heights[(row + 3) * stride + col + 3] = heightAt(-11 + col * step, -16 + row * step);
    const at = (col: number, row: number) => heights[(row + 3) * stride + col + 3];
    const grass = new THREE.Color('#587342');
    const dryGrass = new THREE.Color('#9aa367');
    const stone = new THREE.Color('#727e8f');
    const limestone = new THREE.Color('#b5ae98');
    for (let row = 0; row <= rows; row += 1)
      for (let col = 0; col <= columns; col += 1) {
        const x = -11 + col * step;
        const z = -16 + row * step;
        const y = at(col, row);
        // Sample the same landform on both sides of a vertex, independent of the
        // triangle diagonal. Joined shadows follow spurs, gullies and rock beds.
        const dx = (at(col + 1, row) - at(col - 1, row)) / (step * 2);
        const dz = (at(col, row + 1) - at(col, row - 1)) / (step * 2);
        const slope = Math.hypot(dx, dz);
        const rock = THREE.MathUtils.smoothstep(slope, 0.32, 0.72);
        const pasture = grass.clone().lerp(dryGrass, noise(x * 0.8, z * 0.85) * 0.55);
        const warmCliff = x < -4.5 ? 0.82 : THREE.MathUtils.smoothstep(slope, 0.8, 1.6) * 0.5;
        const mineral = stone.clone().lerp(limestone, warmCliff);
        const summit = x > 1.2 && z < -2 ? THREE.MathUtils.smoothstep(y, 1.0, 1.5) * 0.95 : 0;
        const color = pasture.lerp(mineral, Math.max(rock, summit));
        // Recesses receive less bounced light. This broad contact tone follows
        // the carved form and cannot expose an individual triangle diagonal.
        const surroundings = (at(col - 3, row) + at(col + 3, row) + at(col, row - 3) + at(col, row + 3)) / 4;
        const recess = THREE.MathUtils.clamp((surroundings - y) * 1.5, 0, 0.2);
        color.multiplyScalar(1 - recess * rock);
        terrainPositions.push(x, y, z);
        terrainColors.push(color.r, color.g, color.b);
        const normal = new THREE.Vector3(-dx, 1, -dz).normalize();
        terrainNormals.push(normal.x, normal.y, normal.z);
        if (row < rows && col < columns) {
          const a = row * (columns + 1) + col;
          terrainIndices.push(a, a + columns + 1, a + 1, a + 1, a + columns + 1, a + columns + 2);
        }
      }
    terrainGeometry = new THREE.BufferGeometry();
    terrainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(terrainPositions, 3));
    terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(terrainColors, 3));
    terrainGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(terrainNormals, 3));
    terrainGeometry.setIndex(terrainIndices);
  }
  const terrainMaterial = material('#ffffff', 0, true, false, true);
  terrainMaterial.customProgramCacheKey = () => asset ? 'utah-blender-terrain-v1' : 'utah-procedural-terrain-v1';
  const shadeEnvironment = terrainMaterial.onBeforeCompile;
  terrainMaterial.onBeforeCompile = (shader, renderer) => {
    shadeEnvironment.call(terrainMaterial, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('float aerialDepth =', `
      // Joined light bands describe the formation without exposing mesh
      // diagonals. Quantize illumination before atmospheric perspective.
      float rockLight = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
      float baseLight = max(0.025, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));
      float illumination = rockLight / baseLight;
      float lightBand = floor(illumination * 3.5 + 0.5) / 3.5;
      // Keep low-light gradients intact so rain/night cannot fall into a
      // zero-light band. Daylight reveals the more deliberate rock planes.
      outgoingLight *= mix(1.0, lightBand / max(0.025, illumination), smoothstep(0.22, 0.7, illumination) * 0.92);
      float aerialDepth =`);
    if (!asset) shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      // Sparse, connected bedding marks sit in object space, not per triangle.
      // Their pixel clusters follow horizontal strata and vertical rock joints.
      vec3 cell = floor(landscapePoint * vec3(20.0, 22.0, 20.0));
      float bed = floor((landscapePoint.y + sin(landscapePoint.x * 0.65) * 0.018) * 11.0);
      float breakUp = fract(sin(dot(floor(cell.xz / 4.0), vec2(127.1, 311.7))) * 43758.5453);
      float course = mod(cell.y + floor(sin(cell.x * 0.08) * 0.7), 7.0);
      float seam = (1.0 - step(1.0, course)) * step(0.28, breakUp);
      float joint = step(0.86, fract(sin(floor(cell.x / 3.0 + bed * 0.12) * 127.1) * 43758.5453));
      float exposed = 1.0 - smoothstep(0.72, 0.93, landscapeUp);
      float variation = floor(breakUp * 3.0) * 0.022;
      float faultX = floor(cell.x + sin(cell.y * 0.043) * 1.3);
      float fracture = step(0.93, fract(sin(faultX * 43.7) * 173.13));
      float slab = step(0.62, fract(sin(floor((cell.x + cell.y * 0.18) / 6.0) * 17.3) * 79.1));
      diffuseColor.rgb *= 1.0 + variation - exposed * (seam * 0.13 + joint * 0.035 + fracture * 0.16 + slab * 0.035);
    `);
  };
  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.castShadow = terrain.receiveShadow = true;
  group.add(terrain);

  const shorePoints = lakeOutline.map(([x, z]) => new THREE.Vector2(x, z));
  const lakeTriangles = THREE.ShapeUtils.triangulateShape(shorePoints, []);
  const water = material('#73a0ad', 0.09);
  water.roughness = 0.56;
  water.metalness = 0.08;
  surface(
    lakeOutline.map(([x, z]) => new THREE.Vector3(x, lakeY + 0.003, z)),
    lakeTriangles.flatMap(([a, b, c]) => [a, c, b]),
    water,
  );
  const ripple = material('#a8bec2', 0.14);
  for (let i = 0; i < 25; i += 1) {
    const x = -2.6 + hash(i, 168) * 3.1;
    const z = -7.6 + hash(i, 169) * 4.8;
    const width = 0.09 + hash(i, 171) * 0.25;
    if (polygonDistance(x, z, lakeOutline) > -0.3) continue;
    surface(
      [
        new THREE.Vector3(x, lakeY + 0.006, z),
        new THREE.Vector3(x + width, lakeY + 0.006, z),
        new THREE.Vector3(x + width, lakeY + 0.006, z + 0.045),
        new THREE.Vector3(x, lakeY + 0.006, z + 0.045),
      ],
      [0, 2, 1, 0, 3, 2],
      ripple,
    );
  }

  function pineGeometry(tiers: number, branches: number) {
    const positions: number[] = [];
    for (let tier = 0; tier < tiers; tier += 1) {
      const y = 0.18 + (tier / tiers) * 0.8;
      const radius = 0.37 * Math.pow(1 - tier / tiers, 0.9);
      for (let branch = 0; branch < branches; branch += 1) {
        const angle = (branch / branches) * Math.PI * 2 + tier * 0.28;
        const next = angle + (Math.PI * 2) / branches;
        const r = radius * (branch % 2 ? 0.9 : 1);
        const rn = radius * (branch % 2 ? 1 : 0.9);
        const a = [Math.cos(angle) * r, y - 0.025, Math.sin(angle) * r];
        const b = [Math.cos(next) * rn, y - 0.025, Math.sin(next) * rn];
        positions.push(...[0, y + 0.29, 0], ...b, ...a, ...[0, y - 0.04, 0], ...a, ...b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
  const detailedPine = pineGeometry(5, 7);
  const smallPine = pineGeometry(3, 5);
  const pose = new THREE.Object3D();
  function forest(count: number, distant: boolean) {
    const foliage = new THREE.InstancedMesh(
      distant ? smallPine : detailedPine,
      material(distant ? '#50746d' : '#305b3d', distant ? 0.12 : 0, false, true),
      count,
    );
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.018, 0.023, 0.93, 5).translate(0, 0.43, 0),
      material('#695e48', distant ? 0.12 : 0),
      count,
    );
    let placed = 0;
    for (let attempt = 0; attempt < count * 18 && placed < count; attempt += 1) {
      const x = -9.6 + hash(attempt, distant ? 31 : 13) * 19.2;
      const z = distant ? -6.8 + hash(attempt, 52) * 5.4 : -0.4 + hash(attempt, 23) * 5.8;
      if (polygonDistance(x, z, lakeOutline) < 0.18) continue;
      const clearing = Math.abs(x + 1.1) < 0.75 && z > 0;
      if (
        (clearing && (!distant || hash(attempt, 73) > 0.18)) ||
        Math.min(...[-8.1, -6.1, -3.1, -0.9, 1.9, 4.2, 6.6, 8.8].map((center) => Math.abs(x - center))) >
          (distant ? 1.0 : 0.9) ||
        noise(x * 1.2, z * 1.3) < 0.4 ||
        groundSlope(x, z, heightAt) > (asset ? 0.52 : 0.72) ||
        (asset && x > 1.5 && z < -2 && heightAt(x, z) > 1.4) ||
        heightAt(x, z) > 2.4 ||
        (z > 3.8 && Math.abs(x) < 4.5)
      )
        continue;
      const size = distant ? 0.1 + hash(attempt, 91) * 0.17 : 0.25 + hash(attempt, 37) * 0.39;
      pose.position.set(x, heightAt(x, z) - 0.004, z);
      pose.rotation.set(0, hash(attempt, 5) * Math.PI * 2, 0);
      pose.scale.set(size, size * (1 + hash(attempt, 4) * 0.12), size);
      pose.updateMatrix();
      foliage.setMatrixAt(placed, pose.matrix);
      trunks.setMatrixAt(placed, pose.matrix);
      placed += 1;
    }
    foliage.count = trunks.count = placed;
    foliage.castShadow = foliage.receiveShadow = trunks.castShadow = !distant;
    group.add(foliage, trunks);
  }
  forest(150, true);
  forest(100, false);
  for (const [x, z, size] of [
    [-7.8, 2.7, 1.08],
    [-7.1, 2.9, 0.82],
    [-6.3, 2.3, 0.64],
    [7.7, 3.8, 1.04],
    [6.8, 3.4, 0.83],
    [5.8, 3.6, 0.65],
  ]) {
    const tree = new THREE.Mesh(detailedPine, material('#2c573b', 0, false, true));
    tree.position.set(x, heightAt(x, z), z);
    tree.scale.setScalar(size);
    tree.castShadow = true;
    group.add(tree);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, size, 5), material('#665a46'));
    trunk.position.set(x, tree.position.y + size / 2, z);
    group.add(trunk);
  }
  const bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), material('#829175'), 95);
  const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), material('#a09d84'), 35);
  for (const [mesh, count, seed] of [
    [bushes, 95, 71],
    [stones, 35, 95],
  ] as const) {
    let placed = 0;
    for (let i = 0; i < count * 4 && placed < count; i += 1) {
      const clusters = [
        [-5.4, 2.1],
        [-3.7, 0.7],
        [3.2, 2.5],
        [6.4, 3.9],
      ];
      const cluster = clusters[i % clusters.length];
      const x = mesh === stones ? cluster[0] + (hash(i, seed) - 0.5) * 1.4 : -9.7 + hash(i, seed) * 19.4;
      const z =
        mesh === stones ? cluster[1] + (hash(i, seed + 1) - 0.5) * 0.85 : -0.8 + hash(i, seed + 1) * 6;
      if (polygonDistance(x, z, lakeOutline) < 0.1 || groundSlope(x, z, heightAt) > 0.8) continue;
      const radius = mesh === stones ? 0.055 + hash(i, seed + 2) * 0.13 : 0.025 + hash(i, seed + 2) * 0.065;
      pose.position.set(x, heightAt(x, z) + radius * 0.22, z);
      pose.scale.set(radius, radius * 0.48, radius * 0.8);
      pose.rotation.set(0, hash(i, 3) * 6, 0);
      pose.updateMatrix();
      mesh.setMatrixAt(placed++, pose.matrix);
    }
    mesh.count = placed;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  const grassGeometry = new THREE.BufferGeometry();
  const blades: number[] = [];
  for (let i = 0; i < 120; i += 1) {
    const x = -9.6 + hash(i, 117) * 19.2;
    const z = -0.4 + hash(i, 118) * 5.2;
    if (polygonDistance(x, z, lakeOutline) < 0.1 || groundSlope(x, z, heightAt) > 0.65) continue;
    const y = heightAt(x, z);
    const height = 0.035 + hash(i, 119) * 0.055;
    for (const offset of [-0.015, 0.02])
      blades.push(x + offset - 0.009, y, z, x + offset + 0.009, y, z, x + offset * 1.8, y + height, z);
  }
  grassGeometry.setAttribute('position', new THREE.Float32BufferAttribute(blades, 3));
  grassGeometry.computeVertexNormals();
  const grassMaterial = material('#8c9063');
  grassMaterial.side = THREE.DoubleSide;
  group.add(new THREE.Mesh(grassGeometry, grassMaterial));

  return { group, materials, snow, windTime, windStrength, hazeColor, heightAt };
}
