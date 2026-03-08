/* ═══════════════════════════════════════════
   Dashboard View Models
   Derived from backend DTOs for stable UI rendering
   ═══════════════════════════════════════════ */

export type TaskState =
  | 'pending'
  | 'in_progress'
  | 'gate_waiting'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused'
  | 'blocked';

export type TaskPriority = 'low' | 'normal' | 'high';

export interface Task {
  id: string;
  version: number;
  title: string;
  description: string | null;
  type: string;
  priority: TaskPriority | string;
  creator: string;
  state: TaskState;
  current_stage: string | null;
  teamLabel: string;
  workflowLabel: string;
  memberCount: number;
  isReviewStage: boolean;
  sourceState: string;
  stageName?: string | null;
  gateType?: string | null;
  teamMembers?: Array<{
    role: string;
    agentId: string;
    model_preference: string;
  }>;
  scheduler: unknown;
  scheduler_snapshot: unknown;
  discord: unknown;
  metrics: unknown;
  error_detail: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlowLogEntry {
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

export interface ProgressLogEntry {
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

export interface Subtask {
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

export interface TaskStatus {
  task: Task;
  flow_log: FlowLogEntry[];
  progress_log: ProgressLogEntry[];
  subtasks: Subtask[];
}

export interface HealthStatus {
  status: string;
}

export interface CreateTaskInput {
  title: string;
  type: string;
  creator: string;
  description: string;
  priority: TaskPriority | string;
}

export type TaskAction =
  | 'advance'
  | 'approve'
  | 'reject'
  | 'confirm'
  | 'subtask_done'
  | 'force_advance'
  | 'pause'
  | 'resume'
  | 'cancel'
  | 'unblock';

export interface TaskActionPayload {
  taskId: string;
  actorId?: string;
  note?: string;
  vote?: 'approve' | 'reject';
  subtaskId?: string;
}
