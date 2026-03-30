import type { StoredTask } from '@agora-ts/db';
import type { ProjectService } from './project-service.js';

export interface TaskWorktreeServiceOptions {
  projectService: Pick<ProjectService, 'getProject'>;
}

export class TaskWorktreeService {
  private readonly projectService: Pick<ProjectService, 'getProject'>;

  constructor(options: TaskWorktreeServiceOptions) {
    this.projectService = options.projectService;
  }

  resolveBaseWorkdir(task: Pick<StoredTask, 'project_id' | 'type'>): string | null {
    if (!task.project_id) {
      return null;
    }
    const project = this.projectService.getProject(task.project_id);
    if (!project) {
      return null;
    }

    const metadata = project.metadata ?? {};
    const repoPath = typeof metadata.repo_path === 'string' ? metadata.repo_path : null;
    const projectStateRoot = readProjectStateRoot(metadata);

    if (task.type === 'coding' && repoPath) {
      return repoPath;
    }

    return projectStateRoot ?? repoPath;
  }
}

function readProjectStateRoot(metadata: Record<string, unknown>) {
  const agora = asRecord(metadata.agora);
  const nomos = asRecord(agora?.nomos);
  if (typeof nomos?.project_state_root === 'string' && nomos.project_state_root.length > 0) {
    return nomos.project_state_root;
  }
  if (typeof nomos?.active_root === 'string' && nomos.active_root.length > 0) {
    return nomos.active_root;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
