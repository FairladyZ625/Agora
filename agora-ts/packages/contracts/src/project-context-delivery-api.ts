import { z } from 'zod';
import { attentionRoutingPlanSchema } from './attention-routing.js';
import { projectContextBriefingArtifactSchema } from './context-briefing-api.js';
import { referenceBundleSchema } from './context-reference.js';

export const projectContextDeliveryRequestSchema = z.object({
  audience: z.enum(['controller', 'citizen', 'craftsman']),
  task_id: z.string().trim().min(1).optional(),
  citizen_id: z.string().trim().min(1).nullable().optional(),
  allowed_citizen_ids: z.array(z.string().trim().min(1)).optional(),
});

export const projectContextRuntimeDeliverySchema = z.object({
  task_id: z.string().trim().min(1),
  task_title: z.string().trim().min(1),
  workspace_path: z.string().min(1),
  manifest_path: z.string().min(1),
  artifact_paths: z.object({
    controller: z.string().min(1),
    citizen: z.string().min(1),
    craftsman: z.string().min(1),
  }),
});

export const projectContextDeliveryPayloadSchema = z.object({
  briefing: projectContextBriefingArtifactSchema,
  reference_bundle: referenceBundleSchema.nullable(),
  attention_routing_plan: attentionRoutingPlanSchema.nullable(),
  runtime_delivery: projectContextRuntimeDeliverySchema.nullable(),
});

export const projectContextDeliveryResponseSchema = z.object({
  scope: z.literal('project_context'),
  delivery: projectContextDeliveryPayloadSchema,
});

export type ProjectContextDeliveryRequestDto = z.infer<typeof projectContextDeliveryRequestSchema>;
export type ProjectContextRuntimeDeliveryDto = z.infer<typeof projectContextRuntimeDeliverySchema>;
export type ProjectContextDeliveryPayloadDto = z.infer<typeof projectContextDeliveryPayloadSchema>;
export type ProjectContextDeliveryResponseDto = z.infer<typeof projectContextDeliveryResponseSchema>;
