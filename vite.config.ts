import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'client',
  publicDir: 'assets',
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4242',
      '/ws': {
        target: 'ws://localhost:4242',
        ws: true,
      },
    },
  },
});
