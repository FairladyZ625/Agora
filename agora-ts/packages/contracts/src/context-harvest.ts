import { z } from 'zod';

export const contextCaptureCandidateSchema = z.object({
  kind: z.enum(['task_close_recap', 'task_harvest_draft', 'project_recap']),
  label: z.string().trim().min(1),
  path: z.string().min(1).nullable().optional(),
  summary: z.string().trim().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const contextHarvestProposalSchema = z.object({
  project_id: z.string().min(1),
  task_id: z.string().min(1),
  lock_holder_task_id: z.string().min(1),
  canonical_root: z.string().nullable(),
  candidates: z.array(contextCaptureCandidateSchema).min(1),
});

export const contextReconcileReportSchema = z.object({
  project_id: z.string().min(1),
  status: z.enum(['healthy', 'drift_detected', 'not_configured']),
  summary: z.string().trim().min(1),
  pending_jobs: z.number().int().nonnegative(),
  failed_jobs: z.number().int().nonnegative(),
  documents_without_jobs: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ContextCaptureCandidateDto = z.infer<typeof contextCaptureCandidateSchema>;
export type ContextHarvestProposalDto = z.infer<typeof contextHarvestProposalSchema>;
export type ContextReconcileReportDto = z.infer<typeof contextReconcileReportSchema>;
