import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@agora-ts/contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)),
      '@agora-ts/db': fileURLToPath(new URL('./packages/db/src/index.ts', import.meta.url)),
      '@agora-ts/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
  },
});
