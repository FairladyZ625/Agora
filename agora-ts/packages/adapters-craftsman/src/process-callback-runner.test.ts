import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'node:child_process';
import { parseRunnerPayloadArg, runCallbackProcess } from './process-callback-runner.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('process callback runner', () => {
  it('throws a descriptive error when the runner payload is invalid json', () => {
    expect(() => parseRunnerPayloadArg('{invalid-json')).toThrow(/invalid process callback runner payload/i);
  });

  it('runs a command and posts a success callback payload', async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough };
    child.stdout = stdout;
    child.stderr = stderr;
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => {
        stdout.write('RUNNER_OK\n');
        stdout.end();
        stderr.end();
        child.emit('close', 0);
      });
      return child as never;
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await runCallbackProcess({
      executionId: 'exec-runner-1',
      callbackUrl: 'http://127.0.0.1:9999/callback',
      apiToken: 'secret-token',
      command: '/usr/bin/node',
      args: ['-e', 'console.log("RUNNER_OK")'],
      cwd: process.cwd(),
    });

    expect(spawn).toHaveBeenCalledWith('/usr/bin/node', ['-e', 'console.log("RUNNER_OK")'], expect.objectContaining({
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:9999/callback');
    expect(init.headers).toEqual(expect.objectContaining({
      authorization: 'Bearer secret-token',
      'content-type': 'application/json',
    }));

    const parsed = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      execution_id: 'exec-runner-1',
      status: 'succeeded',
      payload: {
        output: {
          summary: 'RUNNER_OK',
        },
      },
    });
  });

  it('posts a failed callback payload with stderr when the child exits non-zero', async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough };
    child.stdout = stdout;
    child.stderr = stderr;
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => {
        stdout.write('partial output\n');
        stdout.end();
        stderr.write('runner exploded\n');
        stderr.end();
        child.emit('close', 7);
      });
      return child as never;
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await runCallbackProcess({
      executionId: 'exec-runner-2',
      callbackUrl: 'http://127.0.0.1:9999/callback',
      apiToken: null,
      command: '/usr/bin/node',
      args: ['-e', 'process.exit(7)'],
      cwd: process.cwd(),
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({
      'content-type': 'application/json',
    });

    const parsed = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      execution_id: 'exec-runner-2',
      status: 'failed',
      error: 'runner exploded',
      payload: {
        output: {
          text: 'partial output',
          stderr: 'runner exploded',
        },
      },
    });
  });

  it('falls back to the default failure payload when the child emits no output', async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough };
    child.stdout = stdout;
    child.stderr = stderr;
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => {
        stdout.end();
        stderr.end();
        child.emit('close', 1);
      });
      return child as never;
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await runCallbackProcess({
      executionId: 'exec-runner-4',
      callbackUrl: 'http://127.0.0.1:9999/callback',
      apiToken: null,
      command: '/usr/bin/node',
      args: ['-e', 'process.exit(1)'],
      cwd: process.cwd(),
      env: {
        AGORA_EXECUTION: 'exec-runner-4',
      },
    });

    expect(spawn).toHaveBeenCalledWith(
      '/usr/bin/node',
      ['-e', 'process.exit(1)'],
      expect.objectContaining({
        env: expect.objectContaining({
          AGORA_EXECUTION: 'exec-runner-4',
        }),
      }),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      execution_id: 'exec-runner-4',
      status: 'failed',
      error: 'craftsman failed',
      payload: {
        output: {
          summary: null,
          text: null,
          stderr: 'craftsman failed',
        },
      },
    });
  });

  it('rejects when the child process fails before producing a callback payload', async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough };
    child.stdout = stdout;
    child.stderr = stderr;
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => {
        child.emit('error', new Error('spawn failed'));
      });
      return child as never;
    });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(runCallbackProcess({
      executionId: 'exec-runner-3',
      callbackUrl: 'http://127.0.0.1:9999/callback',
      apiToken: 'secret-token',
      command: '/usr/bin/node',
      args: ['-e', 'console.log("never")'],
      cwd: process.cwd(),
    })).rejects.toThrow('spawn failed');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the default success summary when stdout is empty', async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough };
    child.stdout = stdout;
    child.stderr = stderr;
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => {
        stdout.end();
        stderr.end();
        child.emit('close', 0);
      });
      return child as never;
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await runCallbackProcess({
      executionId: 'exec-runner-5',
      callbackUrl: 'http://127.0.0.1:9999/callback',
      apiToken: 'secret-token',
      command: '/usr/bin/node',
      args: ['-e', 'process.exit(0)'],
      cwd: process.cwd(),
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      execution_id: 'exec-runner-5',
      status: 'succeeded',
      error: null,
      payload: {
        output: {
          summary: 'craftsman completed',
          text: null,
          stderr: null,
        },
      },
    });
  });
});
