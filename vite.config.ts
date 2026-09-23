import { defineConfig, type Plugin } from 'vite';
import { extname, join, resolve } from 'node:path';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

// The server sends these precompressed (fastify-static `preCompressed`). Render's
// edge compresses text on the fly, but sends binary models such as the garage cars raw.
const COMPRESSIBLE = new Set(['.js', '.css', '.html', '.svg', '.json', '.glb', '.ico', '.ttf', '.otf', '.wasm']);

function precompress(): Plugin {
  let outDir = '';
  return {
    name: 'agent-factory:precompress',
    apply: 'build',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    closeBundle() {
      for (const entry of readdirSync(outDir, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !COMPRESSIBLE.has(extname(entry.name))) continue;
        const file = join(entry.parentPath, entry.name);
        const raw = readFileSync(file);
        if (raw.length < 1024) continue;
        const br = brotliCompressSync(raw, {
          params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: raw.length },
        });
        if (br.length < raw.length * 0.9) writeFileSync(`${file}.br`, br);
        const gz = gzipSync(raw, { level: 9 });
        if (gz.length < raw.length * 0.9) writeFileSync(`${file}.gz`, gz);
      }
    },
  };
}

export default defineConfig({
  root: 'client',
  publicDir: 'assets',
  plugins: [precompress()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'client/index.html'),
        prototype25dSlice: resolve(__dirname, 'client/prototype-25d-slice.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4242',
        // Browser cookie mutations validate Origin against the original Host.
        changeOrigin: false,
      },
      '/ws': {
        target: 'ws://localhost:4242',
        ws: true,
      },
    },
  },
});
