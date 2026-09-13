import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({ root: resolve('.'), resolve: { alias: { '@shared': resolve('shared') } }, server: { host: '127.0.0.1', port: 4281, strictPort: true } });
