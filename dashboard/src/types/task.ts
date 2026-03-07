/* ═══════════════════════════════════════════
   Task & API Type Definitions
   Mirrors the Agora SQLite schema
   ═══════════════════════════════════════════ */

export type TaskState =
  | 'draft'
  | 'pending'
  | 'in_progress'
  | 'gate_waiting'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

export interface Task {
  id: string;
  version: number;
  title: string;
  description: string | null;
  type: string;
  priority: TaskPriority;
  creator: string;
  state: TaskState;
  current_stage: string | null;
  team: string;
  workflow: string;
  scheduler: string | null;
  scheduler_snapshot: string | null;
  discord: string | null;
  metrics: string | null;
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
