import { randomBytes } from 'node:crypto';
import { ProjectRepository, TaskRepository, type AgoraDatabase, type StoredProject } from '@agora-ts/db';
import type {
  CreateProjectAdminDto,
  CreateProjectAgentRosterEntryDto,
  CreateProjectMembershipDto,
} from '@agora-ts/contracts';
import { NotFoundError } from './errors.js';
import { ProjectAgentRosterService } from './project-agent-roster-service.js';
import { ProjectMembershipService } from './project-membership-service.js';
import type {
  ProjectKnowledgeDocument,
  ProjectKnowledgeEntryInput,
  ProjectKnowledgeKind,
  ProjectKnowledgePort,
  ProjectKnowledgeRecapSummary,
  ProjectKnowledgeSearchResult,
} from './project-knowledge-port.js';
import type { ProjectBrainIndexQueueService } from './project-brain-index-queue-service.js';

export interface CreateProjectInput {
  id?: string | null | undefined;
  name: string;
  summary?: string | null | undefined;
  owner?: string | null | undefined;
  metadata?: Record<string, unknown> | null | undefined;
  admins?: CreateProjectAdminDto[] | undefined;
  members?: CreateProjectMembershipDto[] | undefined;
  default_agents?: CreateProjectAgentRosterEntryDto[] | undefined;
}

export interface ProjectServiceOptions {
  knowledgePort?: ProjectKnowledgePort;
  projectBrainIndexQueueService?: Pick<ProjectBrainIndexQueueService, 'enqueueDocumentSync'>;
}

export class ProjectService {
  private readonly projects: ProjectRepository;
  private readonly tasks: TaskRepository;
  private readonly memberships: ProjectMembershipService;
  private readonly agentRoster: ProjectAgentRosterService;
  private readonly knowledgePort: ProjectKnowledgePort | undefined;
  private readonly projectBrainIndexQueueService: Pick<ProjectBrainIndexQueueService, 'enqueueDocumentSync'> | undefined;

  constructor(private readonly db: AgoraDatabase, options: ProjectServiceOptions = {}) {
    this.projects = new ProjectRepository(db);
    this.tasks = new TaskRepository(db);
    this.memberships = new ProjectMembershipService(db);
    this.agentRoster = new ProjectAgentRosterService(db);
    this.knowledgePort = options.knowledgePort;
    this.projectBrainIndexQueueService = options.projectBrainIndexQueueService;
  }

  createProject(input: CreateProjectInput): StoredProject {
    const projectId = input.id?.trim() || this.generateProjectId(input.name);
    if ((input.admins || input.members || input.default_agents) && (!input.admins || input.admins.length === 0)) {
      throw new Error('createProject requires at least one project admin when seeding memberships or default agents');
    }
    let project: StoredProject;
    this.db.exec('BEGIN');
    try {
      project = this.projects.insertProject({
        id: projectId,
        name: input.name,
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.owner !== undefined ? { owner: input.owner } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      });
      if (input.admins && input.admins.length > 0) {
        this.memberships.seedProjectMemberships({
          projectId,
          admins: input.admins,
          members: input.members,
        });
      }
      if (input.default_agents && input.default_agents.length > 0) {
        this.agentRoster.seedProjectRoster(projectId, input.default_agents);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
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

  updateProjectMetadata(projectId: string, metadata: Record<string, unknown> | null): StoredProject {
    this.requireProject(projectId);
    return this.projects.updateProject(projectId, { metadata });
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
    this.projectBrainIndexQueueService?.enqueueDocumentSync({
      project_id: input.project_id,
      document_kind: 'timeline',
      document_slug: 'timeline',
      reason: 'task_binding',
    });
    this.projectBrainIndexQueueService?.enqueueDocumentSync({
      project_id: input.project_id,
      document_kind: 'index',
      document_slug: 'index',
      reason: 'task_binding',
    });
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
    this.projectBrainIndexQueueService?.enqueueDocumentSync({
      project_id: input.project_id,
      document_kind: 'timeline',
      document_slug: 'timeline',
      reason: 'task_recap',
    });
    this.projectBrainIndexQueueService?.enqueueDocumentSync({
      project_id: input.project_id,
      document_kind: 'index',
      document_slug: 'index',
      reason: 'task_recap',
    });
    this.projectBrainIndexQueueService?.enqueueDocumentSync({
      project_id: input.project_id,
      document_kind: 'recap',
      document_slug: input.task_id,
      reason: 'task_recap',
    });
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
    const document = this.knowledgePort.upsertKnowledgeEntry(input);
    this.projectBrainIndexQueueService?.enqueueDocumentSync({
      project_id: input.project_id,
      document_kind: input.kind,
      document_slug: input.slug,
      reason: 'knowledge_upsert',
    });
    this.projectBrainIndexQueueService?.enqueueDocumentSync({
      project_id: input.project_id,
      document_kind: 'index',
      document_slug: 'index',
      reason: 'knowledge_upsert',
    });
    return document;
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

  archiveProject(projectId: string): StoredProject {
    const project = this.requireProject(projectId);
    const blockingTasks = this.tasks.listTasks(undefined, projectId)
      .filter((task) => task.state !== 'done' && task.state !== 'cancelled');
    if (blockingTasks.length > 0) {
      throw new Error(`Cannot archive project ${projectId} while active tasks still exist`);
    }
    if (project.status === 'archived') {
      return project;
    }
    return this.projects.updateProject(projectId, { status: 'archived' });
  }

  deleteProject(projectId: string): void {
    const project = this.requireProject(projectId);
    if (project.status !== 'archived') {
      throw new Error(`Cannot delete project ${projectId} before it is archived`);
    }
    const remainingTasks = this.tasks.listTasks(undefined, projectId);
    if (remainingTasks.length > 0) {
      throw new Error(`Cannot delete project ${projectId} while tasks are still bound to it`);
    }
    this.projects.deleteProject(projectId);
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
