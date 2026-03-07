export type ApiTaskState =
  | 'draft'
  | 'created'
  | 'active'
  | 'done'
  | 'blocked'
  | 'paused'
  | 'cancelled'
  | 'orphaned';

export interface ApiTeamMemberDto {
  role: string;
  agentId: string;
  model_preference: string;
}

export interface ApiTeamDto {
  members: ApiTeamMemberDto[];
}

export interface ApiWorkflowGateDto {
  type?: string;
  [key: string]: unknown;
}

export interface ApiWorkflowStageDto {
  id: string;
  name?: string;
  mode?: string;
  gate?: ApiWorkflowGateDto | null;
}

export interface ApiWorkflowDto {
  type?: string;
  stages?: ApiWorkflowStageDto[];
}

export interface ApiTaskDto {
  id: string;
  version: number;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  creator: string;
  state: ApiTaskState | string;
  current_stage: string | null;
  team: ApiTeamDto | null;
  workflow: ApiWorkflowDto | null;
  scheduler: unknown;
  scheduler_snapshot: unknown;
  discord: unknown;
  metrics: unknown;
  error_detail: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiFlowLogDto {
  id: number;
  task_id: string;
  kind: string;
  event: string;
  stage_id: string | null;
  from_state: string | null;
  to_state: string | null;
  detail: string | null;
  actor: string | null;
  created_at: string;
}

export interface ApiProgressLogDto {
  id: number;
  task_id: string;
  kind: string;
  stage_id: string | null;
  subtask_id: string | null;
  content: string;
  artifacts: string | null;
  actor: string;
  created_at: string;
}

export interface ApiSubtaskDto {
  id: string;
  task_id: string;
  stage_id: string;
  title: string;
  assignee: string;
  status: string;
  output: string | null;
  craftsman_type: string | null;
  dispatch_status: string | null;
  dispatched_at: string | null;
  done_at: string | null;
}

export interface ApiTaskStatusDto {
  task: ApiTaskDto;
  flow_log: ApiFlowLogDto[];
  progress_log: ApiProgressLogDto[];
  subtasks: ApiSubtaskDto[];
}

export interface ApiHealthDto {
  status: string;
}
