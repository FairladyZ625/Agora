import type { ApiProjectDto, ApiProjectWorkbenchDto, ApiTaskDto, ApiTodoDto } from '@/types/api';
import type {
  ProjectCitizen,
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
  project_state_root: string;
  profile_path: string;
  profile_installed: boolean;
  repo_path: string | null;
  repo_shim_installed: boolean;
  bootstrap_prompts_dir: string;
  lifecycle_modules: string[];
}): ProjectNomosState {
  return {
    nomosId: dto.nomos_id,
    projectStateRoot: dto.project_state_root,
    profilePath: dto.profile_path,
    profileInstalled: dto.profile_installed,
    repoPath: dto.repo_path,
    repoShimInstalled: dto.repo_shim_installed,
    bootstrapPromptsDir: dto.bootstrap_prompts_dir,
    lifecycleModules: dto.lifecycle_modules,
  };
}

function mapProjectIndexDoc(dto: ApiProjectWorkbenchDto['index']): ProjectIndexDoc | null {
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

function mapProjectTimelineDoc(dto: ApiProjectWorkbenchDto['timeline']): ProjectTimelineDoc | null {
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

function mapProjectRecap(dto: ApiProjectWorkbenchDto['recaps'][number]): ProjectRecap {
  return {
    taskId: dto.task_id,
    title: dto.title,
    summaryPath: dto.path,
    content: dto.content,
    updatedAt: dto.updated_at,
  };
}

function mapProjectKnowledge(dto: ApiProjectWorkbenchDto['knowledge'][number]): ProjectKnowledgeDoc {
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

function mapProjectCitizen(dto: ApiProjectWorkbenchDto['citizens'][number]): ProjectCitizen {
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
  return {
    project: mapProjectDto(dto.project),
    nomos: null,
    index: mapProjectIndexDoc(dto.index),
    timeline: mapProjectTimelineDoc(dto.timeline),
    recaps: dto.recaps.map(mapProjectRecap),
    knowledge: dto.knowledge.map(mapProjectKnowledge),
    citizens: dto.citizens.map(mapProjectCitizen),
    tasks: [],
    todos: [],
  };
}
