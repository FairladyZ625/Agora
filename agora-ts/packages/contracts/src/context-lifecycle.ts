import { z } from 'zod';

export const contextLifecyclePhaseSchema = z.enum([
  'bootstrap',
  'disclose',
  'execute',
  'capture',
  'harvest',
  'evolve',
]);

export const contextLifecycleStatusSchema = z.enum([
  'ready',
  'blocked',
  'not_configured',
]);

export const contextLifecyclePhaseSnapshotSchema = z.object({
  phase: contextLifecyclePhaseSchema,
  status: contextLifecycleStatusSchema,
  summary: z.string().trim().min(1),
  reference_keys: z.array(z.string().min(1)).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const contextLifecycleSnapshotSchema = z.object({
  project_id: z.string().min(1),
  task_id: z.string().nullable().optional(),
  generated_at: z.string().datetime(),
  phases: z.array(contextLifecyclePhaseSnapshotSchema).length(6),
});

export type ContextLifecyclePhase = z.infer<typeof contextLifecyclePhaseSchema>;
export type ContextLifecycleStatus = z.infer<typeof contextLifecycleStatusSchema>;
export type ContextLifecyclePhaseSnapshotDto = z.infer<typeof contextLifecyclePhaseSnapshotSchema>;
export type ContextLifecycleSnapshotDto = z.infer<typeof contextLifecycleSnapshotSchema>;
