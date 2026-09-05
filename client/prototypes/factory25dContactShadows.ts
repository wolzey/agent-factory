import * as THREE from 'three';

interface ContactOptions {
  x?: number; z?: number; floorY?: number;
  width: number; depth: number;
  spread?: number; opacity?: number; round?: boolean;
}
const materials = new Map<string, THREE.MeshBasicMaterial>();
const plane = new THREE.PlaneGeometry(1, 1);

/** Small diffuse contact footprints complement the sun's real cast shadows.
 * They stay on the receiving surface, independent of sun direction, and never
 * cast another shadow or brighten the floor in dark weather. */
export function contactShadow(parent: THREE.Object3D, {
  x = 0, z = 0, floorY = 0, width, depth, spread = 0.12, opacity = 0.28, round = false,
}: ContactOptions): THREE.Mesh {
  const key = [width, depth, spread, opacity, round].join(':');
  let material = materials.get(key);
  const extentX = width + spread * 2; const extentZ = depth + spread * 2;
  if (!material) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(512, Math.max(32, Math.ceil(extentX * 80)));
    canvas.height = Math.min(128, Math.max(32, Math.ceil(extentZ * 80)));
    const ctx = canvas.getContext('2d')!;
    const pixels = ctx.createImageData(canvas.width, canvas.height);
    const corner = Math.min(width, depth) * 0.2;
    for (let py = 0; py < canvas.height; py += 1) for (let px = 0; px < canvas.width; px += 1) {
      const u = ((px + 0.5) / canvas.width - 0.5) * extentX;
      const v = ((py + 0.5) / canvas.height - 0.5) * extentZ;
      const dx = Math.abs(u) - width / 2 + corner;
      const dz = Math.abs(v) - depth / 2 + corner;
      const distance = round
        ? (Math.hypot(u / (width / 2), v / (depth / 2)) - 1) * Math.min(width, depth) / 2
        : Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0) - corner;
      const fade = 1 - THREE.MathUtils.smoothstep(distance, -spread * 0.15, spread);
      pixels.data[(py * canvas.width + px) * 4 + 3] = Math.round(fade * fade * 255);
    }
    ctx.putImageData(pixels, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    material = new THREE.MeshBasicMaterial({ map: texture, color: 0x000000, opacity,
      transparent: true, depthWrite: false, toneMapped: false });
    materials.set(key, material);
  }
  const shadow = new THREE.Mesh(plane, material);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(extentX, extentZ, 1);
  shadow.position.set(x, floorY + 0.003, z);
  parent.add(shadow);
  return shadow;
}
