import { z } from 'zod';

export const attentionRoutingRouteKindSchema = z.enum([
  'project_map',
  'focus',
  'supporting',
]);

export const attentionRoutingRouteSchema = z.object({
  reference_key: z.string().trim().min(1),
  kind: attentionRoutingRouteKindSchema,
  ordinal: z.number().int().positive(),
  rationale: z.string().trim().min(1),
  score: z.number().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const attentionRoutingPlanSchema = z.object({
  scope: z.string().trim().min(1),
  mode: z.string().trim().min(1),
  project_id: z.string().min(1),
  task_id: z.string().nullable().optional(),
  audience: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  routes: z.array(attentionRoutingRouteSchema),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type AttentionRoutingRouteKind = z.infer<typeof attentionRoutingRouteKindSchema>;
export type AttentionRoutingRouteDto = z.infer<typeof attentionRoutingRouteSchema>;
export type AttentionRoutingPlanDto = z.infer<typeof attentionRoutingPlanSchema>;
