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
  control_mode: 'normal' | 'smoke_test';
  state: string;
  controller_ref: string | null;
  current_stage: string | null;
  workflow_stages: Array<{
    id: string;
    name?: string;
    mode?: string;
    execution_kind?: string;
    allowed_actions?: string[];
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
  project_brain_context?: {
    audience: 'controller' | 'citizen' | 'craftsman';
    source_documents: Array<{
      kind: string;
      slug: string;
      title: string | null;
      path: string;
    }>;
    markdown: string;
  } | null;
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

export interface TaskBrainWorkspaceBindingRef {
  brain_pack_ref: string;
  brain_task_id: string;
  workspace_path: string;
  metadata?: Record<string, unknown> | null;
}

export interface TaskBrainWorkspacePort {
  createWorkspace(input: TaskBrainWorkspaceRequest): TaskBrainWorkspaceResult;
  updateWorkspace(binding: TaskBrainWorkspaceBindingRef, input: TaskBrainWorkspaceRequest): void;
  writeTaskCloseRecap(binding: TaskBrainWorkspaceBindingRef, input: TaskBrainCloseRecapRequest): void;
  destroyWorkspace(binding: TaskBrainWorkspaceBindingRef): void;
}
