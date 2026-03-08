import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { checkPortAvailability, validateDevPorts } from './dev-start.js';

async function withListeningServer<T>(callback: (port: number) => Promise<T>): Promise<T> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected a TCP address');
  }

  try {
    return await callback(address.port);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe('dev-start port validation', () => {
  it('reports a port as unavailable when another process is already listening', async () => {
    await withListeningServer(async (port) => {
      await expect(checkPortAvailability(port)).resolves.toEqual({
        port,
        available: false,
      });
    });
  });

  it('returns readable conflicts for occupied backend and frontend ports', async () => {
    await withListeningServer(async (backendPort) => {
      await withListeningServer(async (frontendPort) => {
        await expect(
          validateDevPorts({ backendPort, frontendPort }),
        ).resolves.toEqual([
          `backend port ${backendPort} is already in use`,
          `frontend port ${frontendPort} is already in use`,
        ]);
      });
    });
  });
});
