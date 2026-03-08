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

export const craftsmanExecutionPayloadSchema = z.record(z.string(), z.unknown());
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
