import { z } from 'zod';
import { taskPrioritySchema, taskStateSchema } from './task.js';

export const teamMemberSchema = z.object({
  role: z.string(),
  agentId: z.string(),
  model_preference: z.string(),
});
export type TeamMemberDto = z.infer<typeof teamMemberSchema>;

export const teamSchema = z.object({
  members: z.array(teamMemberSchema),
});
export type TeamDto = z.infer<typeof teamSchema>;

export const workflowGateSchema = z.object({
  type: z.string().optional(),
}).passthrough();
export type WorkflowGateDto = z.infer<typeof workflowGateSchema>;

export const workflowStageSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  mode: z.string().optional(),
  gate: workflowGateSchema.nullish(),
});
export type WorkflowStageDto = z.infer<typeof workflowStageSchema>;

export const workflowSchema = z.object({
  type: z.string().optional(),
  stages: z.array(workflowStageSchema).optional(),
});
export type WorkflowDto = z.infer<typeof workflowSchema>;

export const taskSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  title: z.string(),
  description: z.string().nullable(),
  type: z.string(),
  priority: taskPrioritySchema,
  creator: z.string(),
  state: taskStateSchema.or(z.string()),
  current_stage: z.string().nullable(),
  team: teamSchema.nullable(),
  workflow: workflowSchema.nullable(),
  scheduler: z.unknown(),
  scheduler_snapshot: z.unknown(),
  discord: z.unknown(),
  metrics: z.unknown(),
  error_detail: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type TaskDto = z.infer<typeof taskSchema>;

export const flowLogSchema = z.object({
  id: z.number().int().nonnegative(),
  task_id: z.string(),
  kind: z.string(),
  event: z.string(),
  stage_id: z.string().nullable(),
  from_state: z.string().nullable(),
  to_state: z.string().nullable(),
  detail: z.string().nullable(),
  actor: z.string().nullable(),
  created_at: z.string(),
});
export type FlowLogDto = z.infer<typeof flowLogSchema>;

export const progressLogSchema = z.object({
  id: z.number().int().nonnegative(),
  task_id: z.string(),
  kind: z.string(),
  stage_id: z.string().nullable(),
  subtask_id: z.string().nullable(),
  content: z.string(),
  artifacts: z.string().nullable(),
  actor: z.string(),
  created_at: z.string(),
});
export type ProgressLogDto = z.infer<typeof progressLogSchema>;

export const subtaskSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  stage_id: z.string(),
  title: z.string(),
  assignee: z.string(),
  status: z.string(),
  output: z.string().nullable(),
  craftsman_type: z.string().nullable(),
  craftsman_session: z.string().nullable().optional(),
  craftsman_workdir: z.string().nullable().optional(),
  craftsman_prompt: z.string().nullable().optional(),
  dispatch_status: z.string().nullable(),
  dispatched_at: z.string().nullable(),
  done_at: z.string().nullable(),
});
export type SubtaskDto = z.infer<typeof subtaskSchema>;

export const taskStatusSchema = z.object({
  task: taskSchema,
  flow_log: z.array(flowLogSchema),
  progress_log: z.array(progressLogSchema),
  subtasks: z.array(subtaskSchema),
});
export type TaskStatusDto = z.infer<typeof taskStatusSchema>;

export const createTaskRequestSchema = z.object({
  title: z.string().min(1),
  type: z.string().min(1),
  creator: z.string().min(1),
  description: z.string(),
  priority: taskPrioritySchema,
});
export type CreateTaskRequestDto = z.infer<typeof createTaskRequestSchema>;

export const advanceTaskRequestSchema = z.object({
  caller_id: z.string().min(1),
});
export type AdvanceTaskRequestDto = z.infer<typeof advanceTaskRequestSchema>;

export const approveTaskRequestSchema = z.object({
  approver_id: z.string().min(1),
  comment: z.string().default(''),
});
export type ApproveTaskRequestDto = z.infer<typeof approveTaskRequestSchema>;

export const rejectTaskRequestSchema = z.object({
  rejector_id: z.string().min(1),
  reason: z.string().default(''),
});
export type RejectTaskRequestDto = z.infer<typeof rejectTaskRequestSchema>;

export const archonApproveTaskRequestSchema = z.object({
  reviewer_id: z.string().min(1),
  comment: z.string().default(''),
});
export type ArchonApproveTaskRequestDto = z.infer<typeof archonApproveTaskRequestSchema>;

export const archonRejectTaskRequestSchema = z.object({
  reviewer_id: z.string().min(1),
  reason: z.string().default(''),
});
export type ArchonRejectTaskRequestDto = z.infer<typeof archonRejectTaskRequestSchema>;

export const confirmTaskRequestSchema = z.object({
  voter_id: z.string().min(1),
  vote: z.enum(['approve', 'reject']),
  comment: z.string().default(''),
});
export type ConfirmTaskRequestDto = z.infer<typeof confirmTaskRequestSchema>;

export const subtaskDoneRequestSchema = z.object({
  subtask_id: z.string().min(1),
  caller_id: z.string().min(1),
  output: z.string().default(''),
});
export type SubtaskDoneRequestDto = z.infer<typeof subtaskDoneRequestSchema>;

export const taskNoteRequestSchema = z.object({
  reason: z.string().default(''),
});
export type TaskNoteRequestDto = z.infer<typeof taskNoteRequestSchema>;

export const cleanupTasksRequestSchema = z.object({
  task_id: z.string().optional(),
});
export type CleanupTasksRequestDto = z.infer<typeof cleanupTasksRequestSchema>;
