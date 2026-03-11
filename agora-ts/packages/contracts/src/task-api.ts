import { z } from 'zod';
import { taskPrioritySchema, taskStateSchema } from './task.js';
import { validateWorkflowStages } from './workflow-rules.js';

const allowedAgentRoles = [
  'architect',
  'developer',
  'reviewer',
  'writer',
  'researcher',
  'analyst',
  'executor',
  'craftsman',
] as const;

const allowedWorkflowModes = [
  'discuss',
  'execute',
] as const;

const allowedWorkflowGateTypes = [
  'archon_review',
  'command',
  'all_subtasks_done',
  'approval',
  'auto_timeout',
  'quorum',
] as const;

const agentRoleSchema = z.string().refine((value) => allowedAgentRoles.includes(value as (typeof allowedAgentRoles)[number]), {
  message: 'Unsupported team role',
});

const workflowModeSchema = z.string().refine((value) => allowedWorkflowModes.includes(value as (typeof allowedWorkflowModes)[number]), {
  message: 'Unsupported workflow mode',
});

const workflowGateTypeSchema = z.string().refine((value) => allowedWorkflowGateTypes.includes(value as (typeof allowedWorkflowGateTypes)[number]), {
  message: 'Unsupported workflow gate type',
});

const jsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([jsonPrimitiveSchema, z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);

export const teamMemberSchema = z.object({
  role: agentRoleSchema,
  agentId: z.string().min(1),
  model_preference: z.string(),
});
export type TeamMemberDto = z.infer<typeof teamMemberSchema>;

export const teamSchema = z.object({
  members: z.array(teamMemberSchema),
});
export type TeamDto = z.infer<typeof teamSchema>;

export const workflowGateSchema = z.object({
  type: workflowGateTypeSchema.optional(),
  approver: agentRoleSchema.optional(),
  approver_role: agentRoleSchema.optional(),
  required: z.number().int().positive().optional(),
  timeout_sec: z.number().int().positive().optional(),
}).strict();
export type WorkflowGateDto = z.infer<typeof workflowGateSchema>;

export const workflowStageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  mode: workflowModeSchema.optional(),
  gate: workflowGateSchema.nullish(),
  reject_target: z.string().min(1).optional(),
});
export type WorkflowStageDto = z.infer<typeof workflowStageSchema>;

export const workflowSchema = z.object({
  type: z.string().min(1).optional(),
  stages: z.array(workflowStageSchema).optional(),
}).superRefine((value, ctx) => {
  validateWorkflowStages(value.stages, ctx);
});
export type WorkflowDto = z.infer<typeof workflowSchema>;

export const taskBlueprintNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable(),
  mode: workflowModeSchema.nullable(),
  gate_type: workflowGateTypeSchema.nullable(),
});
export type TaskBlueprintNodeDto = z.infer<typeof taskBlueprintNodeSchema>;

export const taskBlueprintEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  kind: z.enum(['advance', 'reject']),
});
export type TaskBlueprintEdgeDto = z.infer<typeof taskBlueprintEdgeSchema>;

export const taskBlueprintArtifactContractSchema = z.object({
  node_id: z.string().min(1),
  artifact_type: z.string().min(1),
});
export type TaskBlueprintArtifactContractDto = z.infer<typeof taskBlueprintArtifactContractSchema>;

export const taskBlueprintSchema = z.object({
  graph_version: z.number().int().positive(),
  entry_nodes: z.array(z.string().min(1)),
  nodes: z.array(taskBlueprintNodeSchema),
  edges: z.array(taskBlueprintEdgeSchema),
  artifact_contracts: z.array(taskBlueprintArtifactContractSchema),
  role_bindings: z.array(teamMemberSchema),
});
export type TaskBlueprintDto = z.infer<typeof taskBlueprintSchema>;

export const createTaskImTargetSchema = z.object({
  provider: z.string().min(1).optional(),
  conversation_ref: z.string().min(1).optional(),
  thread_ref: z.string().min(1).optional(),
  visibility: z.enum(['public', 'private']).optional(),
  participant_refs: z.array(z.string().min(1)).optional(),
}).strict();
export type CreateTaskImTargetDto = z.infer<typeof createTaskImTargetSchema>;

export const taskSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  title: z.string(),
  description: z.string().nullable(),
  type: z.string().min(1),
  priority: taskPrioritySchema,
  creator: z.string().min(1),
  state: taskStateSchema,
  archive_status: z.string().nullable(),
  current_stage: z.string().nullable(),
  team: teamSchema.nullable(),
  workflow: workflowSchema.nullable(),
  scheduler: jsonValueSchema,
  scheduler_snapshot: jsonValueSchema,
  discord: jsonValueSchema,
  metrics: jsonValueSchema,
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
  task_blueprint: taskBlueprintSchema.optional(),
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
  team_override: teamSchema.optional(),
  workflow_override: workflowSchema.optional(),
  im_target: createTaskImTargetSchema.optional(),
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

export const unblockTaskRequestSchema = z.object({
  reason: z.string().default(''),
  action: z.enum(['retry', 'skip', 'reassign']).optional(),
  assignee: z.string().optional(),
  craftsman_type: z.string().optional(),
});
export type UnblockTaskRequestDto = z.infer<typeof unblockTaskRequestSchema>;

export const cleanupTasksRequestSchema = z.object({
  task_id: z.string().optional(),
});
export type CleanupTasksRequestDto = z.infer<typeof cleanupTasksRequestSchema>;
