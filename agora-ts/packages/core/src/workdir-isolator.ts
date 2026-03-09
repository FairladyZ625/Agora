import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface WorkdirIsolationRequest {
  executionId: string;
  taskId: string;
  subtaskId: string;
  adapter: string;
  workdir: string | null;
}

export interface WorkdirIsolator {
  isolate(input: WorkdirIsolationRequest): string | null;
}

type ExecFileLike = (command: string, args: string[], options?: { cwd?: string }) => string;

export interface GitWorktreeWorkdirIsolatorOptions {
  rootDir: string;
  execFile?: ExecFileLike;
}

export class GitWorktreeWorkdirIsolator implements WorkdirIsolator {
  private readonly rootDir: string;
  private readonly execFile: ExecFileLike;

  constructor(options: GitWorktreeWorkdirIsolatorOptions) {
    this.rootDir = resolve(options.rootDir);
    this.execFile = options.execFile ?? ((command, args, opts) => execFileSync(command, args, {
      cwd: opts?.cwd,
      encoding: 'utf8',
    }).trim());
  }

  isolate(input: WorkdirIsolationRequest): string | null {
    if (!input.workdir) {
      return null;
    }
    const repoRoot = this.resolveGitRoot(input.workdir);
    if (!repoRoot) {
      return input.workdir;
    }

    mkdirSync(this.rootDir, { recursive: true });
    const targetDir = join(
      this.rootDir,
      sanitizePathSegment(input.adapter),
      sanitizePathSegment(input.taskId),
      `${sanitizePathSegment(input.subtaskId)}-${sanitizePathSegment(input.executionId)}`,
    );
    if (!existsSync(targetDir)) {
      mkdirSync(join(this.rootDir, sanitizePathSegment(input.adapter), sanitizePathSegment(input.taskId)), { recursive: true });
      this.execFile('git', ['-C', repoRoot, 'worktree', 'add', '--detach', targetDir, 'HEAD']);
    }
    return targetDir;
  }

  private resolveGitRoot(workdir: string) {
    try {
      return this.execFile('git', ['-C', workdir, 'rev-parse', '--show-toplevel']);
    } catch {
      return null;
    }
  }
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-');
}
