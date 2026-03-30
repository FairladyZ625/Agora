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

  const execFile = options.execFile ?? ((command, args, opts) => execFileSync(command, args, {
    cwd: opts?.cwd,
    encoding: 'utf8',
  }).trim());
  execFile('git', ['init'], { cwd: root });
  return true;
}
