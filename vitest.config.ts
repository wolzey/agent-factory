import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared'),
    },
  },
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
    // Server logs from passing tests were about half the output; failures still print theirs.
    silent: 'passed-only',
    // Route and geometry sweeps take 5-8s on a busy machine; the 5s default failed them spuriously.
    testTimeout: 20_000,
  },
});
