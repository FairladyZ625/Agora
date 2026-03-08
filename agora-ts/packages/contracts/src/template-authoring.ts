import { z } from 'zod';
import { templateDetailSchema, templateStageSchema } from './dashboard.js';

export const templateValidationRequestSchema = templateDetailSchema;
export type TemplateValidationRequestDto = z.infer<typeof templateValidationRequestSchema>;

export const templateValidationResponseSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()),
  normalized: templateDetailSchema.nullable(),
});
export type TemplateValidationResponseDto = z.infer<typeof templateValidationResponseSchema>;

export const saveTemplateRequestSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  template: templateDetailSchema,
});
export type SaveTemplateRequestDto = z.infer<typeof saveTemplateRequestSchema>;

export const duplicateTemplateRequestSchema = z.object({
  new_id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().optional(),
});
export type DuplicateTemplateRequestDto = z.infer<typeof duplicateTemplateRequestSchema>;

export const updateTemplateWorkflowRequestSchema = z.object({
  defaultWorkflow: z.string().optional(),
  stages: z.array(templateStageSchema).min(1),
});
export type UpdateTemplateWorkflowRequestDto = z.infer<typeof updateTemplateWorkflowRequestSchema>;

export const validateWorkflowRequestSchema = updateTemplateWorkflowRequestSchema;
export type ValidateWorkflowRequestDto = z.infer<typeof validateWorkflowRequestSchema>;
