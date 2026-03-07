import { z } from 'zod';

export const agentSummarySchema = z.object({
  active_tasks: z.number().int().nonnegative(),
  active_agents: z.number().int().nonnegative(),
  busy_craftsmen: z.number().int().nonnegative(),
});

export const agentStatusItemSchema = z.object({
  id: z.string(),
  role: z.string().nullable(),
  status: z.string(),
  active_task_ids: z.array(z.string()),
  active_subtask_ids: z.array(z.string()),
  load: z.number().int().nonnegative(),
  last_active_at: z.string().nullable(),
});

export const craftsmanStatusItemSchema = z.object({
  id: z.string(),
  status: z.string(),
  task_id: z.string(),
  subtask_id: z.string(),
  title: z.string(),
  running_since: z.string().nullable(),
});

export const agentsStatusSchema = z.object({
  summary: agentSummarySchema,
  agents: z.array(agentStatusItemSchema),
  craftsmen: z.array(craftsmanStatusItemSchema),
});

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

export const templateSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  description: z.string(),
  governance: z.unknown(),
  stage_count: z.number().int().nonnegative(),
});
