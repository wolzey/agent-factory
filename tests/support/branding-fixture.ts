/** Public verification artwork, produced through the production serializer. */
import { PNG } from 'pngjs';
import { createBranding } from '../../server/branding.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const target = process.argv[2];
if (!target) throw new Error('Pass a local fixture output directory.');
mkdirSync(target, { recursive: true });
const image = new PNG({ width: 128, height: 128 });
for (let y=0;y<128;y++) for(let x=0;x<128;x++) {
  const mark=x>24&&x<104&&y>24&&y<104&&(x<48||y<48||y>80);
  image.data.set(mark?[255,214,112,255]:[0,0,0,0],(y*128+x)*4);
}
const identity=createBranding({title:'NORTH STAR LAB',accentColor:'#66E2CF'},undefined,PNG.sync.write(image));
writeFileSync(resolve(target,'config.json'),JSON.stringify({title:identity.title,branding:identity.branding}));
writeFileSync(resolve(target,'logo.png'),identity.logo!);
