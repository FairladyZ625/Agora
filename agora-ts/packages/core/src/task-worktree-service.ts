import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { TaskRecord } from '@agora-ts/contracts';
import type { ProjectService } from './project-service.js';
import { ensureCanonicalProjectRootBootstrapCommit } from './project-state-root.js';

type ExecFileLike = (command: string, args: string[], options?: { cwd?: string }) => string;

export interface TaskWorktreeServiceOptions {
  projectService: Pick<ProjectService, 'getProjectRepoPath' | 'getProjectStateRoot'>;
  execFile?: ExecFileLike;
}

export class TaskWorktreeService {
  private readonly projectService: Pick<ProjectService, 'getProjectRepoPath' | 'getProjectStateRoot'>;
  private readonly execFile: ExecFileLike;

  constructor(options: TaskWorktreeServiceOptions) {
    this.projectService = options.projectService;
    this.execFile = options.execFile ?? ((command, args, execOptions) => execFileSync(command, args, {
      cwd: execOptions?.cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim());
  }

  resolveBaseWorkdir(task: Pick<TaskRecord, 'project_id' | 'type'>): string | null {
    if (!task.project_id) {
      return null;
    }
    const repoPath = this.projectService.getProjectRepoPath(task.project_id);
    const projectStateRoot = this.projectService.getProjectStateRoot(task.project_id);

    if (task.type === 'coding' && repoPath) {
      return repoPath;
    }

    return projectStateRoot ?? repoPath;
  }

  resolveDispatchWorkdir(task: Pick<TaskRecord, 'id' | 'project_id' | 'type'>): string | null {
    const baseWorkdir = this.resolveBaseWorkdir(task);
    if (!baseWorkdir || !task.project_id) {
      return baseWorkdir;
    }

    const repoRoot = this.resolveGitRoot(baseWorkdir);
    if (!repoRoot) {
      return baseWorkdir;
    }

    const projectStateRoot = this.projectService.getProjectStateRoot(task.project_id);
    if (projectStateRoot && resolve(projectStateRoot) === resolve(repoRoot)) {
      ensureCanonicalProjectRootBootstrapCommit(projectStateRoot, { execFile: this.execFile });
    }

    const targetDir = join(
      dirname(resolve(projectStateRoot ?? repoRoot)),
      '.agora-task-worktrees',
      sanitizePathSegment(task.project_id),
      sanitizePathSegment(task.id),
    );
    return this.ensureDetachedWorktree(repoRoot, targetDir);
  }

  private ensureDetachedWorktree(repoRoot: string, targetDir: string) {
    if (existsSync(targetDir)) {
      const existingRoot = this.resolveGitRoot(targetDir);
      if (existingRoot && resolve(existingRoot) === resolve(targetDir)) {
        return targetDir;
      }
      if (this.isRemovableStaleTarget(targetDir)) {
        rmSync(targetDir, { recursive: true, force: true });
      } else {
        throw new Error(`Task worktree target already exists and is not a git worktree: ${targetDir}`);
      }
    }

    mkdirSync(dirname(targetDir), { recursive: true });
    this.execFile(
      'git',
      ['-C', repoRoot, 'worktree', 'add', '--detach', targetDir, this.resolveDefaultRef(repoRoot)],
    );
    return targetDir;
  }

  private resolveGitRoot(workdir: string) {
    try {
      return this.execFile('git', ['-C', workdir, 'rev-parse', '--show-toplevel']);
    } catch {
      return null;
    }
  }

  private resolveDefaultRef(repoRoot: string) {
    try {
      this.execFile('git', ['-C', repoRoot, 'show-ref', '--verify', '--quiet', 'refs/remotes/origin/HEAD']);
      const remoteHead = this.execFile('git', ['-C', repoRoot, 'symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
      return remoteHead.replace(/^refs\/remotes\//, '');
    } catch {
      try {
        const branch = this.execFile('git', ['-C', repoRoot, 'branch', '--show-current']);
        if (branch) {
          return branch;
        }
        return this.execFile('git', ['-C', repoRoot, 'symbolic-ref', '--quiet', '--short', 'HEAD']);
      } catch {
        return 'HEAD';
      }
    }
  }

  private isRemovableStaleTarget(targetDir: string) {
    try {
      return readdirSync(targetDir).length === 0;
    } catch {
      return false;
    }
  }
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-');
}
