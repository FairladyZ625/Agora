import { z } from 'zod';

export const runtimeRecoveryActionStatusSchema = z.enum(['accepted', 'unsupported', 'unavailable']);
export type RuntimeRecoveryActionStatusDto = z.infer<typeof runtimeRecoveryActionStatusSchema>;

export const runtimeDiagnosisHealthSchema = z.enum(['healthy', 'degraded', 'unavailable']);
export type RuntimeDiagnosisHealthDto = z.infer<typeof runtimeDiagnosisHealthSchema>;

export const runtimeRecoveryActionSchema = z.object({
  operation: z.enum(['restart_citizen_runtime', 'stop_execution']),
  status: runtimeRecoveryActionStatusSchema,
  task_id: z.string().min(1).nullable(),
  agent_ref: z.string().min(1).nullable(),
  execution_id: z.string().min(1).nullable(),
  summary: z.string().min(1),
  detail: z.string().nullable(),
});
export type RuntimeRecoveryActionDto = z.infer<typeof runtimeRecoveryActionSchema>;

export const runtimeDiagnosisResultSchema = z.object({
  operation: z.literal('request_runtime_diagnosis'),
  task_id: z.string().min(1),
  agent_ref: z.string().min(1),
  status: runtimeRecoveryActionStatusSchema,
  health: runtimeDiagnosisHealthSchema,
  runtime_provider: z.string().nullable(),
  runtime_actor_ref: z.string().nullable(),
  summary: z.string().min(1),
  detail: z.string().nullable(),
});
export type RuntimeDiagnosisResultDto = z.infer<typeof runtimeDiagnosisResultSchema>;

export const runtimeRecoveryRequestSchema = z.object({
  task_id: z.string().min(1),
  agent_ref: z.string().min(1),
  caller_id: z.string().min(1),
  reason: z.string().optional(),
});
export type RuntimeRecoveryRequestDto = z.infer<typeof runtimeRecoveryRequestSchema>;

export const craftsmanStopExecutionRequestSchema = z.object({
  caller_id: z.string().min(1),
  reason: z.string().optional(),
});
export type CraftsmanStopExecutionRequestDto = z.infer<typeof craftsmanStopExecutionRequestSchema>;
