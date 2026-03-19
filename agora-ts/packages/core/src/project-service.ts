import { randomBytes } from 'node:crypto';
import { ProjectRepository, type AgoraDatabase, type StoredProject } from '@agora-ts/db';
import { NotFoundError } from './errors.js';
import type {
  ProjectKnowledgeDocument,
  ProjectKnowledgeEntryInput,
  ProjectKnowledgeKind,
  ProjectKnowledgePort,
  ProjectKnowledgeRecapSummary,
  ProjectKnowledgeSearchResult,
} from './project-knowledge-port.js';

export interface CreateProjectInput {
  id?: string | null | undefined;
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
    const projectId = input.id?.trim() || this.generateProjectId(input.name);
    const project = this.projects.insertProject({
      id: projectId,
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

  upsertKnowledgeEntry(input: ProjectKnowledgeEntryInput): ProjectKnowledgeDocument {
    this.requireProject(input.project_id);
    if (!this.knowledgePort) {
      throw new Error('Project knowledge port is not configured');
    }
    return this.knowledgePort.upsertKnowledgeEntry(input);
  }

  listKnowledgeEntries(projectId: string, kind?: ProjectKnowledgeKind): ProjectKnowledgeDocument[] {
    this.requireProject(projectId);
    return this.knowledgePort?.listKnowledgeEntries(projectId, kind) ?? [];
  }

  getKnowledgeEntry(projectId: string, kind: ProjectKnowledgeKind, slug: string): ProjectKnowledgeDocument | null {
    this.requireProject(projectId);
    return this.knowledgePort?.getKnowledgeEntry(projectId, kind, slug) ?? null;
  }

  searchProjectKnowledge(projectId: string, query: string, kind?: ProjectKnowledgeKind | 'recap'): ProjectKnowledgeSearchResult[] {
    this.requireProject(projectId);
    return this.knowledgePort?.searchProjectKnowledge(projectId, query, kind) ?? [];
  }

  private generateProjectId(name: string) {
    const slug = slugifyProjectName(name);
    const base = slug ? `proj-${slug}` : 'proj-auto';
    const normalizedBase = trimProjectId(base);
    if (!this.projects.getProject(normalizedBase)) {
      return normalizedBase;
    }
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const suffix = randomBytes(3).toString('hex');
      const candidate = trimProjectId(`${normalizedBase}-${suffix}`);
      if (!this.projects.getProject(candidate)) {
        return candidate;
      }
    }
    throw new Error(`Failed to generate unique project id for ${name}`);
  }
}

function slugifyProjectName(input: string) {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function trimProjectId(input: string) {
  const trimmed = input.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
  return (trimmed.slice(0, 63).replace(/-+$/g, '') || 'proj-auto');
}
