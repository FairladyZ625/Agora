import { join } from 'node:path';
import type { WorkflowStageRosterDto } from '@agora-ts/contracts';

export type TaskBrainContextAudience = 'controller' | 'citizen' | 'craftsman';
export const TASK_BRAIN_RUNTIME_DELIVERY_MANIFEST_RELATIVE_PATH = '04-context/runtime-delivery-manifest.md';
export const TASK_BRAIN_PROJECT_CONTEXT_ARTIFACT_DIRECTORY = '04-context';

export interface TaskBrainContextArtifact {
  audience: TaskBrainContextAudience;
  source_documents: Array<{
    kind: string;
    slug: string;
    title: string | null;
    path: string;
  }>;
  markdown: string;
}

export interface TaskBrainWorkspaceRequest {
  task_id: string;
  project_id: string | null;
  locale: 'zh-CN' | 'en-US';
  title: string;
  description: string;
  type: string;
  priority: string;
  creator: string;
  template_id: string;
  control_mode: 'normal' | 'smoke_test' | 'regression_test';
  state: string;
  controller_ref: string | null;
  current_stage: string | null;
  current_stage_participants?: string[];
  workflow_stages: Array<{
    id: string;
    name?: string;
    mode?: string;
    execution_kind?: string;
    allowed_actions?: string[];
    roster?: WorkflowStageRosterDto;
    gate?: {
      type?: string;
    } | null;
  }>;
  team_members: Array<{
    role: string;
    agentId: string;
    member_kind?: 'controller' | 'citizen' | 'craftsman';
    model_preference: string;
    agent_origin?: 'agora_managed' | 'user_managed';
    briefing_mode?: 'overlay_full' | 'overlay_delta';
  }>;
  project_context_artifacts?: Partial<Record<TaskBrainContextAudience, TaskBrainContextArtifact>> | null;
}

export interface TaskBrainWorkspaceResult {
  brain_pack_ref: string;
  brain_task_id: string;
  workspace_path: string;
  metadata?: Record<string, unknown> | null;
}

export interface TaskBrainCloseRecapRequest {
  task_id: string;
  project_id: string | null;
  locale: 'zh-CN' | 'en-US';
  title: string;
  state: string;
  current_stage: string | null;
  controller_ref: string | null;
  completed_by: string;
  completed_at: string;
  summary_lines: string[];
}

export interface TaskBrainHarvestDraftRequest {
  task_id: string;
  project_id: string | null;
  locale: 'zh-CN' | 'en-US';
  title: string;
  state: string;
  current_stage: string | null;
  controller_ref: string | null;
  completed_by: string;
  completed_at: string;
  summary_lines: string[];
}

export interface TaskExecutionBriefRequest {
  task_id: string;
  project_id: string | null;
  locale: 'zh-CN' | 'en-US';
  title: string;
  description: string;
  controller_ref: string | null;
  current_stage: string | null;
  current_stage_participants: string[];
  subtask_id: string;
  subtask_title: string;
  assignee: string;
  adapter: string;
  mode: 'one_shot' | 'interactive';
  prompt: string | null;
  workdir: string | null;
  references: {
    current_path: string;
    task_brief_path: string;
    roster_path: string;
    stage_state_path: string;
    runtime_delivery_manifest_path?: string | null;
    role_brief_path?: string | null;
    project_context_artifact_path?: string | null;
  };
}

export interface TaskExecutionBriefResult {
  brief_path: string;
}

export interface TaskBrainWorkspaceBindingRef {
  brain_pack_ref: string;
  brain_task_id: string;
  workspace_path: string;
  metadata?: Record<string, unknown> | null;
}

export interface TaskBrainWorkspacePort {
  createWorkspace(input: TaskBrainWorkspaceRequest): TaskBrainWorkspaceResult;
  updateWorkspace(binding: TaskBrainWorkspaceBindingRef, input: TaskBrainWorkspaceRequest): void;
  writeExecutionBrief(binding: TaskBrainWorkspaceBindingRef, input: TaskExecutionBriefRequest): TaskExecutionBriefResult;
  writeTaskCloseRecap(binding: TaskBrainWorkspaceBindingRef, input: TaskBrainCloseRecapRequest): void;
  writeTaskHarvestDraft(binding: TaskBrainWorkspaceBindingRef, input: TaskBrainHarvestDraftRequest): void;
  destroyWorkspace(binding: TaskBrainWorkspaceBindingRef): void;
}

export function resolveTaskBrainRuntimeDeliveryManifestPath(workspacePath: string) {
  return join(workspacePath, TASK_BRAIN_RUNTIME_DELIVERY_MANIFEST_RELATIVE_PATH);
}

export function resolveTaskBrainProjectContextArtifactPath(
  workspacePath: string,
  audience: TaskBrainContextAudience,
) {
  return join(workspacePath, TASK_BRAIN_PROJECT_CONTEXT_ARTIFACT_DIRECTORY, `project-context-${audience}.md`);
}
