import { createServer } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface PortAvailability {
  port: number;
  available: boolean;
}

export async function checkPortAvailability(port: number, host = '127.0.0.1'): Promise<PortAvailability> {
  try {
    const result = await execFileAsync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN']);
    if (result.stdout.trim() || result.stderr.trim() === '') {
      return { port, available: false };
    }
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & { code?: number | string };
    const exitCode = typeof execError.code === 'number' ? execError.code : undefined;
    if (exitCode !== 1 && execError.code !== 'ENOENT') {
      throw error;
    }
    if (execError.code === 'ENOENT') {
      // Fall back to optimistic bind probing when lsof is unavailable.
    } else if (exitCode === 1) {
      return probeByBinding(port, host);
    }
  }

  return { port, available: false };
}

function probeByBinding(port: number, host: string): Promise<PortAvailability> {
  const server = createServer();

  return new Promise((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        resolve({ port, available: false });
        return;
      }
      reject(error);
    });

    server.listen(port, host, () => {
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve({ port, available: true });
      });
    });
  });
}

export async function validateDevPorts(options: {
  backendPort: number;
  frontendPort: number;
  host?: string;
}): Promise<string[]> {
  const host = options.host ?? '127.0.0.1';
  const checks = await Promise.all([
    checkPortAvailability(options.backendPort, host),
    checkPortAvailability(options.frontendPort, host),
  ]);

  return checks.flatMap((check, index) => {
    if (check.available) {
      return [];
    }
    const label = index === 0 ? 'backend' : 'frontend';
    return `${label} port ${check.port} is already in use`;
  });
}
