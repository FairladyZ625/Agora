import type { WorkflowStageRosterDto } from '@agora-ts/contracts';

export type TaskBrainContextAudience = 'controller' | 'citizen' | 'craftsman';

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
  project_brain_contexts?: Partial<Record<TaskBrainContextAudience, TaskBrainContextArtifact>> | null;
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
    role_brief_path?: string | null;
    project_brain_context_path?: string | null;
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
