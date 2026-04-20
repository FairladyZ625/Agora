import { randomBytes } from 'node:crypto';
import type { CreateProjectAdminDto, CreateProjectAgentRosterEntryDto, CreateProjectMembershipDto, IProjectRepository, ITaskRepository, ProjectRecord, TransactionManager } from '@agora-ts/contracts';
import { NotFoundError } from './errors.js';
import type { ProjectAgentRosterService } from './project-agent-roster-service.js';
import type { ProjectMembershipService } from './project-membership-service.js';
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

export interface ProjectImSpaceBinding {
  provider: string;
  conversation_ref: string;
  parent_ref?: string | null;
  kind?: string | null;
  managed_by?: string | null;
}

export interface ProjectRuntimeTargetResolutionInput {
  role?: string | null;
  runtime_flavor?: string | null;
  model_preference?: string | null;
}

export interface ProjectRuntimeTargetResolution {
  target_ref: string;
  runtime_flavor: string | null;
  selected_by: 'project_flavor_default' | 'project_purpose_default' | 'project_default';
  selected_reason: string;
}

export interface ProjectServiceOptions {
  projectRepository: IProjectRepository;
  taskRepository: ITaskRepository;
  membershipService: ProjectMembershipService;
  agentRosterService: ProjectAgentRosterService;
  transactionManager: TransactionManager;
  knowledgePort?: ProjectKnowledgePort;
  projectBrainIndexQueueService?: Pick<ProjectBrainIndexQueueService, 'enqueueDocumentSync'>;
}

export class ProjectService {
  private readonly projects: IProjectRepository;
  private readonly tasks: ITaskRepository;
  private readonly memberships: ProjectMembershipService;
  private readonly agentRoster: ProjectAgentRosterService;
  private readonly knowledgePort: ProjectKnowledgePort | undefined;
  private readonly projectBrainIndexQueueService: Pick<ProjectBrainIndexQueueService, 'enqueueDocumentSync'> | undefined;
  private readonly tx: TransactionManager;

  constructor(options: ProjectServiceOptions) {
    this.projects = options.projectRepository;
    this.tasks = options.taskRepository;
    this.memberships = options.membershipService;
    this.agentRoster = options.agentRosterService;
    this.tx = options.transactionManager;
    this.knowledgePort = options.knowledgePort;
    this.projectBrainIndexQueueService = options.projectBrainIndexQueueService;
  }

  createProject(input: CreateProjectInput): ProjectRecord {
    const projectId = input.id?.trim() || this.generateProjectId(input.name);
    if ((input.admins || input.members || input.default_agents) && (!input.admins || input.admins.length === 0)) {
      throw new Error('createProject requires at least one project admin when seeding memberships or default agents');
    }
    let project: ProjectRecord;
    this.tx.begin();
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
          ...(input.members ? { members: input.members } : {}),
        });
      }
      if (input.default_agents && input.default_agents.length > 0) {
        this.agentRoster.seedProjectRoster(projectId, input.default_agents);
      }
      this.tx.commit();
    } catch (error) {
      this.tx.rollback();
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

  getProject(projectId: string): ProjectRecord | null {
    return this.projects.getProject(projectId);
  }

  getProjectRepoPath(projectId: string): string | null {
    const project = this.requireProject(projectId);
    const metadata = asRecord(project.metadata);
    return typeof metadata?.repo_path === 'string' && metadata.repo_path.length > 0
      ? metadata.repo_path
      : null;
  }

  getProjectStateRoot(projectId: string): string | null {
    const project = this.requireProject(projectId);
    const metadata = asRecord(project.metadata);
    const agora = asRecord(metadata?.agora);
    const nomos = asRecord(agora?.nomos);
    if (typeof nomos?.project_state_root === 'string' && nomos.project_state_root.length > 0) {
      return nomos.project_state_root;
    }
    if (typeof nomos?.active_root === 'string' && nomos.active_root.length > 0) {
      return nomos.active_root;
    }
    return null;
  }

  resolveProjectRuntimeTarget(
    projectId: string,
    input: ProjectRuntimeTargetResolutionInput = {},
  ): ProjectRuntimeTargetResolution | null {
    const project = this.requireProject(projectId);
    return resolveProjectRuntimeTargetFromMetadata(project.metadata, input);
  }

  listProjectMemberships(projectId: string) {
    this.requireProject(projectId);
    return this.memberships.listProjectMemberships(projectId);
  }

  addProjectMembership(input: {
    projectId: string;
    account_id: number;
    role: 'admin' | 'member';
    added_by_account_id?: number | null;
  }) {
    this.requireProject(input.projectId);
    return this.memberships.addProjectMembership(input);
  }

  removeProjectMembership(projectId: string, accountId: number) {
    this.requireProject(projectId);
    return this.memberships.removeProjectMembership(projectId, accountId);
  }

  updateProjectMetadata(projectId: string, metadata: Record<string, unknown> | null): ProjectRecord {
    this.requireProject(projectId);
    return this.projects.updateProject(projectId, { metadata });
  }

  getProjectImSpace(projectId: string, provider: string): ProjectImSpaceBinding | null {
    const project = this.requireProject(projectId);
    return extractProjectImSpace(project, provider);
  }

  findProjectByImSpace(provider: string, conversationRef: string): ProjectRecord | null {
    const items = this.projects.listProjects('active');
    for (const project of items) {
      const binding = extractProjectImSpace(project, provider);
      if (binding?.conversation_ref === conversationRef) {
        return project;
      }
    }
    return null;
  }

  upsertProjectImSpace(projectId: string, binding: ProjectImSpaceBinding): ProjectRecord {
    const project = this.requireProject(projectId);
    const nextMetadata = mergeProjectImSpace(project.metadata, normalizeProjectImSpace(binding));
    return this.projects.updateProject(projectId, { metadata: nextMetadata });
  }

  listProjects(status?: string): ProjectRecord[] {
    return this.projects.listProjects(status);
  }

  requireProject(projectId: string): ProjectRecord {
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

  archiveProject(projectId: string): ProjectRecord {
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
    this.knowledgePort?.deleteProject(projectId);
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function resolveProjectRuntimeTargetFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  input: ProjectRuntimeTargetResolutionInput,
): ProjectRuntimeTargetResolution | null {
  const root = asRecord(metadata);
  const runtimeTargets = asRecord(root?.runtime_targets) ?? asRecord(asRecord(root?.agora)?.runtime_targets);
  if (!runtimeTargets) {
    return null;
  }

  const explicitFlavor = normalizeRuntimeFlavor(input.runtime_flavor ?? input.model_preference ?? null);
  const flavor = explicitFlavor ?? resolveRoleRuntimePolicyFlavor(root, input.role ?? null);
  const flavors = asRecord(runtimeTargets.flavors);
  if (flavor && typeof flavors?.[flavor] === 'string' && flavors[flavor].length > 0) {
    return {
      target_ref: flavors[flavor],
      runtime_flavor: flavor,
      selected_by: 'project_flavor_default',
      selected_reason: `project runtime_targets.flavors.${flavor}`,
    };
  }

  const purposeDefaultKey = resolveRuntimePurposeDefaultKey(input.role ?? null);
  const purposeDefault = typeof runtimeTargets[purposeDefaultKey] === 'string'
    ? runtimeTargets[purposeDefaultKey]
    : null;
  if (purposeDefault && purposeDefault.length > 0) {
    return {
      target_ref: purposeDefault,
      runtime_flavor: flavor,
      selected_by: 'project_purpose_default',
      selected_reason: `project runtime_targets.${purposeDefaultKey}`,
    };
  }

  const defaultTarget = typeof runtimeTargets.default === 'string' ? runtimeTargets.default : null;
  if (defaultTarget && defaultTarget.length > 0) {
    return {
      target_ref: defaultTarget,
      runtime_flavor: flavor,
      selected_by: 'project_default',
      selected_reason: 'project runtime_targets.default',
    };
  }

  return null;
}

function resolveRoleRuntimePolicyFlavor(metadata: Record<string, unknown> | null, role: string | null) {
  if (!metadata || !role) {
    return null;
  }
  const policy = asRecord(metadata.role_runtime_policy) ?? asRecord(asRecord(metadata.agora)?.role_runtime_policy);
  const rolePolicy = asRecord(policy?.[role]);
  const preferredFlavor = typeof rolePolicy?.preferred_flavor === 'string' ? rolePolicy.preferred_flavor : null;
  return normalizeRuntimeFlavor(preferredFlavor);
}

function normalizeRuntimeFlavor(value: string | null) {
  const normalized = value?.trim().toLowerCase().replace(/_/g, '-') ?? null;
  if (!normalized) {
    return null;
  }
  if (normalized === 'codex') {
    return 'codex';
  }
  if (normalized === 'claude' || normalized === 'claude-code') {
    return 'claude-code';
  }
  return null;
}

function resolveRuntimePurposeDefaultKey(role: string | null) {
  if (role === 'reviewer' || role === 'architect') {
    return 'default_review';
  }
  return 'default_coding';
}

function extractProjectImSpace(project: ProjectRecord, provider: string): ProjectImSpaceBinding | null {
  const root = asRecord(project.metadata);
  const agora = asRecord(root?.agora);
  const imSpaces = asRecord(agora?.im_spaces);
  const binding = asRecord(imSpaces?.[provider]);
  if (!binding) {
    return null;
  }
  if (typeof binding.conversation_ref !== 'string' || binding.conversation_ref.length === 0) {
    return null;
  }
  return {
    provider,
    conversation_ref: binding.conversation_ref,
    ...(typeof binding.parent_ref === 'string' && binding.parent_ref.length > 0 ? { parent_ref: binding.parent_ref } : {}),
    ...(typeof binding.kind === 'string' && binding.kind.length > 0 ? { kind: binding.kind } : {}),
    ...(typeof binding.managed_by === 'string' && binding.managed_by.length > 0 ? { managed_by: binding.managed_by } : {}),
  };
}

function normalizeProjectImSpace(binding: ProjectImSpaceBinding): ProjectImSpaceBinding {
  return {
    provider: binding.provider,
    conversation_ref: binding.conversation_ref,
    ...(binding.parent_ref ? { parent_ref: binding.parent_ref } : {}),
    ...(binding.kind ? { kind: binding.kind } : {}),
    ...(binding.managed_by ? { managed_by: binding.managed_by } : {}),
  };
}

function mergeProjectImSpace(
  metadata: Record<string, unknown> | null | undefined,
  binding: ProjectImSpaceBinding,
): Record<string, unknown> {
  const root = asRecord(metadata) ?? {};
  const agora = asRecord(root.agora) ?? {};
  const imSpaces = asRecord(agora.im_spaces) ?? {};
  return {
    ...root,
    agora: {
      ...agora,
      im_spaces: {
        ...imSpaces,
        [binding.provider]: {
          conversation_ref: binding.conversation_ref,
          parent_ref: binding.parent_ref ?? null,
          kind: binding.kind ?? null,
          managed_by: binding.managed_by ?? null,
        },
      },
    },
  };
}
