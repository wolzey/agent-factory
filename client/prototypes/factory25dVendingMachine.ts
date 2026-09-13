import { brandingTexture } from './factory25dBranding';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { contactShadow } from './factory25dContactShadows';
import { signTexture } from './factory25dLabels';
import { propPart, standard } from './factory25dProps';
import { createVendingDispenser, type VendingInteractionOptions } from './factory25dVendingDispense';
import { createSnackGeometry, snackKind } from './factory25dVendingSnacks';
import { VendingCabinetRock } from './factory25dVendingMotion';

/** A freestanding snack machine; local +Z is its front and local Y=0 is the floor. */
export function createVendingMachine(parent: THREE.Object3D) {
  const root = new THREE.Group(); root.name = 'corner-vending-machine'; parent.add(root);
  const visual = new THREE.Group(); visual.name = 'vending-cabinet-motion'; root.add(visual);
  const cabinet = new THREE.Group(); visual.add(cabinet);
  const materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  const material = (color: string, roughness = .75, emissive = '#000000', intensity = 1) => {
    const result = standard(color, roughness, emissive); result.emissiveIntensity = intensity;
    materials.add(result); return result;
  };
  const enamel = material('#171c23', .42), edge = material('#343c45', .6);
  const teal = material('#202c30'), dark = material('#0b1117'), metal = material('#8ca8a7', .45);
  const coral = material('#d96467'), cream = material('#f7deb5');
  const cool = material('#9bf2dd', .5, '#52c8b2', .85);
  const warm = material('#ffe3ac', .5, '#ffb76b', .75);
  const hot = material('#ed8b72', .65, '#ce624b', .38);
  const stockMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .61, metalness: .08 });
  materials.add(stockMaterial);
  const box = (size: [number, number, number], at: [number, number, number], mat: THREE.Material) => propPart(cabinet, size, at, mat);

  // Butt-jointed shell panels leave a real cavity behind the display glass.
  // The back fits BETWEEN the sides, base and roof: overlapping full-size
  // panels put teal and enamel on the same plane and flicker when rocked.
  box([.85, .08, .56], [0, .055, -.005], dark);
  for (const x of [-.34, .34]) box([.1, .045, .13], [x, .0225, .19], dark);
  box([.77, .86, .075], [0, .87, -.2725], teal);
  for (const x of [-.4225, .4225]) box([.075, .86, .62], [x, .87, 0], enamel);
  box([.92, .06, .62], [0, 1.33, 0], enamel);
  box([.79, .035, .51], [0, 1.365 - .035, -.015], edge);
  box([.92, .34, .62], [0, .27, 0], enamel);
  box([.77, .125, .035], [0, 1.2375, .2925], enamel);
  box([.1, .73, .04], [.335, .81, .29], enamel);
  box([.025, 1.19, .025], [-.433, .715, .322], coral);
  // A recessed, vented service panel gives the visible left side some depth.
  box([.006, .31, .31], [-.463, .325, -.045], edge);
  for (let row = 0; row < 5; row++) box([.008, .012, .22], [-.468, .245 + row * .039, -.045], teal);
  box([.014, .29, .16], [-.467, 1.105, .055], coral);
  for (let row = 0; row < 3; row++) box([.017, .017, .1 - row * .017], [-.477, 1.14 - row * .045, .055], cream);

  box([.65, .755, .025], [-.0675, .805, -.155], dark);
  box([.635, .024, .37], [-.0675, 1.185, .04], teal);
  const shelfRows = [1.065, .845, .625];
  for (const [row, y] of shelfRows.entries()) {
    const light = row === 2 ? warm : cool;
    box([.635, .024, .345], [-.0675, y - .084, .0525], edge);
    box([.622, .014, .025], [-.0675, y + .092, .13], light);
    // The softly luminous backplate lights the actual snacks without another lamp per row.
    box([.617, .162, .008], [-.0675, y + .004, -.134], material(row === 2 ? '#5d6454' : '#345c59', .9, row === 2 ? '#6d6245' : '#315e59', .35));
    box([.632, .059, .024], [-.0675, y - .12, .312], teal);
    for (let column = 0; column < 4; column++) {
      const x = -.299 + column * .153;
      const kind = snackKind(row * 4 + column), geometry = createSnackGeometry(kind);
      const snack = new THREE.Mesh(geometry, stockMaterial); snack.name = `vending-stock-${kind}`;
      snack.position.set(x, y - .072 - geometry.boundingBox!.min.y, .085);
      snack.castShadow = snack.receiveShadow = true; cabinet.add(snack);
      box([.089, .03, .016], [x, y - .115, .333], dark);
      box([.066, .014, .012], [x, y - .113, .346], light);
      box([.07, .008, .007], [x, y - .14, .329], row === 2 ? hot : cool);
    }
  }
  // The reader/coin-return column sits beside the products, like a drinks machine.
  box([.1, .12, .015], [.355, 1.035, .319], dark);
  box([.074, .066, .008], [.355, 1.047, .331], cool);
  box([.042, .012, .01], [.355, 1.049, .338], teal);
  box([.022, .087, .018], [.355, .874, .323], metal);
  box([.004, .055, .007], [.355, .874, .336], dark);
  box([.08, .025, .024], [.355, .784, .325], coral);
  box([.096, .113, .014], [.355, .635, .326], dark);
  box([.068, .064, .012], [.355, .641, .336], teal);
  // Nested squares read as a contactless mark even when the lettering is tiny.
  box([.037, .035, .005], [.355, .643, .345], cool);
  box([.027, .025, .006], [.355, .643, .349], teal);
  box([.016, .015, .007], [.355, .643, .353], cool);
  box([.063, .031, .018], [.355, .51, .324], metal);
  box([.036, .009, .021], [.355, .513, .336], dark);

  // Low pickup opening, a sloping flap and a projecting tray make the bottom read in 3D.
  box([.65, .17, .022], [-.047, .303, .314], teal);
  box([.565, .106, .025], [-.047, .306, .329], dark);
  const flap = box([.55, .055, .028], [-.047, .349, .348], metal); flap.rotation.x = -.2;
  box([.61, .023, .125], [-.047, .222, .3025], edge);
  for (const x of [-.34, .246]) box([.025, .051, .12], [x, .243, .3], enamel);
  box([.51, .009, .014], [-.047, .386, .335], warm);
  box([.67, .022, .017], [0, .108, .308], teal);
  box([.47, .012, .01], [0, .094, .313], cool);

  const sign = (text: string, width: number, height: number, x: number, y: number, ink: string, background: string, emission: number) => {
    const texture = signTexture(text, ink, background, 2, width / height); textures.add(texture);
    const mat = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture,
      emissive: '#ffffff', emissiveIntensity: emission, roughness: .55 }); materials.add(mat);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    panel.position.set(x, y, .316); visual.add(panel); return mat;
  };
  const header = sign('SNACKS', .715, .103, 0, 1.24, '#243f3d', '#ffe5b9', .65);
  const brandHeader = brandingTexture(.715/.103, undefined, '#243f3d'); textures.add(brandHeader); header.map = header.emissiveMap = brandHeader;
  sign('SNACKS + SIPS', .48, .039, -.0675, .456, '#9fdfd8', '#244340', .35);
  sign('REFRESH', .28, .033, -.06, .15, '#8fb5aa', '#171c23', .12);

  // Glass is a thin overlay; all drinks and shelves behind it are real geometry.
  const glassMaterial = new THREE.MeshStandardMaterial({ color: '#a9dfd4', roughness: .19, metalness: .12,
    transparent: true, opacity: .045, depthWrite: false }); materials.add(glassMaterial);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(.634, .73), glassMaterial);
  glass.position.set(-.0675, .802, .279); glass.renderOrder = 2; visual.add(glass);
  const gleamMaterial = new THREE.MeshBasicMaterial({ color: '#d8fff1', transparent: true, opacity: .075,
    depthWrite: false, toneMapped: false }); materials.add(gleamMaterial);
  for (const x of [-.307, .157]) {
    const gleam = new THREE.Mesh(new THREE.PlaneGeometry(.017, .64), gleamMaterial);
    gleam.position.set(x, .81, .281); gleam.rotation.z = -.11; gleam.renderOrder = 3; visual.add(gleam);
  }

  // Merge static parts by material: the product detail stays inexpensive on phones.
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  cabinet.updateMatrixWorld(true);
  for (const part of [...cabinet.children]) if (part instanceof THREE.Mesh) {
    const geometry = part.geometry.clone().applyMatrix4(part.matrix);
    const bucket = buckets.get(part.material) ?? []; bucket.push(geometry); buckets.set(part.material, bucket);
    part.geometry.dispose(); part.removeFromParent();
  }
  for (const [mat, geometries] of buckets) {
    const merged = mergeGeometries(geometries, false)!;
    for (const geometry of geometries) geometry.dispose();
    const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = mesh.receiveShadow = true; cabinet.add(mesh);
  }

  const shadow = contactShadow(root, { width: .84, depth: .54, floorY: .015, spread: .16, opacity: .3 });
  const spillMaterial = new THREE.ShaderMaterial({
    uniforms: { glow: { value: .2 }, tint: { value: new THREE.Color('#71d4c1') } },
    vertexShader: 'varying vec2 glowUv; void main() { glowUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 glowUv; uniform float glow; uniform vec3 tint;
      void main() {
        float distance = length(vec2((glowUv.x - .5) * 2.0, (glowUv.y - .77) * 1.65));
        float falloff = pow(1.0 - smoothstep(.08, .83, distance), 2.0);
        gl_FragColor = vec4(tint, falloff * glow);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }); materials.add(spillMaterial);
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(1.48, 1.32), spillMaterial);
  spill.rotation.x = -Math.PI / 2; spill.position.set(0, .02, .82); root.add(spill);
  const light = new THREE.PointLight('#9be1c7', .8, 2.1, 2);
  light.position.set(-.045, .65, .51); root.add(light);
  const motion = new VendingCabinetRock();
  const dispenser = createVendingDispenser(root, {
    accepted: () => motion.press(), released: () => motion.release(), rockAngle: () => visual.rotation.x,
  });
  let lastElapsed: number | undefined;

  return {
    root,
    dispense: dispenser.dispense,
    attachInteraction: (options: VendingInteractionOptions) => dispenser.attachInteraction(options),
    get dispenseCount() { return dispenser.count; },
    get dispenseQueued() { return dispenser.queued; },
    get dispensedBodies() { return dispenser.bodies; },
    takeDispensed: (id: number) => dispenser.take(id),
    update(elapsed: number, reduced: boolean, deltaSeconds?: number) {
      const dt = deltaSeconds ?? (lastElapsed === undefined ? 1 / 60 : elapsed - lastElapsed);
      const pose = motion.update(dt, reduced, dispenser.visible);
      visual.rotation.x = pose.pitch;
      visual.position.set(0, pose.y, pose.z);
      // Very slow transformer warmth, never a flashing sign or a strobe.
      const warmth = reduced ? 0 : Math.sin(elapsed * .45) * .025;
      header.emissiveIntensity = .65 + warmth;
      spillMaterial.uniforms.glow.value = .2 + warmth * .15;
      light.intensity = .8 + warmth;
      dispenser.update(dt);
      lastElapsed = elapsed;
    },
    dispose() {
      dispenser.dispose();
      root.removeFromParent();
      root.traverse(node => { if (node instanceof THREE.Mesh && node !== shadow) node.geometry.dispose(); });
      // Contact shadows share their cached material/geometry with the other room props.
      for (const mat of materials) mat.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}
