import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { loadEnv } from 'vite';
import { resolveAgoraRuntimeEnvironment } from '../agora-ts/packages/config/src/env';

const repoRoot = path.resolve(__dirname, '..');
const loadedEnv = loadEnv('', repoRoot, '');
const runtimeEnv = resolveAgoraRuntimeEnvironment(__dirname, loadedEnv);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/dashboard/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@agora-ts/contracts': path.resolve(__dirname, '../agora-ts/packages/contracts/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      exclude: [
        'src/test/**',
        'scripts/**',
        'src/index.css',
        'src/main.tsx',
      ],
      thresholds: {
        statements: 70,
        branches: 55,
        functions: 65,
        lines: 70,
      },
    },
  },
  server: {
    proxy: {
      '/api': runtimeEnv.apiBaseUrl,
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          if (id.includes('react') || id.includes('scheduler')) {
            return 'react-vendor';
          }
          if (id.includes('i18next') || id.includes('react-i18next')) {
            return 'i18n-vendor';
          }
          if (id.includes('motion') || id.includes('framer-motion')) {
            return 'motion-vendor';
          }
          if (id.includes('lucide-react') || id.includes('react-router')) {
            return 'ui-vendor';
          }
          return undefined;
        },
      },
    },
  },
});
