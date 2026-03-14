import { z } from 'zod';
import { liveSessionStatusSchema } from './live-status.js';
import { hostResourceSnapshotSchema } from './task-api.js';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const healthLayerStatusSchema = z.enum(['healthy', 'degraded', 'unavailable']);
export type HealthLayerStatusDto = z.infer<typeof healthLayerStatusSchema>;

export const healthCountByLabelSchema = z.object({
  label: z.string().min(1),
  count: z.number().int().nonnegative(),
});
export type HealthCountByLabelDto = z.infer<typeof healthCountByLabelSchema>;

export const escalationLevelSchema = z.enum(['none', 'controller', 'roster', 'inbox']);
export type EscalationLevelDto = z.infer<typeof escalationLevelSchema>;

export const escalationPolicySnapshotSchema = z.object({
  controller_after_ms: z.number().int().nonnegative(),
  roster_after_ms: z.number().int().nonnegative(),
  inbox_after_ms: z.number().int().nonnegative(),
});
export type EscalationPolicySnapshotDto = z.infer<typeof escalationPolicySnapshotSchema>;

export const taskHealthSnapshotSchema = z.object({
  status: healthLayerStatusSchema,
  total_tasks: z.number().int().nonnegative(),
  active_tasks: z.number().int().nonnegative(),
  paused_tasks: z.number().int().nonnegative(),
  blocked_tasks: z.number().int().nonnegative(),
  done_tasks: z.number().int().nonnegative(),
});
export type TaskHealthSnapshotDto = z.infer<typeof taskHealthSnapshotSchema>;

export const imHealthSnapshotSchema = z.object({
  status: healthLayerStatusSchema,
  active_bindings: z.number().int().nonnegative(),
  active_threads: z.number().int().nonnegative(),
  bindings_by_provider: z.array(healthCountByLabelSchema),
});
export type ImHealthSnapshotDto = z.infer<typeof imHealthSnapshotSchema>;

export const runtimeHealthAgentSchema = z.object({
  agent_id: z.string().min(1),
  status: liveSessionStatusSchema,
  session_count: z.number().int().nonnegative(),
  last_event_at: z.string().datetime().nullable(),
});
export type RuntimeHealthAgentDto = z.infer<typeof runtimeHealthAgentSchema>;

export const runtimeHealthSnapshotSchema = z.object({
  status: healthLayerStatusSchema,
  available: z.boolean(),
  stale_after_ms: z.number().int().nonnegative().nullable(),
  active_sessions: z.number().int().nonnegative(),
  idle_sessions: z.number().int().nonnegative(),
  closed_sessions: z.number().int().nonnegative(),
  agents: z.array(runtimeHealthAgentSchema),
});
export type RuntimeHealthSnapshotDto = z.infer<typeof runtimeHealthSnapshotSchema>;

export const craftsmanHealthSnapshotSchema = z.object({
  status: healthLayerStatusSchema,
  active_executions: z.number().int().nonnegative(),
  queued_executions: z.number().int().nonnegative(),
  running_executions: z.number().int().nonnegative(),
  waiting_input_executions: z.number().int().nonnegative(),
  awaiting_choice_executions: z.number().int().nonnegative(),
  active_by_assignee: z.array(healthCountByLabelSchema),
});
export type CraftsmanHealthSnapshotDto = z.infer<typeof craftsmanHealthSnapshotSchema>;

export const hostHealthSnapshotSchema = z.object({
  status: healthLayerStatusSchema,
  snapshot: hostResourceSnapshotSchema.nullable(),
});
export type HostHealthSnapshotDto = z.infer<typeof hostHealthSnapshotSchema>;

export const escalationHealthSnapshotSchema = z.object({
  status: healthLayerStatusSchema,
  policy: escalationPolicySnapshotSchema,
  controller_pinged_tasks: z.number().int().nonnegative(),
  roster_pinged_tasks: z.number().int().nonnegative(),
  inbox_escalated_tasks: z.number().int().nonnegative(),
  unhealthy_runtime_agents: z.number().int().nonnegative(),
  runtime_unhealthy: z.boolean(),
});
export type EscalationHealthSnapshotDto = z.infer<typeof escalationHealthSnapshotSchema>;

export const unifiedHealthSnapshotSchema = z.object({
  generated_at: z.string().datetime(),
  tasks: taskHealthSnapshotSchema,
  im: imHealthSnapshotSchema,
  runtime: runtimeHealthSnapshotSchema,
  craftsman: craftsmanHealthSnapshotSchema,
  host: hostHealthSnapshotSchema,
  escalation: escalationHealthSnapshotSchema,
});
export type UnifiedHealthSnapshotDto = z.infer<typeof unifiedHealthSnapshotSchema>;
