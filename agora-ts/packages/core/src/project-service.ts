import { ProjectRepository, type AgoraDatabase, type StoredProject } from '@agora-ts/db';
import { NotFoundError } from './errors.js';
import type {
  ProjectKnowledgeDocument,
  ProjectKnowledgePort,
  ProjectKnowledgeRecapSummary,
} from './project-knowledge-port.js';

export interface CreateProjectInput {
  id: string;
  name: string;
  summary?: string | null | undefined;
  owner?: string | null | undefined;
  metadata?: Record<string, unknown> | null | undefined;
}

export interface ProjectServiceOptions {
  knowledgePort?: ProjectKnowledgePort;
}

export class ProjectService {
  private readonly projects: ProjectRepository;
  private readonly knowledgePort: ProjectKnowledgePort | undefined;

  constructor(db: AgoraDatabase, options: ProjectServiceOptions = {}) {
    this.projects = new ProjectRepository(db);
    this.knowledgePort = options.knowledgePort;
  }

  createProject(input: CreateProjectInput): StoredProject {
    const project = this.projects.insertProject({
      id: input.id,
      name: input.name,
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.owner !== undefined ? { owner: input.owner } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    });
    this.knowledgePort?.ensureProject({
      id: project.id,
      name: project.name,
      summary: project.summary,
      status: project.status,
      owner: project.owner,
    });
    return project;
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

  recordTaskBinding(input: {
    project_id: string;
    task_id: string;
    title: string;
    state: string;
    workspace_path: string | null;
    bound_at: string;
  }): void {
    this.requireProject(input.project_id);
    this.knowledgePort?.recordTaskBinding(input);
  }

  recordTaskRecap(input: {
    project_id: string;
    task_id: string;
    title: string;
    state: string;
    current_stage: string | null;
    controller_ref: string | null;
    workspace_path: string | null;
    completed_by: string;
    completed_at: string;
    summary_lines: string[];
  }): void {
    this.requireProject(input.project_id);
    this.knowledgePort?.recordTaskRecap(input);
  }

  getProjectIndex(projectId: string): ProjectKnowledgeDocument | null {
    this.requireProject(projectId);
    return this.knowledgePort?.getProjectIndex(projectId) ?? null;
  }

  listProjectRecaps(projectId: string): ProjectKnowledgeRecapSummary[] {
    this.requireProject(projectId);
    return this.knowledgePort?.listProjectRecaps(projectId) ?? [];
  }
}
