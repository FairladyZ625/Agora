import { z } from 'zod';

export const craftsmanModeSchema = z.enum(['task', 'continuous']);
export type CraftsmanModeDto = z.infer<typeof craftsmanModeSchema>;

export const craftsmanExecutionStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);
export type CraftsmanExecutionStatusDto = z.infer<typeof craftsmanExecutionStatusSchema>;

export const craftsmanAdapterSchema = z.string().min(1);
export type CraftsmanAdapterDto = z.infer<typeof craftsmanAdapterSchema>;

export const craftsmanNormalizedOutputSchema = z.object({
  summary: z.string().nullable().optional(),
  text: z.string().nullable().optional(),
  stderr: z.string().nullable().optional(),
  artifacts: z.array(z.string()).optional().default([]),
  structured: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type CraftsmanNormalizedOutputDto = z.infer<typeof craftsmanNormalizedOutputSchema>;

export const craftsmanExecutionPayloadSchema = z.object({
  output: craftsmanNormalizedOutputSchema.optional(),
}).catchall(z.unknown());
export type CraftsmanExecutionPayloadDto = z.infer<typeof craftsmanExecutionPayloadSchema>;

export const craftsmanExecutionSchema = z.object({
  execution_id: z.string().min(1),
  task_id: z.string().min(1),
  subtask_id: z.string().min(1),
  adapter: craftsmanAdapterSchema,
  mode: craftsmanModeSchema,
  session_id: z.string().nullable(),
  status: craftsmanExecutionStatusSchema,
  brief_path: z.string().nullable(),
  workdir: z.string().nullable(),
  callback_payload: craftsmanExecutionPayloadSchema.nullable(),
  error: z.string().nullable(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type CraftsmanExecutionDto = z.infer<typeof craftsmanExecutionSchema>;

export const craftsmanDispatchRequestSchema = z.object({
  task_id: z.string().min(1),
  subtask_id: z.string().min(1),
  caller_id: z.string().min(1),
  adapter: craftsmanAdapterSchema,
  mode: craftsmanModeSchema.default('task'),
  brief_path: z.string().nullable().optional(),
  workdir: z.string().nullable().optional(),
});
export type CraftsmanDispatchRequestDto = z.infer<typeof craftsmanDispatchRequestSchema>;

export const craftsmanDispatchResponseSchema = z.object({
  execution: craftsmanExecutionSchema,
});
export type CraftsmanDispatchResponseDto = z.infer<typeof craftsmanDispatchResponseSchema>;

export const craftsmanCallbackRequestSchema = z.object({
  execution_id: z.string().min(1),
  status: craftsmanExecutionStatusSchema.exclude(['queued']),
  session_id: z.string().nullable().optional(),
  payload: craftsmanExecutionPayloadSchema.nullable().optional(),
  error: z.string().nullable().optional(),
  finished_at: z.string().nullable().optional(),
});
export type CraftsmanCallbackRequestDto = z.infer<typeof craftsmanCallbackRequestSchema>;

export const craftsmanRuntimeIdentitySourceSchema = z.enum([
  'registry_default',
  'runtime_gateway',
  'plugin_event',
  'hook_event',
  'session_file',
  'chat_file',
  'latest_fallback',
  'manual',
  'transport_session',
]);
export type CraftsmanRuntimeIdentitySourceDto = z.infer<typeof craftsmanRuntimeIdentitySourceSchema>;

export const craftsmanRuntimeIdentityRequestSchema = z.object({
  agent: z.string().min(1),
  session_reference: z.string().min(1).nullable().optional(),
  identity_source: craftsmanRuntimeIdentitySourceSchema,
  identity_path: z.string().min(1).nullable().optional(),
  session_observed_at: z.string().min(1).nullable().optional(),
  workspace_root: z.string().min(1).nullable().optional(),
});
export type CraftsmanRuntimeIdentityRequestDto = z.infer<typeof craftsmanRuntimeIdentityRequestSchema>;
