import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

type ExecFileLike = (command: string, args: string[], options?: { cwd?: string }) => string;

export interface EnsureCanonicalProjectRootOptions {
  execFile?: ExecFileLike;
}

export function ensureCanonicalProjectRoot(
  root: string,
  options: EnsureCanonicalProjectRootOptions = {},
): boolean {
  mkdirSync(root, { recursive: true });
  if (existsSync(join(root, '.git'))) {
    return false;
  }

  const execFile = resolveExecFile(options.execFile);
  execFile('git', ['-c', 'init.defaultBranch=main', 'init', '--quiet'], { cwd: root });
  return true;
}

export function ensureCanonicalProjectRootBootstrapCommit(
  root: string,
  options: EnsureCanonicalProjectRootOptions & { message?: string } = {},
): boolean {
  if (!existsSync(join(root, '.git'))) {
    return false;
  }
  const execFile = resolveExecFile(options.execFile);
  if (hasGitHead(root, execFile)) {
    return false;
  }
  const status = execFile('git', ['status', '--porcelain'], { cwd: root });
  if (!status.trim()) {
    return false;
  }
  execFile('git', ['add', '-A'], { cwd: root });
  execFile(
    'git',
    [
      '-c', 'user.name=Agora Project Bootstrap',
      '-c', 'user.email=agora-project-bootstrap@local',
      'commit',
      '-m',
      options.message ?? 'chore(project-state): bootstrap canonical repo',
    ],
    { cwd: root },
  );
  return true;
}

function hasGitHead(root: string, execFile: ExecFileLike) {
  try {
    execFile('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

function resolveExecFile(execFile?: ExecFileLike): ExecFileLike {
  return execFile ?? ((command, args, opts) => execFileSync(command, args, {
    cwd: opts?.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim());
}
