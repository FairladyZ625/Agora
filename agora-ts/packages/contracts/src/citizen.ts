import { z } from 'zod';

export const citizenStatusSchema = z.enum(['active', 'archived']);
export type CitizenStatusDto = z.infer<typeof citizenStatusSchema>;

export const citizenBrainScaffoldModeSchema = z.enum(['role_default', 'custom']);
export type CitizenBrainScaffoldModeDto = z.infer<typeof citizenBrainScaffoldModeSchema>;

export const citizenProjectionTargetSchema = z.object({
  adapter: z.string().min(1),
  auto_provision: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict().transform((value) => ({
  ...value,
  metadata: value.metadata ?? {},
}));
export type CitizenProjectionTargetDto = z.infer<typeof citizenProjectionTargetSchema>;

export const citizenDefinitionSchema = z.object({
  citizen_id: z.string().min(1),
  project_id: z.string().min(1),
  role_id: z.string().min(1),
  display_name: z.string().min(1),
  persona: z.string().nullable(),
  boundaries: z.array(z.string().min(1)),
  skills_ref: z.array(z.string().min(1)),
  channel_policies: z.record(z.string(), z.unknown()),
  brain_scaffold_mode: citizenBrainScaffoldModeSchema,
  runtime_projection: citizenProjectionTargetSchema,
  status: citizenStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
});
export type CitizenDefinitionDto = z.infer<typeof citizenDefinitionSchema>;

export const createCitizenRequestSchema = z.object({
  citizen_id: z.string().min(1),
  project_id: z.string().min(1),
  role_id: z.string().min(1),
  display_name: z.string().min(1),
  persona: z.string().nullable().optional(),
  boundaries: z.array(z.string().min(1)).optional(),
  skills_ref: z.array(z.string().min(1)).optional(),
  channel_policies: z.record(z.string(), z.unknown()).optional(),
  brain_scaffold_mode: citizenBrainScaffoldModeSchema.optional(),
  runtime_projection: citizenProjectionTargetSchema.optional(),
}).strict().transform((value) => ({
  ...value,
  persona: value.persona ?? null,
  boundaries: value.boundaries ?? [],
  skills_ref: value.skills_ref ?? [],
  channel_policies: value.channel_policies ?? {},
  brain_scaffold_mode: value.brain_scaffold_mode ?? 'role_default',
  runtime_projection: value.runtime_projection ?? {
    adapter: 'openclaw',
    auto_provision: false,
    metadata: {},
  },
}));
export type CreateCitizenRequestDto = z.infer<typeof createCitizenRequestSchema>;

export const listCitizensResponseSchema = z.object({
  citizens: z.array(citizenDefinitionSchema),
});
export type ListCitizensResponseDto = z.infer<typeof listCitizensResponseSchema>;

export const citizenProjectionPreviewFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});
export type CitizenProjectionPreviewFileDto = z.infer<typeof citizenProjectionPreviewFileSchema>;

export const citizenProjectionPreviewSchema = z.object({
  citizen_id: z.string().min(1),
  adapter: z.string().min(1),
  summary: z.string().min(1),
  files: z.array(citizenProjectionPreviewFileSchema),
  metadata: z.record(z.string(), z.unknown()),
});
export type CitizenProjectionPreviewDto = z.infer<typeof citizenProjectionPreviewSchema>;
