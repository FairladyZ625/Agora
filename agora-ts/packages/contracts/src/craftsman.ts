import { z } from 'zod';

export const craftsmanModeSchema = z.enum(['one_shot', 'interactive']);
export type CraftsmanModeDto = z.infer<typeof craftsmanModeSchema>;

export const craftsmanInteractionExpectationSchema = z.enum([
  'one_shot',
  'needs_input',
  'awaiting_choice',
]);
export type CraftsmanInteractionExpectationDto = z.infer<typeof craftsmanInteractionExpectationSchema>;

export const craftsmanExecutionStatusSchema = z.enum([
  'queued',
  'running',
  'needs_input',
  'awaiting_choice',
  'succeeded',
  'failed',
  'cancelled',
]);
export type CraftsmanExecutionStatusDto = z.infer<typeof craftsmanExecutionStatusSchema>;

export const craftsmanInputTransportSchema = z.enum(['text', 'keys', 'choice']);
export type CraftsmanInputTransportDto = z.infer<typeof craftsmanInputTransportSchema>;

export const craftsmanInputKeySchema = z.enum([
  'Up',
  'Down',
  'Left',
  'Right',
  'Tab',
  'Enter',
  'Escape',
  'Space',
  'Backspace',
]);
export type CraftsmanInputKeyDto = z.infer<typeof craftsmanInputKeySchema>;

export const craftsmanChoiceOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().nullable().optional(),
  keys: z.array(craftsmanInputKeySchema).optional().default([]),
  submit: z.boolean().optional().default(true),
}).strict();
export type CraftsmanChoiceOptionDto = z.infer<typeof craftsmanChoiceOptionSchema>;

export const craftsmanInputRequestSchema = z.object({
  transport: craftsmanInputTransportSchema,
  hint: z.string().nullable().optional(),
  text_placeholder: z.string().nullable().optional(),
  keys: z.array(craftsmanInputKeySchema).optional(),
  choice_options: z.array(craftsmanChoiceOptionSchema).optional(),
}).strict();
export type CraftsmanInputRequestDto = z.infer<typeof craftsmanInputRequestSchema>;

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
  input_request: craftsmanInputRequestSchema.nullable().optional(),
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
  mode: craftsmanModeSchema.default('one_shot'),
  interaction_expectation: craftsmanInteractionExpectationSchema.default('one_shot'),
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

export const tmuxSendTextRequestSchema = z.object({
  agent: z.string().min(1),
  text: z.string(),
  submit: z.boolean().optional().default(true),
}).strict();
export type TmuxSendTextRequestDto = z.infer<typeof tmuxSendTextRequestSchema>;

export const tmuxSendKeysRequestSchema = z.object({
  agent: z.string().min(1),
  keys: z.array(craftsmanInputKeySchema).min(1),
}).strict();
export type TmuxSendKeysRequestDto = z.infer<typeof tmuxSendKeysRequestSchema>;

export const tmuxSubmitChoiceRequestSchema = z.object({
  agent: z.string().min(1),
  keys: z.array(craftsmanInputKeySchema).optional().default([]),
}).strict();
export type TmuxSubmitChoiceRequestDto = z.infer<typeof tmuxSubmitChoiceRequestSchema>;

export const craftsmanExecutionSendTextRequestSchema = z.object({
  execution_id: z.string().min(1),
  text: z.string(),
  submit: z.boolean().optional().default(true),
}).strict();
export type CraftsmanExecutionSendTextRequestDto = z.infer<typeof craftsmanExecutionSendTextRequestSchema>;

export const craftsmanExecutionSendKeysRequestSchema = z.object({
  execution_id: z.string().min(1),
  keys: z.array(craftsmanInputKeySchema).min(1),
}).strict();
export type CraftsmanExecutionSendKeysRequestDto = z.infer<typeof craftsmanExecutionSendKeysRequestSchema>;

export const craftsmanExecutionSubmitChoiceRequestSchema = z.object({
  execution_id: z.string().min(1),
  keys: z.array(craftsmanInputKeySchema).optional().default([]),
}).strict();
export type CraftsmanExecutionSubmitChoiceRequestDto = z.infer<typeof craftsmanExecutionSubmitChoiceRequestSchema>;
