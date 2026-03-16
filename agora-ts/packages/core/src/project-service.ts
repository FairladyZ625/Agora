import { ProjectRepository, type AgoraDatabase, type StoredProject } from '@agora-ts/db';
import { NotFoundError } from './errors.js';

export interface CreateProjectInput {
  id: string;
  name: string;
  summary?: string | null | undefined;
  owner?: string | null | undefined;
  metadata?: Record<string, unknown> | null | undefined;
}

export class ProjectService {
  private readonly projects: ProjectRepository;

  constructor(db: AgoraDatabase) {
    this.projects = new ProjectRepository(db);
  }

  createProject(input: CreateProjectInput): StoredProject {
    return this.projects.insertProject({
      id: input.id,
      name: input.name,
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.owner !== undefined ? { owner: input.owner } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    });
  }

  getProject(projectId: string): StoredProject | null {
    return this.projects.getProject(projectId);
  }

  listProjects(status?: string): StoredProject[] {
    return this.projects.listProjects(status);
  }

  requireProject(projectId: string): StoredProject {
    const project = this.projects.getProject(projectId);
    if (!project) {
      throw new NotFoundError(`Project not found: ${projectId}`);
    }
    return project;
  }
}
