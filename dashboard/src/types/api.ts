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

export interface ApiAgentSummaryDto {
  active_tasks: number;
  active_agents: number;
  busy_craftsmen: number;
}

export interface ApiAgentDto {
  id: string;
  role: string | null;
  status: string;
  active_task_ids: string[];
  active_subtask_ids: string[];
  load: number;
  last_active_at: string | null;
}

export interface ApiCraftsmanDto {
  id: string;
  status: string;
  task_id: string;
  subtask_id: string;
  title: string;
  running_since: string | null;
}

export interface ApiAgentsStatusDto {
  summary: ApiAgentSummaryDto;
  agents: ApiAgentDto[];
  craftsmen: ApiCraftsmanDto[];
}

export interface ApiArchiveJobDto {
  id: number;
  task_id: string;
  task_title: string;
  task_type: string;
  status: string;
  target_path: string | null;
  writer_agent: string | null;
  commit_hash: string | null;
  requested_at: string;
  completed_at: string | null;
  payload: Record<string, unknown> | null;
}

export interface ApiTodoDto {
  id: number;
  text: string;
  status: 'pending' | 'done' | string;
  due: string | null;
  created_at: string;
  completed_at: string | null;
  tags: string[];
  promoted_to: string | null;
}

export interface ApiPromoteTodoResultDto {
  todo: ApiTodoDto;
  task: {
    id: string;
    title?: string | null;
    [key: string]: unknown;
  };
}

export interface ApiTemplateSummaryDto {
  id: string;
  name: string;
  type: string;
  description: string;
  governance: unknown;
  stage_count: number;
}

export interface ApiTemplateStageDto {
  id: string;
  name?: string;
  mode?: string;
  gate?: {
    type?: string;
    [key: string]: unknown;
  } | null;
}

export interface ApiTemplateDetailDto {
  type: string;
  name?: string;
  description?: string;
  governance?: unknown;
  defaultTeam?: Record<string, { suggested?: string[]; [key: string]: unknown }>;
  stages?: ApiTemplateStageDto[];
  [key: string]: unknown;
}
