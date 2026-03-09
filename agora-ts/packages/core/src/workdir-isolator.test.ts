import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GitWorktreeWorkdirIsolator } from './workdir-isolator.js';

const tempPaths: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'agora-ts-workdir-isolator-'));
  tempPaths.push(dir);
  return dir;
}

function runGit(cwd: string, args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

afterEach(() => {
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('git worktree workdir isolator', () => {
  it('creates an isolated git worktree for repo workdirs', () => {
    const repoDir = makeTempDir();
    const isolatedRoot = join(makeTempDir(), 'isolated');
    writeFileSync(join(repoDir, 'README.md'), 'hello\n');
    runGit(repoDir, ['init']);
    runGit(repoDir, ['config', 'user.name', 'Agora']);
    runGit(repoDir, ['config', 'user.email', 'agora@example.com']);
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'init']);

    const isolator = new GitWorktreeWorkdirIsolator({ rootDir: isolatedRoot });
    const isolated = isolator.isolate({
      executionId: 'exec-1',
      taskId: 'OC-100',
      subtaskId: 'subtask-1',
      adapter: 'codex',
      workdir: repoDir,
    });

    expect(isolated).not.toBe(repoDir);
    expect(isolated).toContain('OC-100');
    expect(existsSync(join(isolated!, 'README.md'))).toBe(true);
    expect(readFileSync(join(isolated!, 'README.md'), 'utf8')).toContain('hello');
    expect(realpathSync(runGit(isolated!, ['rev-parse', '--show-toplevel']))).toBe(realpathSync(isolated!));
  });

  it('falls back to the original workdir when it is not a git repo', () => {
    const dir = makeTempDir();
    const isolator = new GitWorktreeWorkdirIsolator({ rootDir: join(makeTempDir(), 'isolated') });

    const isolated = isolator.isolate({
      executionId: 'exec-2',
      taskId: 'OC-101',
      subtaskId: 'subtask-2',
      adapter: 'codex',
      workdir: dir,
    });

    expect(isolated).toBe(dir);
  });
});
