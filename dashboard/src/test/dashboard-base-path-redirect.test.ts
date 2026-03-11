// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import { build, createServer, mergeConfig, preview, type ViteDevServer, type PreviewServer } from 'vite';
import viteConfig from '../../vite.config';

let server: ViteDevServer | PreviewServer | undefined;

async function startServer() {
  server = await createServer(mergeConfig(viteConfig, {
    configFile: false,
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
    },
    appType: 'spa',
  }));
  await server.listen();

  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to resolve Vite dev server port');
  }

  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('dashboard base path redirect', () => {
  it('redirects root requests to /dashboard/', async () => {
    const origin = await startServer();

    const response = await fetch(`${origin}/`, {
      redirect: 'manual',
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/dashboard/');
  });

  it('redirects /dashboard requests to /dashboard/', async () => {
    const origin = await startServer();

    const response = await fetch(`${origin}/dashboard`, {
      redirect: 'manual',
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/dashboard/');
  });

  it('redirects preview root requests to /dashboard/', async () => {
    await build(mergeConfig(viteConfig, {
      configFile: false,
      logLevel: 'silent',
    }));
    server = await preview(mergeConfig(viteConfig, {
      configFile: false,
      logLevel: 'silent',
      preview: {
        host: '127.0.0.1',
        port: 0,
        strictPort: false,
      },
    }));

    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') {
      throw new Error('failed to resolve Vite preview server port');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/`, {
      redirect: 'manual',
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/dashboard/');
  }, 20000);

  it('redirects preview /dashboard requests to /dashboard/', async () => {
    await build(mergeConfig(viteConfig, {
      configFile: false,
      logLevel: 'silent',
    }));
    server = await preview(mergeConfig(viteConfig, {
      configFile: false,
      logLevel: 'silent',
      preview: {
        host: '127.0.0.1',
        port: 0,
        strictPort: false,
      },
    }));

    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') {
      throw new Error('failed to resolve Vite preview server port');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/dashboard`, {
      redirect: 'manual',
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/dashboard/');
  }, 20000);
});
