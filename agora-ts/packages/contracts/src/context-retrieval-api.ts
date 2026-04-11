import { z } from 'zod';
import { retrievalQuerySchema, retrievalResultSchema } from './context-retrieval.js';

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

export type ProjectContextRetrieveRequestDto = z.infer<typeof projectContextRetrieveRequestSchema>;
export type ProjectContextRetrieveResponseDto = z.infer<typeof projectContextRetrieveResponseSchema>;
