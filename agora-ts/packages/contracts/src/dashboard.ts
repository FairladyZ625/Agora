import { z } from 'zod';
import { taskSchema } from './task-api.js';
import { taskPrioritySchema } from './task.js';

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
  provider: z.string().nullable().optional(),
  account_id: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
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
});

export const agentProviderAffectedAgentSchema = z.object({
  id: z.string(),
  status: z.string(),
  presence: z.enum(['online', 'offline', 'disconnected', 'stale']),
  presence_reason: z.string().nullable(),
  last_seen_at: z.string().nullable(),
  account_id: z.string().nullable(),
});

export const agentProviderSummarySchema = z.object({
  provider: z.string(),
  total_agents: z.number().int().nonnegative(),
  busy_agents: z.number().int().nonnegative(),
  online_agents: z.number().int().nonnegative(),
  stale_agents: z.number().int().nonnegative(),
  disconnected_agents: z.number().int().nonnegative(),
  offline_agents: z.number().int().nonnegative(),
  overall_presence: z.enum(['online', 'offline', 'disconnected', 'stale']),
  last_seen_at: z.string().nullable(),
  presence_reason: z.string().nullable(),
  affected_agents: z.array(agentProviderAffectedAgentSchema),
});

export const agentsStatusSchema = z.object({
  summary: agentSummarySchema,
  agents: z.array(agentStatusItemSchema),
  craftsmen: z.array(craftsmanStatusItemSchema),
  provider_summaries: z.array(agentProviderSummarySchema),
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
  governance: z.unknown(),
  stage_count: z.number().int().nonnegative(),
});
export type TemplateSummaryDto = z.infer<typeof templateSummarySchema>;

export const templateTeamMemberSchema = z.object({
  suggested: z.array(z.string()).optional(),
}).passthrough();
export type TemplateTeamMemberDto = z.infer<typeof templateTeamMemberSchema>;

export const templateStageSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  mode: z.string().optional(),
  gate: z.object({
    type: z.string().optional(),
  }).passthrough().nullish(),
}).passthrough();
export type TemplateStageDto = z.infer<typeof templateStageSchema>;

export const templateDetailSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string().optional(),
  defaultWorkflow: z.string().optional(),
  governance: z.unknown().optional(),
  defaultTeam: z.record(z.string(), templateTeamMemberSchema).optional(),
  stages: z.array(templateStageSchema).optional(),
});
export type TemplateDetailDto = z.infer<typeof templateDetailSchema>;
