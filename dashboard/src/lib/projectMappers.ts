import type { ApiProjectDto, ApiProjectWorkbenchDto, ApiTaskDto, ApiTodoDto } from '@/types/api';
import type {
  ProjectNomosActivation,
  ProjectNomosDiff,
  ProjectNomosPackSummary,
  ProjectNomosReview,
  ProjectCitizen,
  ProjectNomosValidation,
  ProjectNomosValidationIssue,
  ProjectIndexDoc,
  ProjectKnowledgeDoc,
  ProjectNomosState,
  ProjectRecap,
  ProjectSummary,
  ProjectTaskSummary,
  ProjectTimelineDoc,
  ProjectTodoSummary,
  ProjectWorkbench,
} from '@/types/project';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readProjectNomosId(metadata: Record<string, unknown> | null | undefined) {
  const agora = asRecord(metadata?.agora);
  const nomos = asRecord(agora?.nomos);
  return typeof nomos?.id === 'string' && nomos.id.length > 0 ? nomos.id : null;
}

export function mapProjectDto(dto: ApiProjectDto): ProjectSummary {
  return {
    id: dto.id,
    name: dto.name,
    summary: dto.summary,
    owner: dto.owner,
    status: dto.status,
    nomosId: readProjectNomosId(dto.metadata),
    repoPath: typeof dto.metadata?.repo_path === 'string' ? dto.metadata.repo_path : null,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

export function mapProjectNomosStateDto(dto: {
  nomos_id: string;
  activation_status: 'active_builtin' | 'active_project';
  project_state_root: string;
  profile_path: string;
  profile_installed: boolean;
  repo_path: string | null;
  repo_shim_installed: boolean;
  bootstrap_prompts_dir: string;
  lifecycle_modules: string[];
  draft_root: string;
  draft_profile_path: string;
  draft_profile_installed: boolean;
  active_root: string;
  active_profile_path: string;
  active_profile_installed: boolean;
}): ProjectNomosState {
  return {
    nomosId: dto.nomos_id,
    activationStatus: dto.activation_status,
    projectStateRoot: dto.project_state_root,
    profilePath: dto.profile_path,
    profileInstalled: dto.profile_installed,
    repoPath: dto.repo_path,
    repoShimInstalled: dto.repo_shim_installed,
    bootstrapPromptsDir: dto.bootstrap_prompts_dir,
    lifecycleModules: dto.lifecycle_modules,
    draftRoot: dto.draft_root,
    draftProfilePath: dto.draft_profile_path,
    draftProfileInstalled: dto.draft_profile_installed,
    activeRoot: dto.active_root,
    activeProfilePath: dto.active_profile_path,
    activeProfileInstalled: dto.active_profile_installed,
  };
}

function mapProjectNomosPackSummaryDto(dto: {
  pack_id: string;
  name: string;
  version: string;
  description: string;
  lifecycle_modules: string[];
  doctor_checks: string[];
  source: string;
  root: string;
  profile_path: string;
}): ProjectNomosPackSummary {
  return {
    packId: dto.pack_id,
    name: dto.name,
    version: dto.version,
    description: dto.description,
    lifecycleModules: dto.lifecycle_modules,
    doctorChecks: dto.doctor_checks,
    source: dto.source,
    root: dto.root,
    profilePath: dto.profile_path,
  };
}

export function mapProjectNomosReviewDto(dto: {
  project_id: string;
  activation_status: 'active_builtin' | 'active_project';
  can_activate: boolean;
  issues: string[];
  active: Parameters<typeof mapProjectNomosPackSummaryDto>[0];
  draft: Parameters<typeof mapProjectNomosPackSummaryDto>[0] | null;
}): ProjectNomosReview {
  return {
    projectId: dto.project_id,
    activationStatus: dto.activation_status,
    canActivate: dto.can_activate,
    issues: dto.issues,
    active: mapProjectNomosPackSummaryDto(dto.active),
    draft: dto.draft ? mapProjectNomosPackSummaryDto(dto.draft) : null,
  };
}

function mapProjectNomosValidationIssueDto(dto: {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  path?: string;
}): ProjectNomosValidationIssue {
  return {
    severity: dto.severity,
    code: dto.code,
    message: dto.message,
    ...(dto.path ? { path: dto.path } : {}),
  };
}

export function mapProjectNomosValidationDto(dto: {
  project_id: string;
  target: 'draft' | 'active';
  valid: boolean;
  activation_status: 'active_builtin' | 'active_project';
  pack: Parameters<typeof mapProjectNomosPackSummaryDto>[0] | null;
  issues: Array<{
    severity: 'error' | 'warning';
    code: string;
    message: string;
    path?: string;
  }>;
}): ProjectNomosValidation {
  return {
    projectId: dto.project_id,
    target: dto.target,
    valid: dto.valid,
    activationStatus: dto.activation_status,
    pack: dto.pack ? mapProjectNomosPackSummaryDto(dto.pack) : null,
    issues: dto.issues.map(mapProjectNomosValidationIssueDto),
  };
}

export function mapProjectNomosDiffDto(dto: {
  project_id: string;
  base: 'builtin' | 'active';
  candidate: 'draft' | 'active';
  changed: boolean;
  base_pack: Parameters<typeof mapProjectNomosPackSummaryDto>[0] | null;
  candidate_pack: Parameters<typeof mapProjectNomosPackSummaryDto>[0] | null;
  differences: Array<{ field: string; from: unknown; to: unknown }>;
}): ProjectNomosDiff {
  return {
    projectId: dto.project_id,
    base: dto.base,
    candidate: dto.candidate,
    changed: dto.changed,
    basePack: dto.base_pack ? mapProjectNomosPackSummaryDto(dto.base_pack) : null,
    candidatePack: dto.candidate_pack ? mapProjectNomosPackSummaryDto(dto.candidate_pack) : null,
    differences: dto.differences,
  };
}

export function mapProjectNomosActivationDto(dto: {
  project_id: string;
  nomos_id: string;
  activation_status: 'active_project';
  active_root: string;
  active_profile_path: string;
  activated_at: string;
  activated_by: string;
}): ProjectNomosActivation {
  return {
    projectId: dto.project_id,
    nomosId: dto.nomos_id,
    activationStatus: dto.activation_status,
    activeRoot: dto.active_root,
    activeProfilePath: dto.active_profile_path,
    activatedAt: dto.activated_at,
    activatedBy: dto.activated_by,
  };
}

function mapProjectWorkbenchOverview(dto: ApiProjectWorkbenchDto['overview']) {
  return {
    status: dto.status,
    owner: dto.owner,
    updatedAt: dto.updated_at,
    stats: {
      knowledgeCount: dto.counts.knowledge,
      citizenCount: dto.counts.citizens,
      recapCount: dto.counts.recaps,
      taskCount: dto.counts.tasks_total,
      activeTaskCount: dto.counts.active_tasks,
      reviewTaskCount: dto.counts.review_tasks,
      todoCount: dto.counts.todos_total,
      pendingTodoCount: dto.counts.pending_todos,
    },
  };
}

function mapProjectIndexDoc(dto: ApiProjectWorkbenchDto['surfaces']['index']): ProjectIndexDoc | null {
  if (!dto) {
    return null;
  }
  return {
    kind: 'index',
    slug: 'index',
    title: dto.title,
    path: dto.path,
    content: dto.content,
    updatedAt: dto.updated_at,
  };
}

function mapProjectTimelineDoc(dto: ApiProjectWorkbenchDto['surfaces']['timeline']): ProjectTimelineDoc | null {
  if (!dto) {
    return null;
  }
  return {
    kind: 'timeline',
    slug: 'timeline',
    title: dto.title,
    path: dto.path,
    content: dto.content,
    sourceTaskIds: dto.source_task_ids,
    updatedAt: dto.updated_at,
  };
}

function mapProjectRecap(dto: ApiProjectWorkbenchDto['work']['recaps'][number]): ProjectRecap {
  return {
    taskId: dto.task_id,
    title: dto.title,
    summaryPath: dto.path,
    content: dto.content,
    updatedAt: dto.updated_at,
  };
}

function mapProjectKnowledge(dto: ApiProjectWorkbenchDto['work']['knowledge'][number]): ProjectKnowledgeDoc {
  return {
    kind: dto.kind,
    slug: dto.slug,
    title: dto.title,
    path: dto.path,
    content: dto.content,
    sourceTaskIds: dto.source_task_ids,
    updatedAt: dto.updated_at,
  };
}

function mapProjectCitizen(dto: ApiProjectWorkbenchDto['operator']['citizens'][number]): ProjectCitizen {
  return {
    citizenId: dto.citizen_id,
    roleId: dto.role_id,
    displayName: dto.display_name,
    status: dto.status,
    persona: dto.persona,
    boundaries: dto.boundaries,
    skillsRef: dto.skills_ref,
    channelPolicies: dto.channel_policies,
    brainScaffoldMode: dto.brain_scaffold_mode,
    runtimeAdapter: dto.runtime_projection.adapter,
    runtimeMetadata: dto.runtime_projection.metadata,
  };
}

export function mapProjectTaskSummaryDto(dto: ApiTaskDto): ProjectTaskSummary {
  return {
    id: dto.id,
    title: dto.title,
    state: dto.state,
    projectId: dto.project_id ?? null,
  };
}

export function mapProjectTodoSummaryDto(dto: ApiTodoDto): ProjectTodoSummary {
  return {
    id: dto.id,
    text: dto.text,
    status: dto.status,
    projectId: dto.project_id,
  };
}

export function mapProjectWorkbenchDto(dto: ApiProjectWorkbenchDto): ProjectWorkbench {
  const index = mapProjectIndexDoc(dto.surfaces.index);
  const timeline = mapProjectTimelineDoc(dto.surfaces.timeline);
  const recaps = dto.work.recaps.map(mapProjectRecap);
  const knowledge = dto.work.knowledge.map(mapProjectKnowledge);
  const citizens = dto.operator.citizens.map(mapProjectCitizen);
  const tasks = dto.work.tasks.map(mapProjectTaskSummaryDto);
  const todos = dto.work.todos.map(mapProjectTodoSummaryDto);

  return {
    project: mapProjectDto(dto.project),
    nomos: null,
    overview: mapProjectWorkbenchOverview(dto.overview),
    surfaces: {
      index,
      timeline,
    },
    work: {
      tasks,
      todos,
      recaps,
      knowledge,
    },
    operator: {
      nomosId: dto.operator.nomos_id,
      repoPath: dto.operator.repo_path,
      citizens,
    },
    index,
    timeline,
    recaps,
    knowledge,
    citizens,
    tasks,
    todos,
  };
}
