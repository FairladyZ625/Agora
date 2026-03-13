import { z } from 'zod';
import { craftsmanExecutionSchema, craftsmanModeSchema } from './craftsman.js';
import { taskControlModeSchema, taskPrioritySchema, taskStateSchema } from './task.js';
import { validateWorkflowStages } from './workflow-rules.js';
import { templateGraphSchema } from './template-graph.js';

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

const allowedWorkflowExecutionKinds = [
  'citizen_discuss',
  'citizen_execute',
  'craftsman_dispatch',
  'human_approval',
] as const;

const allowedWorkflowActions = [
  'discuss',
  'execute',
  'dispatch_craftsman',
  'approve',
  'reject',
  'advance',
] as const;

const allowedAgentOrigins = [
  'agora_managed',
  'user_managed',
] as const;

const allowedBriefingModes = [
  'overlay_full',
  'overlay_delta',
] as const;

const supportedTaskLocales = [
  'zh-CN',
  'en-US',
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

const workflowExecutionKindSchema = z.string().refine((value) => allowedWorkflowExecutionKinds.includes(value as (typeof allowedWorkflowExecutionKinds)[number]), {
  message: 'Unsupported workflow execution kind',
});

const workflowActionSchema = z.string().refine((value) => allowedWorkflowActions.includes(value as (typeof allowedWorkflowActions)[number]), {
  message: 'Unsupported workflow action',
});

const agentOriginSchema = z.enum(allowedAgentOrigins);
const briefingModeSchema = z.enum(allowedBriefingModes);
export const taskLocaleSchema = z.enum(supportedTaskLocales);
export type TaskLocaleDto = z.infer<typeof taskLocaleSchema>;

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
  member_kind: z.enum(['controller', 'citizen', 'craftsman']).optional(),
  model_preference: z.string(),
  agent_origin: agentOriginSchema.optional(),
  briefing_mode: briefingModeSchema.optional(),
});
export type TeamMemberDto = z.infer<typeof teamMemberSchema>;

export const teamSchema = z.object({
  members: z.array(teamMemberSchema),
}).superRefine((value, ctx) => {
  const controllerMembers = value.members.filter((member) => member.member_kind === 'controller');
  if (controllerMembers.length > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'team must not declare more than one controller',
      path: ['members'],
    });
  }
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
  execution_kind: workflowExecutionKindSchema.optional(),
  allowed_actions: z.array(workflowActionSchema).optional(),
  gate: workflowGateSchema.nullish(),
  reject_target: z.string().min(1).optional(),
});
export type WorkflowStageDto = z.infer<typeof workflowStageSchema>;

export const workflowSchema = z.object({
  type: z.string().min(1).optional(),
  stages: z.array(workflowStageSchema).optional(),
  graph: templateGraphSchema.optional(),
}).superRefine((value, ctx) => {
  validateWorkflowStages(value.stages, ctx);
});
export type WorkflowDto = z.infer<typeof workflowSchema>;

export const taskBlueprintNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable(),
  mode: workflowModeSchema.nullable(),
  execution_kind: workflowExecutionKindSchema.nullable().optional(),
  allowed_actions: z.array(workflowActionSchema).optional(),
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
  controller_ref: z.string().nullable().optional(),
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

export const taskControlSchema = z.object({
  mode: taskControlModeSchema.default('normal'),
}).strict();
export type TaskControlDto = z.infer<typeof taskControlSchema>;

export const taskSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  title: z.string(),
  description: z.string().nullable(),
  type: z.string().min(1),
  priority: taskPrioritySchema,
  creator: z.string().min(1),
  locale: taskLocaleSchema,
  state: taskStateSchema,
  archive_status: z.string().nullable(),
  controller_ref: z.string().nullable().optional(),
  current_stage: z.string().nullable(),
  team: teamSchema.nullable(),
  workflow: workflowSchema.nullable(),
  control: taskControlSchema.nullable().optional(),
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

export const supportedSubtaskStates = [
  'pending',
  'in_progress',
  'waiting_input',
  'done',
  'failed',
  'cancelled',
  'archived',
] as const;
export const subtaskStatusSchema = z.enum(supportedSubtaskStates);
export type SubtaskStatusDto = z.infer<typeof subtaskStatusSchema>;

export const subtaskSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  stage_id: z.string(),
  title: z.string(),
  assignee: z.string(),
  status: subtaskStatusSchema,
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

export const createSubtaskCraftsmanSpecSchema = z.object({
  adapter: z.string().min(1),
  mode: craftsmanModeSchema.default('task'),
  workdir: z.string().nullable().optional(),
  prompt: z.string().nullable().optional(),
  brief_path: z.string().nullable().optional(),
}).strict();
export type CreateSubtaskCraftsmanSpecDto = z.infer<typeof createSubtaskCraftsmanSpecSchema>;

export const createSubtaskDefinitionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  assignee: z.string().min(1),
  craftsman: createSubtaskCraftsmanSpecSchema.optional(),
}).strict();
export type CreateSubtaskDefinitionDto = z.infer<typeof createSubtaskDefinitionSchema>;

export const createSubtasksRequestSchema = z.object({
  caller_id: z.string().min(1),
  subtasks: z.array(createSubtaskDefinitionSchema).min(1),
}).strict();
export type CreateSubtasksRequestDto = z.infer<typeof createSubtasksRequestSchema>;

export const createSubtasksResponseSchema = z.object({
  task: taskSchema,
  subtasks: z.array(subtaskSchema),
  dispatched_executions: z.array(craftsmanExecutionSchema),
});
export type CreateSubtasksResponseDto = z.infer<typeof createSubtasksResponseSchema>;

export const taskStatusSchema = z.object({
  task: taskSchema,
  task_blueprint: taskBlueprintSchema.optional(),
  flow_log: z.array(flowLogSchema),
  progress_log: z.array(progressLogSchema),
  subtasks: z.array(subtaskSchema),
});
export type TaskStatusDto = z.infer<typeof taskStatusSchema>;

export const hostResourceSnapshotSchema = z.object({
  observed_at: z.string(),
  cpu_count: z.number().int().nullable(),
  load_1m: z.number().nullable(),
  memory_total_bytes: z.number().nullable(),
  memory_used_bytes: z.number().nullable(),
  memory_utilization: z.number().nullable(),
  swap_total_bytes: z.number().nullable(),
  swap_used_bytes: z.number().nullable(),
  swap_utilization: z.number().nullable(),
});
export type HostResourceSnapshotDto = z.infer<typeof hostResourceSnapshotSchema>;

export const craftsmanGovernanceSnapshotSchema = z.object({
  limits: z.object({
    max_concurrent_running: z.number().int().positive().nullable(),
    max_concurrent_per_agent: z.number().int().positive().nullable(),
    host_memory_utilization_limit: z.number().nullable(),
    host_swap_utilization_limit: z.number().nullable(),
    host_load_per_cpu_limit: z.number().nullable(),
  }),
  active_executions: z.number().int().nonnegative(),
  active_by_assignee: z.array(z.object({
    assignee: z.string(),
    count: z.number().int().nonnegative(),
  })),
  host: hostResourceSnapshotSchema.nullable(),
});
export type CraftsmanGovernanceSnapshotDto = z.infer<typeof craftsmanGovernanceSnapshotSchema>;

export const createTaskRequestSchema = z.object({
  title: z.string().min(1),
  type: z.string().min(1),
  creator: z.string().min(1),
  description: z.string(),
  priority: taskPrioritySchema,
  locale: taskLocaleSchema.default('zh-CN'),
  team_override: teamSchema.optional(),
  workflow_override: workflowSchema.optional(),
  im_target: createTaskImTargetSchema.optional(),
  control: taskControlSchema.optional(),
});
export type CreateTaskRequestInputDto = z.input<typeof createTaskRequestSchema>;
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

export const currentImTaskApproveRequestSchema = z.object({
  provider: z.string().min(1).default('discord'),
  thread_ref: z.string().min(1).optional(),
  conversation_ref: z.string().min(1).optional(),
  actor_id: z.string().min(1).optional(),
  comment: z.string().default(''),
}).superRefine((value, ctx) => {
  if (!value.thread_ref && !value.conversation_ref) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'thread_ref or conversation_ref is required',
      path: ['thread_ref'],
    });
  }
});
export type CurrentImTaskApproveRequestDto = z.infer<typeof currentImTaskApproveRequestSchema>;

export const currentImTaskRejectRequestSchema = z.object({
  provider: z.string().min(1).default('discord'),
  thread_ref: z.string().min(1).optional(),
  conversation_ref: z.string().min(1).optional(),
  actor_id: z.string().min(1).optional(),
  reason: z.string().default(''),
}).superRefine((value, ctx) => {
  if (!value.thread_ref && !value.conversation_ref) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'thread_ref or conversation_ref is required',
      path: ['thread_ref'],
    });
  }
});
export type CurrentImTaskRejectRequestDto = z.infer<typeof currentImTaskRejectRequestSchema>;

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

export const probeInactiveTasksRequestSchema = z.object({
  controller_after_ms: z.number().int().positive(),
  roster_after_ms: z.number().int().positive(),
  inbox_after_ms: z.number().int().positive(),
});
export type ProbeInactiveTasksRequestDto = z.infer<typeof probeInactiveTasksRequestSchema>;
