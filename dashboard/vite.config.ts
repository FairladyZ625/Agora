import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { loadEnv } from 'vite';
import { resolveAgoraRuntimeEnvironment } from '../agora-ts/packages/config/src/env';

const repoRoot = path.resolve(__dirname, '..');
const loadedEnv = loadEnv('', repoRoot, '');
const runtimeEnv = resolveAgoraRuntimeEnvironment(__dirname, loadedEnv);
const dashboardBasePath = '/dashboard/';

function createBasePathRedirectMiddleware(basePath: string) {
  const canonicalBasePath = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const slashlessBasePath = canonicalBasePath.slice(0, -1);

  return (req: { url?: string }, res: { statusCode: number; setHeader(name: string, value: string): void; end(): void }, next: () => void) => {
    const requestUrl = req.url ?? '/';
    const pathname = requestUrl.split('?')[0] ?? '/';

    if (pathname === '/' || pathname === slashlessBasePath) {
      res.statusCode = 302;
      res.setHeader('Location', canonicalBasePath);
      res.end();
      return;
    }

    next();
  };
}

function dashboardBaseRedirectPlugin(basePath: string) {
  const middleware = createBasePathRedirectMiddleware(basePath);

  return {
    name: 'agora-dashboard-base-redirect',
    configureServer(server: { middlewares: { use(fn: typeof middleware): void } }) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server: { middlewares: { use(fn: typeof middleware): void } }) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), dashboardBaseRedirectPlugin(dashboardBasePath)],
  base: dashboardBasePath,
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
        statements: 68,
        branches: 55,
        functions: 65,
        lines: 67,
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
