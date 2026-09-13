import { brandingTexture } from './factory25dBranding';
import * as THREE from 'three';
import { BRAND_SHELF, INTERIOR_Z } from '@shared/factory25d-layout';
import { propPart, standard } from './factory25dProps';
import { contactShadow } from './factory25dContactShadows';

/** A low display cabinet built into the left end of the front counter. */
export function createBrandShelf(parent: THREE.Group) {
  const root = new THREE.Group(); root.name = 'brand-artifact-shelf';
  root.position.set(BRAND_SHELF.x, .018, BRAND_SHELF.z - INTERIOR_Z); parent.add(root);
  root.rotation.y = BRAND_SHELF.rotationY;
  const frame = standard('#70551c'), wood = standard('#a57e51'), cap = standard('#c4991a');
  const cream = standard('#eee5ce'), white = standard('#f4f4f5'), ink = standard('#1b2330');
  const green = standard('#356756'), brass = standard('#ac8c52', .65);
  const height = BRAND_SHELF.height;
  propPart(root, [BRAND_SHELF.width-.14, .055, .37], [0, .0275, 0], standard('#4b3b1c'));
  propPart(root, [BRAND_SHELF.width, .07, BRAND_SHELF.depth], [0, .09, 0], frame);
  propPart(root, [BRAND_SHELF.width-.07, height-.13, .045], [0, (height+.13)/2, -.225], standard('#4b422e'));
  for (const x of [-1,1]) propPart(root, [.055, height-.13, BRAND_SHELF.depth], [x*(BRAND_SHELF.width/2-.0275), (height+.13)/2, 0], frame);
  for (const y of [.13, .43, .76]) {
    propPart(root, [BRAND_SHELF.width, .055, BRAND_SHELF.depth], [0, y, 0], wood);
    propPart(root, [BRAND_SHELF.width-.1, .025, .018], [0, y, .25], cap);
  }
  // Leave the top open so the camera can see the artifacts on the upper shelf.
  const shadow = contactShadow(root, { width:BRAND_SHELF.width-.08, depth:.45, spread:.13, opacity:.25 });
  // Move the artifacts between shelves without squashing their shapes.
  const top = new THREE.Group(), middle = new THREE.Group(), bottom = new THREE.Group();
  top.position.y = -.47; middle.position.y = -.25; root.add(top, middle, bottom);

  let disposed = false;
  const abort = new AbortController(), images: HTMLImageElement[] = [], textures = new Map<string, THREE.CanvasTexture>();
  function logoTexture(file: string, aspect: number) {
    const existing = textures.get(file); if (existing) return existing;
    const texture = brandingTexture(aspect); textures.set(file, texture); return texture;
  }
  function mark(target: THREE.Object3D, file: string, width: number, aspect: number, position: [number, number, number]) {
    const material = new THREE.MeshStandardMaterial({ map:logoTexture(file, aspect), transparent:true, alphaTest:.04, roughness:.95, depthWrite:false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / aspect), material); mesh.position.set(...position); target.add(mesh); return mesh;
  }
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], target: THREE.Object3D) {
    const object = new THREE.Mesh(geometry, material); object.position.set(...position); object.castShadow = object.receiveShadow = true; target.add(object); return object;
  }

  // Top: a tiny cast Fluid symbol. Geometry comes directly from the original SVG.
  propPart(top, [.39, .12, .19], [-.30, 1.317, .025], ink);
  const sculpture = new THREE.Group(); sculpture.name = 'fluid-logo-sculpture'; sculpture.position.set(-.455, 1.687, .015); sculpture.scale.set(.005, -.005, .005); top.add(sculpture);
  // A decal on the plinth keeps the identity readable if the optional extrusion cannot load.
  mark(top, 'fluid-lockup', .28, 177 / 61, [-.30, 1.317, .123]);
  for (let i=0;i<4;i++) {
    const part = new THREE.Mesh(new THREE.BoxGeometry(22,22,16),white);
    part.position.set(17+(i%2)*28,22+Math.floor(i/2)*28,5); part.castShadow=part.receiveShadow=true; sculpture.add(part);
  }


  // A postcard-sized printed identity, resting on the top shelf instead of a wall billboard.
  const print = new THREE.Group(); print.name = 'we-commerce-postcard'; print.position.set(.28, 1.4125, -.025); print.rotation.x = -.10; top.add(print);
  propPart(print, [.46, .31, .025], [0, 0, 0], ink);
  propPart(print, [.432, .282, .006], [0, 0, .016], cream);
  mark(print, 'we-commerce-logotype-black', .38, 2358 / 600, [0, .015, .020]);
  propPart(print, [.23, .008, .002], [0, -.09, .020], brass);
  propPart(top, [.25, .025, .13], [.28, 1.27, .005], ink);

  // Middle: a ceramic Fluid mug, a few identity cards, and a small WE enamel plaque.
  const mug = new THREE.Group(); mug.name = 'fluid-mug'; mug.position.set(-.32, .708, .055); middle.add(mug);
  mesh(new THREE.CylinderGeometry(.085, .073, .18, 12), green, [0, .09, 0], mug);
  mesh(new THREE.CylinderGeometry(.07, .07, .002, 12), ink, [0, .181, 0], mug);
  const rim = mesh(new THREE.TorusGeometry(.077, .009, 4, 12), green, [0, .181, 0], mug); rim.rotation.x = Math.PI / 2;
  mesh(new THREE.TorusGeometry(.053, .014, 4, 10), green, [.095, .095, 0], mug);
  mark(mug, 'fluid-logomark', .082, 62 / 64, [0, .10, .082]);
  for (let i = 0; i < 3; i++) {
    const card = propPart(middle, [.26, .014, .20], [0, .716 + i * .018, .07], i === 1 ? green : cream); card.rotation.y = -.08 + i * .055;
  }
  const cardMark = mark(middle, 'we-commerce-wordmark-black', .20, 2358 / 600, [0, .760, .07]); cardMark.rotation.x = -Math.PI / 2;
  const badge = mesh(new THREE.CylinderGeometry(.13, .13, .025, 12), brass, [.34, .85, -.025], middle); badge.rotation.x = Math.PI / 2;
  const badgeFace = mesh(new THREE.CircleGeometry(.112, 12), ink, [.34, .85, -.011], middle);
  mark(middle, 'we-commerce-logomark-white', .17, 1, [.34, .85, -.008]);
  propPart(middle, [.14, .025, .11], [.34, .72, -.015], ink);
  badgeFace.name = 'we-commerce-enamel-badge';

  // Bottom: folded merch and a pair of print rolls. All fit within the shelf footprint.
  const tee = new THREE.Group(); tee.name = 'folded-we-commerce-tee'; tee.position.set(-.26, .159, .015); tee.rotation.y = -.06; bottom.add(tee);
  propPart(tee, [.42, .042, .32], [0, .021, 0], ink);
  propPart(tee, [.39, .018, .295], [0, .051, 0], standard('#2c3441'));
  propPart(tee, [.13, .006, .025], [0, .063, -.10], ink);
  const teeMark = mark(tee, 'we-commerce-logomark-white', .17, 1, [0, .064, .015]); teeMark.rotation.x = -Math.PI / 2;
  const mist=new THREE.Group();mist.name='mist-logo-plaque';mist.position.set(.29,.277,.12);mist.scale.setScalar(.85);bottom.add(mist);
  propPart(mist,[.36,.22,.025],[0,0,0],ink);
  propPart(mist,[.33,.195,.006],[0,0,.016],ink);
  mark(mist,'mist-mark',.28,16/9,[0,0,.020]);
  root.userData.artifacts = ['fluid-logo-sculpture', 'we-commerce-postcard', 'fluid-mug', 'identity-cards', 'we-commerce-enamel-badge', 'folded-we-commerce-tee', 'mist-logo-plaque'];
  return { root, target:root, update(){}, dispose() {
    if (disposed) return; disposed = true; abort.abort(); for (const image of images) image.onload = null;
    root.removeFromParent(); const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    root.traverse(object => { if (object instanceof THREE.Mesh && object !== shadow) { geometry.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); } });
    // The white sculpture material may have been created before its SVG arrives.
    materials.add(white);
    geometry.forEach(resource => resource.dispose()); materials.forEach(resource => resource.dispose()); textures.forEach(resource => resource.dispose());
  } };
}
