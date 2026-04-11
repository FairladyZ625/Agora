import { z } from 'zod';
import { retrievalHealthSchema, retrievalQuerySchema, retrievalResultSchema } from './context-retrieval.js';

export const projectContextRetrieveRequestSchema = z.object({
  mode: z.string().trim().min(1).optional(),
  query: retrievalQuerySchema,
  limit: z.number().int().positive().max(50).optional(),
  task_id: z.string().trim().min(1).optional(),
  audience: z.string().trim().min(1).optional(),
  providers: z.array(z.string().trim().min(1)).optional(),
  source_ids: z.array(z.string().trim().min(1)).optional(),
});

export const projectContextRetrieveResponseSchema = z.object({
  scope: z.literal('project_context'),
  mode: z.string().trim().min(1),
  results: z.array(retrievalResultSchema),
});

export const projectContextHealthRequestSchema = z.object({
  mode: z.string().trim().min(1).optional(),
  task_id: z.string().trim().min(1).optional(),
  audience: z.string().trim().min(1).optional(),
  providers: z.array(z.string().trim().min(1)).optional(),
  source_ids: z.array(z.string().trim().min(1)).optional(),
});

export const projectContextHealthResponseSchema = z.object({
  scope: z.literal('project_context'),
  mode: z.string().trim().min(1),
  health: z.array(retrievalHealthSchema),
});

export type ProjectContextRetrieveRequestDto = z.infer<typeof projectContextRetrieveRequestSchema>;
export type ProjectContextRetrieveResponseDto = z.infer<typeof projectContextRetrieveResponseSchema>;
export type ProjectContextHealthRequestDto = z.infer<typeof projectContextHealthRequestSchema>;
export type ProjectContextHealthResponseDto = z.infer<typeof projectContextHealthResponseSchema>;
