import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@agora-ts/config': fileURLToPath(new URL('./packages/config/src/index.ts', import.meta.url)),
      '@agora-ts/contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)),
      '@agora-ts/db': fileURLToPath(new URL('./packages/db/src/index.ts', import.meta.url)),
      '@agora-ts/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@agora-ts/testing': fileURLToPath(new URL('./packages/testing/src/index.ts', import.meta.url)),
      '@agora-ts/adapters-brain': fileURLToPath(new URL('./packages/adapters-brain/src/index.ts', import.meta.url)),
      '@agora-ts/adapters-craftsman': fileURLToPath(new URL('./packages/adapters-craftsman/src/index.ts', import.meta.url)),
      '@agora-ts/adapters-discord': fileURLToPath(new URL('./packages/adapters-discord/src/index.ts', import.meta.url)),
      '@agora-ts/adapters-host': fileURLToPath(new URL('./packages/adapters-host/src/index.ts', import.meta.url)),
      '@agora-ts/adapters-openclaw': fileURLToPath(new URL('./packages/adapters-openclaw/src/index.ts', import.meta.url)),
      '@agora-ts/adapters-runtime': fileURLToPath(new URL('./packages/adapters-runtime/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts', 'scripts/**/*.test.ts'],
    maxWorkers: 2,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      exclude: [
        '**/*.test.ts',
        'packages/contracts/src/index.ts',
        'packages/contracts/src/health.ts',
        'packages/core/src/index.ts',
        'packages/db/src/index.ts',
      ],
      thresholds: {
        statements: 75,
        branches: 60,
        functions: 89.95,
        lines: 75,
      },
    },
  },
});
