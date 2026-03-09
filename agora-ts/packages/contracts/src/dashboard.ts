import { z } from 'zod';
import { validateWorkflowStages } from './workflow-rules.js';
import { taskSchema } from './task-api.js';
import { taskPrioritySchema } from './task.js';

const allowedGovernancePresets = ['lean', 'standard', 'strict', 'custom'] as const;
const allowedTemplateRoles = ['architect', 'developer', 'reviewer', 'writer', 'researcher', 'analyst', 'executor', 'craftsman'] as const;
const allowedTemplateStageModes = ['discuss', 'execute'] as const;
const allowedTemplateGateTypes = ['archon_review', 'command', 'all_subtasks_done', 'approval', 'auto_timeout', 'quorum'] as const;

const governancePresetSchema = z.string().refine((value) => allowedGovernancePresets.includes(value as (typeof allowedGovernancePresets)[number]), {
  message: 'Unsupported governance preset',
});
const templateRoleSchema = z.string().refine((value) => allowedTemplateRoles.includes(value as (typeof allowedTemplateRoles)[number]), {
  message: 'Unsupported template team role',
});
const templateStageModeSchema = z.string().refine((value) => allowedTemplateStageModes.includes(value as (typeof allowedTemplateStageModes)[number]), {
  message: 'Unsupported template stage mode',
});
const templateGateTypeSchema = z.string().refine((value) => allowedTemplateGateTypes.includes(value as (typeof allowedTemplateGateTypes)[number]), {
  message: 'Unsupported template gate type',
});

export const agentSummarySchema = z.object({
  active_tasks: z.number().int().nonnegative(),
  active_agents: z.number().int().nonnegative(),
  total_agents: z.number().int().nonnegative(),
  online_agents: z.number().int().nonnegative(),
  stale_agents: z.number().int().nonnegative(),
  disconnected_agents: z.number().int().nonnegative(),
  busy_craftsmen: z.number().int().nonnegative(),
});

export const agentStatusItemSchema = z.object({
  id: z.string(),
  role: z.string().nullable(),
  status: z.string(),
  presence: z.enum(['online', 'offline', 'disconnected', 'stale']),
  presence_reason: z.string().nullable().optional(),
  active_task_ids: z.array(z.string()),
  active_subtask_ids: z.array(z.string()),
  load: z.number().int().nonnegative(),
  last_active_at: z.string().nullable(),
  last_seen_at: z.string().nullable(),
  channel_providers: z.array(z.string()),
  host_framework: z.string().nullable().optional(),
  inventory_sources: z.array(z.string()),
  account_id: z.string().nullable().optional(),
  primary_model: z.string().nullable().optional(),
  workspace_dir: z.string().nullable().optional(),
});

export const craftsmanStatusItemSchema = z.object({
  id: z.string(),
  status: z.string(),
  task_id: z.string(),
  subtask_id: z.string(),
  title: z.string(),
  running_since: z.string().nullable(),
  recent_executions: z.array(z.object({
    execution_id: z.string(),
    status: z.string(),
    session_id: z.string().nullable(),
    transport: z.string().nullable(),
    runtime_mode: z.string().nullable(),
    started_at: z.string().nullable(),
  })),
});

export const tmuxRuntimePaneSchema = z.object({
  agent: z.string(),
  pane_id: z.string().nullable(),
  current_command: z.string().nullable(),
  active: z.boolean(),
  ready: z.boolean(),
  tail_preview: z.string().nullable(),
  continuity_backend: z.enum(['claude_session_id', 'codex_session_file', 'gemini_session_id', 'unknown']),
  resume_capability: z.enum(['native_resume', 'resume_last', 'none']),
  session_reference: z.string().nullable(),
  identity_source: z.enum(['registry_default', 'hook_event', 'session_file', 'chat_file', 'latest_fallback', 'manual', 'transport_session']),
  identity_path: z.string().nullable().optional(),
  session_observed_at: z.string().nullable().optional(),
  last_recovery_mode: z.enum(['fresh_start', 'resume_exact', 'resume_latest', 'resume_last']).nullable(),
  transport_session_id: z.string().nullable(),
});

export const tmuxRuntimeSchema = z.object({
  session: z.string().nullable(),
  panes: z.array(tmuxRuntimePaneSchema),
});

export const agentAxisAffectedAgentSchema = z.object({
  id: z.string(),
  status: z.string(),
  presence: z.enum(['online', 'offline', 'disconnected', 'stale']),
  presence_reason: z.string().nullable(),
  last_seen_at: z.string().nullable(),
  account_id: z.string().nullable(),
});

export const agentChannelHistoryEventSchema = z.object({
  occurred_at: z.string(),
  agent_id: z.string(),
  account_id: z.string().nullable(),
  presence: z.enum(['online', 'offline', 'disconnected', 'stale']),
  reason: z.string().nullable(),
});

export const agentChannelSignalEventSchema = z.object({
  occurred_at: z.string(),
  channel: z.string(),
  agent_id: z.string().nullable(),
  account_id: z.string().nullable(),
  kind: z.enum([
    'provider_start',
    'provider_ready',
    'gateway_proxy_enabled',
    'health_restart',
    'auto_restart_attempt',
    'transport_error',
    'inbound_ready',
  ]),
  severity: z.enum(['info', 'warning', 'error']),
  detail: z.string().nullable(),
});

export const agentChannelSignalCountsSchema = z.object({
  ready_events: z.number().int().nonnegative(),
  restart_events: z.number().int().nonnegative(),
  transport_errors: z.number().int().nonnegative(),
});

export const agentChannelSummarySchema = z.object({
  channel: z.string(),
  total_agents: z.number().int().nonnegative(),
  busy_agents: z.number().int().nonnegative(),
  online_agents: z.number().int().nonnegative(),
  stale_agents: z.number().int().nonnegative(),
  disconnected_agents: z.number().int().nonnegative(),
  offline_agents: z.number().int().nonnegative(),
  overall_presence: z.enum(['online', 'offline', 'disconnected', 'stale']),
  last_seen_at: z.string().nullable(),
  presence_reason: z.string().nullable(),
  affected_agents: z.array(agentAxisAffectedAgentSchema),
  history: z.array(agentChannelHistoryEventSchema),
  signal_status: z.enum(['healthy', 'recovering', 'degraded', 'unknown']),
  last_signal_at: z.string().nullable(),
  signal_counts: agentChannelSignalCountsSchema,
  signals: z.array(agentChannelSignalEventSchema),
});

export const agentHostSummarySchema = z.object({
  host: z.string(),
  total_agents: z.number().int().nonnegative(),
  busy_agents: z.number().int().nonnegative(),
  online_agents: z.number().int().nonnegative(),
  stale_agents: z.number().int().nonnegative(),
  disconnected_agents: z.number().int().nonnegative(),
  offline_agents: z.number().int().nonnegative(),
  overall_presence: z.enum(['online', 'offline', 'disconnected', 'stale']),
  last_seen_at: z.string().nullable(),
  presence_reason: z.string().nullable(),
  affected_agents: z.array(agentAxisAffectedAgentSchema),
});

export const agentsStatusSchema = z.object({
  summary: agentSummarySchema,
  agents: z.array(agentStatusItemSchema),
  craftsmen: z.array(craftsmanStatusItemSchema),
  channel_summaries: z.array(agentChannelSummarySchema),
  host_summaries: z.array(agentHostSummarySchema),
  tmux_runtime: tmuxRuntimeSchema.nullable(),
});
export type AgentsStatusDto = z.infer<typeof agentsStatusSchema>;

export const archiveJobSchema = z.object({
  id: z.number().int().nonnegative(),
  task_id: z.string(),
  task_title: z.string(),
  task_type: z.string(),
  status: z.string(),
  target_path: z.string().nullable(),
  writer_agent: z.string().nullable(),
  commit_hash: z.string().nullable(),
  requested_at: z.string(),
  completed_at: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()).nullable(),
});
export type ArchiveJobDto = z.infer<typeof archiveJobSchema>;

export const archiveJobStatusUpdateRequestSchema = z.object({
  status: z.enum(['notified', 'synced', 'failed']),
  commit_hash: z.string().optional(),
  error_message: z.string().optional(),
});
export type ArchiveJobStatusUpdateRequestDto = z.infer<typeof archiveJobStatusUpdateRequestSchema>;

export const archiveJobScanRequestSchema = z.object({
  timeout_ms: z.number().int().positive().default(3_600_000),
});
export type ArchiveJobScanRequestDto = z.infer<typeof archiveJobScanRequestSchema>;

export const archiveJobScanResponseSchema = z.object({
  failed: z.number().int().nonnegative(),
});
export type ArchiveJobScanResponseDto = z.infer<typeof archiveJobScanResponseSchema>;

export const archiveJobReceiptScanResponseSchema = z.object({
  processed: z.number().int().nonnegative(),
  synced: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type ArchiveJobReceiptScanResponseDto = z.infer<typeof archiveJobReceiptScanResponseSchema>;

export const todoItemSchema = z.object({
  id: z.number().int().nonnegative(),
  text: z.string(),
  status: z.string(),
  due: z.string().nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
  tags: z.array(z.string()),
  promoted_to: z.string().nullable(),
});
export type TodoItemDto = z.infer<typeof todoItemSchema>;

export const promoteTodoResultSchema = z.object({
  todo: todoItemSchema,
  task: taskSchema,
});
export type PromoteTodoResultDto = z.infer<typeof promoteTodoResultSchema>;

export const createTodoRequestSchema = z.object({
  text: z.string().min(1),
  due: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});
export type CreateTodoRequestDto = z.infer<typeof createTodoRequestSchema>;

export const updateTodoRequestSchema = z.object({
  text: z.string().min(1).optional(),
  due: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['pending', 'done']).optional(),
});
export type UpdateTodoRequestDto = z.infer<typeof updateTodoRequestSchema>;

export const promoteTodoRequestSchema = z.object({
  type: z.string().min(1).default('quick'),
  creator: z.string().min(1).default('archon'),
  priority: taskPrioritySchema.default('normal'),
});
export type PromoteTodoRequestDto = z.infer<typeof promoteTodoRequestSchema>;

export const templateSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  description: z.string(),
  governance: governancePresetSchema.nullable(),
  stage_count: z.number().int().nonnegative(),
});
export type TemplateSummaryDto = z.infer<typeof templateSummarySchema>;

export const templateTeamMemberSchema = z.object({
  model_preference: z.string().min(1).optional(),
  suggested: z.array(z.string()).optional(),
}).strict();
export type TemplateTeamMemberDto = z.infer<typeof templateTeamMemberSchema>;

export const templateDefaultTeamSchema = z.record(z.string().min(1), templateTeamMemberSchema)
  .superRefine((value, ctx) => {
    for (const key of Object.keys(value)) {
      if (!allowedTemplateRoles.includes(key as (typeof allowedTemplateRoles)[number])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unsupported template team role: ${key}`,
          path: [key],
        });
      }
    }
  });

export const templateStageSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  mode: templateStageModeSchema.optional(),
  gate: z.object({
    type: templateGateTypeSchema.optional(),
    approver: templateRoleSchema.optional(),
    required: z.number().int().positive().optional(),
    timeout_sec: z.number().int().positive().optional(),
  }).strict().nullish(),
}).strict();
export type TemplateStageDto = z.infer<typeof templateStageSchema>;

export const templateDetailSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string().optional(),
  defaultWorkflow: z.string().optional(),
  governance: governancePresetSchema.optional(),
  defaultTeam: templateDefaultTeamSchema.optional(),
  stages: z.array(templateStageSchema).optional(),
}).superRefine((value, ctx) => {
  validateWorkflowStages(value.stages, ctx);
});
export type TemplateDetailDto = z.infer<typeof templateDetailSchema>;
