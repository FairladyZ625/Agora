import type { StoredTask } from '@agora-ts/db';
import type { ProjectService } from './project-service.js';

export interface TaskWorktreeServiceOptions {
  projectService: Pick<ProjectService, 'getProjectRepoPath' | 'getProjectStateRoot'>;
}

export class TaskWorktreeService {
  private readonly projectService: Pick<ProjectService, 'getProjectRepoPath' | 'getProjectStateRoot'>;

  constructor(options: TaskWorktreeServiceOptions) {
    this.projectService = options.projectService;
  }

  resolveBaseWorkdir(task: Pick<StoredTask, 'project_id' | 'type'>): string | null {
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
}
