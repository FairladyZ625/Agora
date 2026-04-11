import { z } from 'zod';
import {
  projectContextBriefingArtifactSchema,
  projectContextBriefingRequestSchema,
} from './context-briefing-api.js';

export const contextMaterializationTargetSchema = z.enum([
  'project_context_briefing',
]);

export const projectContextBriefingMaterializationRequestSchema = projectContextBriefingRequestSchema.extend({
  target: z.literal('project_context_briefing'),
  project_id: z.string().trim().min(1),
});

export const contextMaterializationRequestSchema = z.discriminatedUnion('target', [
  projectContextBriefingMaterializationRequestSchema,
]);

export const projectContextBriefingMaterializationResultSchema = z.object({
  target: z.literal('project_context_briefing'),
  artifact: projectContextBriefingArtifactSchema,
});

export const contextMaterializationResultSchema = z.discriminatedUnion('target', [
  projectContextBriefingMaterializationResultSchema,
]);

export type ContextMaterializationTargetDto = z.infer<typeof contextMaterializationTargetSchema>;
export type ProjectContextBriefingMaterializationRequestDto = z.infer<typeof projectContextBriefingMaterializationRequestSchema>;
export type ContextMaterializationRequestDto = z.infer<typeof contextMaterializationRequestSchema>;
export type ProjectContextBriefingMaterializationResultDto = z.infer<typeof projectContextBriefingMaterializationResultSchema>;
export type ContextMaterializationResultDto = z.infer<typeof contextMaterializationResultSchema>;
