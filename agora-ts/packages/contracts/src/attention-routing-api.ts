import { z } from 'zod';
import { attentionRoutingPlanSchema } from './attention-routing.js';
import { referenceBundleSchema } from './context-reference.js';

export const projectContextAttentionRoutingRequestSchema = z.object({
  mode: z.enum(['bootstrap', 'disclose']).default('bootstrap'),
  audience: z.enum(['controller', 'citizen', 'craftsman']),
  task_id: z.string().trim().min(1).optional(),
  task_title: z.string().trim().min(1).optional(),
  task_description: z.string().trim().min(1).optional(),
  citizen_id: z.string().trim().min(1).nullable().optional(),
  allowed_citizen_ids: z.array(z.string().trim().min(1)).optional(),
});

export const projectContextAttentionRoutingResponseSchema = z.object({
  scope: z.literal('project_context'),
  bundle: referenceBundleSchema,
  plan: attentionRoutingPlanSchema,
});

export type ProjectContextAttentionRoutingRequestDto = z.infer<typeof projectContextAttentionRoutingRequestSchema>;
export type ProjectContextAttentionRoutingResponseDto = z.infer<typeof projectContextAttentionRoutingResponseSchema>;
