import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findAgoraProjectRoot, runStartCommand } from './start-command.js';

const tempPaths: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
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
  mkdirSync(join(root, 'docs/02-PRODUCT/scripts'), { recursive: true });
  writeFileSync(join(root, 'docs/02-PRODUCT/scripts/dev-start.sh'), '#!/usr/bin/env bash\n');
  return root;
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
      args: [join(root, 'docs/02-PRODUCT/scripts/dev-start.sh')],
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
});
