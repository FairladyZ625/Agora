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
  it('reports a free port as available', async () => {
    const probeServer = createServer();
    await new Promise<void>((resolve, reject) => {
      probeServer.once('error', reject);
      probeServer.listen(0, '127.0.0.1', () => resolve());
    });

    const address = probeServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected a TCP address');
    }

    const availablePort = address.port;
    await new Promise<void>((resolve, reject) => {
      probeServer.close((error) => (error ? reject(error) : resolve()));
    });

    await expect(checkPortAvailability(availablePort)).resolves.toEqual({
      port: availablePort,
      available: true,
    });
  });

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

  it('returns no conflicts when both ports are free', async () => {
    const backendServer = createServer();
    const frontendServer = createServer();
    await new Promise<void>((resolve, reject) => {
      backendServer.once('error', reject);
      backendServer.listen(0, '127.0.0.1', () => resolve());
    });
    await new Promise<void>((resolve, reject) => {
      frontendServer.once('error', reject);
      frontendServer.listen(0, '127.0.0.1', () => resolve());
    });

    const backendAddress = backendServer.address();
    const frontendAddress = frontendServer.address();
    if (!backendAddress || typeof backendAddress === 'string' || !frontendAddress || typeof frontendAddress === 'string') {
      throw new Error('Expected TCP addresses');
    }

    await new Promise<void>((resolve, reject) => {
      backendServer.close((error) => (error ? reject(error) : resolve()));
    });
    await new Promise<void>((resolve, reject) => {
      frontendServer.close((error) => (error ? reject(error) : resolve()));
    });

    await expect(
      validateDevPorts({ backendPort: backendAddress.port, frontendPort: frontendAddress.port }),
    ).resolves.toEqual([]);
  });
});
