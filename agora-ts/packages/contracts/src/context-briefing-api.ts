import { z } from 'zod';
import { attentionRoutingPlanSchema } from './attention-routing.js';
import { referenceBundleSchema } from './context-reference.js';

const projectContextBriefingSourceDocumentSchema = z.object({
  kind: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  title: z.string().nullable(),
  path: z.string().min(1),
});

export const projectContextBriefingRequestSchema = z.object({
  audience: z.enum(['controller', 'citizen', 'craftsman']),
  task_id: z.string().trim().min(1).optional(),
  task_title: z.string().trim().min(1).optional(),
  task_description: z.string().trim().min(1).optional(),
  citizen_id: z.string().trim().min(1).nullable().optional(),
  allowed_citizen_ids: z.array(z.string().trim().min(1)).optional(),
});

export const projectContextBriefingArtifactSchema = z.object({
  project_id: z.string().min(1),
  audience: z.enum(['controller', 'citizen', 'craftsman']),
  markdown: z.string().min(1),
  reference_bundle: referenceBundleSchema.optional(),
  attention_routing_plan: attentionRoutingPlanSchema.optional(),
  source_documents: z.array(projectContextBriefingSourceDocumentSchema),
});

export const projectContextBriefingResponseSchema = z.object({
  scope: z.literal('project_context'),
  briefing: projectContextBriefingArtifactSchema,
});

export type ProjectContextBriefingRequestDto = z.infer<typeof projectContextBriefingRequestSchema>;
export type ProjectContextBriefingArtifactDto = z.infer<typeof projectContextBriefingArtifactSchema>;
export type ProjectContextBriefingResponseDto = z.infer<typeof projectContextBriefingResponseSchema>;
