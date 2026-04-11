import { z } from 'zod';

export const retrievalQuerySchema = z.object({
  text: z.string().trim().min(1),
});

export const retrievalPlanSchema = z.object({
  scope: z.string().trim().min(1),
  mode: z.string().trim().min(1),
  query: retrievalQuerySchema,
  limit: z.number().int().positive().max(50).optional(),
  context: z.object({
    task_id: z.string().min(1).optional(),
    project_id: z.string().min(1).optional(),
    audience: z.string().min(1).optional(),
  }).default({}),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const retrievalResultSchema = z.object({
  scope: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  reference_key: z.string().trim().min(1),
  project_id: z.string().min(1).nullable().optional(),
  title: z.string().nullable(),
  path: z.string().min(1),
  preview: z.string().min(1),
  score: z.number().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const retrievalHealthStatusSchema = z.enum(['ready', 'degraded', 'unavailable']);

export const retrievalHealthSchema = z.object({
  scope: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  status: retrievalHealthStatusSchema,
  message: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type RetrievalQueryDto = z.infer<typeof retrievalQuerySchema>;
export type RetrievalPlanDto = z.infer<typeof retrievalPlanSchema>;
export type RetrievalResultDto = z.infer<typeof retrievalResultSchema>;
export type RetrievalHealthDto = z.infer<typeof retrievalHealthSchema>;
