import { z } from 'zod';
import { referenceBundleSchema } from './context-reference.js';

export const projectContextReferenceBundleRequestSchema = z.object({
  mode: z.enum(['bootstrap', 'disclose']).default('bootstrap'),
  audience: z.enum(['controller', 'citizen', 'craftsman']),
  task_id: z.string().trim().min(1).optional(),
  citizen_id: z.string().trim().min(1).nullable().optional(),
  allowed_citizen_ids: z.array(z.string().trim().min(1)).optional(),
});

export const projectContextReferenceBundleResponseSchema = z.object({
  scope: z.literal('project_context'),
  bundle: referenceBundleSchema,
});

export type ProjectContextReferenceBundleRequestDto = z.infer<typeof projectContextReferenceBundleRequestSchema>;
export type ProjectContextReferenceBundleResponseDto = z.infer<typeof projectContextReferenceBundleResponseSchema>;
