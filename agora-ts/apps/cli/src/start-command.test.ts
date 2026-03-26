import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { spawn } = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn,
}));

import { defaultStartCommandRunner, findAgoraProjectRoot, runStartCommand } from './start-command.js';

const tempPaths: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  spawn.mockReset();
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function makeProjectRoot() {
  const root = mkdtempSync(join(tmpdir(), 'agora-start-command-'));
  tempPaths.push(root);
  mkdirSync(join(root, 'scripts'), { recursive: true });
  writeFileSync(join(root, 'scripts/dev-start.sh'), '#!/usr/bin/env bash\n');
  return root;
}

function createChildProcessStub() {
  const child = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof vi.fn>;
  };
  child.kill = vi.fn();
  return child;
}

describe('findAgoraProjectRoot', () => {
  it('walks upward until it finds the dev-start script', () => {
    const root = makeProjectRoot();
    const nested = join(root, 'agora-ts/apps/cli');
    mkdirSync(nested, { recursive: true });

    expect(findAgoraProjectRoot(nested)).toBe(root);
  });

  it('returns null when no repo root can be found', () => {
    const root = mkdtempSync(join(tmpdir(), 'agora-start-command-missing-'));
    tempPaths.push(root);

    expect(findAgoraProjectRoot(root)).toBeNull();
  });
});

describe('runStartCommand', () => {
  it('launches the existing dev-start script from the discovered repo root', async () => {
    const root = makeProjectRoot();
    const nested = join(root, 'dashboard/src');
    mkdirSync(nested, { recursive: true });
    const runner = vi.fn().mockResolvedValue(undefined);

    await runStartCommand({
      cwd: nested,
      runner,
    });

    expect(runner).toHaveBeenCalledWith({
      command: 'bash',
      args: [join(root, 'scripts/dev-start.sh')],
      cwd: root,
      env: process.env,
    });
  });

  it('throws a clear error when run outside the Agora repository', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agora-start-command-outside-'));
    tempPaths.push(root);

    await expect(runStartCommand({ cwd: root, fallbackRoot: root, runner: vi.fn() })).rejects.toThrow(
      '未找到 Agora 项目根目录',
    );
  });

  it('falls back to the provided root when cwd is outside the repository', async () => {
    const fallbackRoot = makeProjectRoot();
    const outside = mkdtempSync(join(tmpdir(), 'agora-start-command-fallback-'));
    tempPaths.push(outside);
    const runner = vi.fn().mockResolvedValue(undefined);

    await runStartCommand({
      cwd: outside,
      fallbackRoot,
      runner,
    });

    expect(runner).toHaveBeenCalledWith({
      command: 'bash',
      args: [join(fallbackRoot, 'scripts/dev-start.sh')],
      cwd: fallbackRoot,
      env: process.env,
    });
  });

  it('runs the default child-process runner successfully', async () => {
    const child = createChildProcessStub();
    spawn.mockReturnValue(child);

    const pending = defaultStartCommandRunner({
      command: 'bash',
      args: ['/repo/scripts/dev-start.sh'],
      cwd: '/repo',
      env: process.env,
    });
    child.emit('exit', 0, null);

    await expect(pending).resolves.toBeUndefined();
    expect(spawn).toHaveBeenCalledWith('bash', ['/repo/scripts/dev-start.sh'], expect.objectContaining({
      cwd: '/repo',
      env: process.env,
      stdio: 'inherit',
    }));
  });

  it('surfaces signal and non-zero exit failures from the default runner', async () => {
    const signalChild = createChildProcessStub();
    spawn.mockReturnValueOnce(signalChild);
    const signalPending = defaultStartCommandRunner({
      command: 'bash',
      args: ['/repo/scripts/dev-start.sh'],
      cwd: '/repo',
      env: process.env,
    });
    signalChild.emit('exit', null, 'SIGTERM');
    await expect(signalPending).rejects.toThrow('本地开发栈启动被信号中断');

    const codeChild = createChildProcessStub();
    spawn.mockReturnValueOnce(codeChild);
    const codePending = defaultStartCommandRunner({
      command: 'bash',
      args: ['/repo/scripts/dev-start.sh'],
      cwd: '/repo',
      env: process.env,
    });
    codeChild.emit('exit', 2, null);
    await expect(codePending).rejects.toThrow('本地开发栈启动失败');
  });
});
