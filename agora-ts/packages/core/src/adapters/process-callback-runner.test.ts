import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { runCallbackProcess } from './process-callback-runner.js';

type CallbackRecord = {
  headers: Record<string, string | string[] | undefined>;
  body: string;
} | null;

let closeServer: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (closeServer) {
    await closeServer();
    closeServer = null;
  }
});

describe('process callback runner', () => {
  it('runs a command and posts a success callback payload', async () => {
    let record: CallbackRecord = null;
    const { url, stop } = await startCaptureServer((headers, body) => {
      record = { headers, body };
    });
    closeServer = stop;

    await runCallbackProcess({
      executionId: 'exec-runner-1',
      callbackUrl: url,
      apiToken: 'secret-token',
      command: process.execPath,
      args: ['-e', 'console.log("RUNNER_OK")'],
      cwd: process.cwd(),
    });

    expect(record).not.toBeNull();
    const parsed = JSON.parse(record!.body) as Record<string, unknown>;
    expect(record!.headers.authorization).toBe('Bearer secret-token');
    expect(parsed).toMatchObject({
      execution_id: 'exec-runner-1',
      status: 'succeeded',
      payload: {
        summary: 'RUNNER_OK',
      },
    });
  });
});

async function startCaptureServer(
  onRequest: (headers: Record<string, string | string[] | undefined>, body: string) => void,
) {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    request.on('end', () => {
      onRequest(request.headers, Buffer.concat(chunks).toString('utf8'));
      response.statusCode = 200;
      response.end('ok');
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to bind capture server');
  }

  return {
    url: `http://127.0.0.1:${address.port}/callback`,
    stop: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    }),
  };
}
