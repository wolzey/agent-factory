import * as THREE from 'three';
import { propPart, standard } from './factory25dProps';

/** Original, quiet pixel landscapes; no video download, autoplay audio or feed. */
export function createNatureTv(parent: THREE.Group) {
  const tv = new THREE.Group(); tv.position.set(7.36, 1.88, 6.35); tv.rotation.y = -Math.PI / 3;
  parent.add(tv);
  propPart(tv, [.25, .24, .18], [0, 0, -.19], standard('#252c39'));
  propPart(tv, [2.22, 1.29, .07], [0, 0, 0], standard('#101822'));
  propPart(tv, [2.12, .025, .008], [0, -.616, .04], standard('#34434a'));
  propPart(tv, [.018, .009, .008], [.93, -.616, .044], standard('#a5c4b2', 1, '#376451'));
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 144;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.18), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  screen.position.z = .037; tv.add(screen);
  const glow = new THREE.PointLight('#90b8a7', .28, 2.7, 2); glow.position.set(0, -.2, .35); tv.add(glow);
  const scenes = [document.createElement('canvas'), document.createElement('canvas')];
  scenes.forEach((image, index) => {
    image.width = 288; image.height = 160; const c = image.getContext('2d')!;
    const sky = c.createLinearGradient(0, 0, 0, 160);
    sky.addColorStop(0, index ? '#809dac' : '#b2c8bf'); sky.addColorStop(1, index ? '#b6c5b5' : '#e0d8b3');
    c.fillStyle = sky; c.fillRect(0, 0, 288, 160);
    for (let ridge = 0; ridge < 5; ridge++) {
      c.fillStyle = (index ? ['#8aa4aa', '#729198', '#537c83', '#386872', '#245961'] : ['#8baca4', '#708f88', '#526f66', '#395c4c', '#274635'])[ridge];
      c.beginPath(); c.moveTo(0, 160);
      for (let x = 0; x <= 288; x += 2) {
        const y = 49 + ridge * 21 + Math.sin(x * .016 + ridge * 1.7) * (13 + ridge * 3) + Math.sin(x * .043 + ridge) * 7;
        c.lineTo(x, Math.round(y));
      }
      c.lineTo(288, 160); c.fill();
    }
    // A pale river/coastal inlet winds toward the foreground.
    c.fillStyle = index ? '#76a9ac' : '#a5c3b5'; c.beginPath();
    c.moveTo(177, 73); c.bezierCurveTo(138, 102, 192, 120, 127, 160);
    c.lineTo(index ? 214 : 157, 160); c.bezierCurveTo(209, 117, 148, 107, 177, 73); c.fill();
  });
  let lastFrame = -1;
  return {
    update(elapsed: number, reduced: boolean, visible: boolean) {
      if (!visible || document.hidden) return;
      const time = reduced ? 0 : elapsed;
      const frame = Math.floor(time * 4); if (frame === lastFrame) return; lastFrame = frame;
      const phase = time % 100, index = Math.floor(phase / 50), local = phase % 50;
      const pan = Math.round((Math.sin(time / 70) + 1) * 8);
      ctx.globalAlpha = 1; ctx.drawImage(scenes[index], pan, 4, 256, 144, 0, 0, 256, 144);
      if (local > 44) { ctx.globalAlpha = (local - 44) / 6; ctx.drawImage(scenes[1 - index], pan, 4, 256, 144, 0, 0, 256, 144); }
      ctx.globalAlpha = 1; texture.needsUpdate = true;
    },
  };
}
