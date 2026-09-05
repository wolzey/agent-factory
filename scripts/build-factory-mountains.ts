/** Rebuild the optional landscape asset; Blender is an authoring-only dependency. */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { meadowHeight } from '../client/prototypes/factory25dLandscape';

const scratch = mkdtempSync(join(tmpdir(), 'factory-mountains-'));
const columns = 256, rows = 288, x0 = -11, z0 = -16, width = 22, depth = 23;
const heights: number[] = [];
for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++)
  heights.push(meadowHeight(x0 + col / columns * width, z0 + row / rows * depth));
const ground = join(scratch, 'ground.json');
writeFileSync(ground, JSON.stringify({ columns, rows, x0, z0, width, depth, heights }));
const blender = process.env.BLENDER_BINARY ?? '/Applications/Blender.app/Contents/MacOS/Blender';
try {
  const result = spawnSync(blender, ['--background', '--factory-startup', '--python',
    resolve('scripts/build-factory-mountains.py'), '--', ground,
    resolve('client/assets/prototype25d/utah-mountains.glb')], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Blender exited with ${result.status}`);
} finally { rmSync(scratch, { recursive: true, force: true }); }
