export interface TaskBrainWorkspaceRequest {
  task_id: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  creator: string;
  template_id: string;
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
  }>;
}

export interface TaskBrainWorkspaceResult {
  brain_pack_ref: string;
  brain_task_id: string;
  workspace_path: string;
  metadata?: Record<string, unknown> | null;
}

export interface TaskBrainWorkspacePort {
  createWorkspace(input: TaskBrainWorkspaceRequest): TaskBrainWorkspaceResult;
  destroyWorkspace(binding: TaskBrainWorkspaceResult): void;
}
