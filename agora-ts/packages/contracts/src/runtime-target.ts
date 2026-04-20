import { z } from 'zod';

export const runtimeTargetPresentationModeSchema = z.enum(['headless', 'im_presented']);
export type RuntimeTargetPresentationModeDto = z.infer<typeof runtimeTargetPresentationModeSchema>;

export const runtimeTargetOverlaySchema = z.object({
  runtime_target_ref: z.string().min(1),
  enabled: z.boolean(),
  display_name: z.string().nullable(),
  tags: z.array(z.string()),
  allowed_projects: z.array(z.string()),
  default_roles: z.array(z.string()),
  presentation_mode: runtimeTargetPresentationModeSchema,
  presentation_provider: z.string().nullable(),
  presentation_identity_ref: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type RuntimeTargetOverlayDto = z.infer<typeof runtimeTargetOverlaySchema>;

export const runtimeTargetSchema = z.object({
  runtime_target_ref: z.string().min(1),
  inventory_kind: z.literal('runtime_target'),
  runtime_provider: z.string().nullable(),
  runtime_flavor: z.string().nullable(),
  host_framework: z.string().nullable(),
  primary_model: z.string().nullable(),
  workspace_dir: z.string().nullable(),
  channel_providers: z.array(z.string()),
  inventory_sources: z.array(z.string()),
  discord_bot_user_ids: z.array(z.string()),
  enabled: z.boolean(),
  display_name: z.string().nullable(),
  tags: z.array(z.string()),
  allowed_projects: z.array(z.string()),
  default_roles: z.array(z.string()),
  presentation_mode: runtimeTargetPresentationModeSchema,
  presentation_provider: z.string().nullable(),
  presentation_identity_ref: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  discovered: z.boolean(),
});
export type RuntimeTargetDto = z.infer<typeof runtimeTargetSchema>;

export const runtimeTargetListResponseSchema = z.object({
  runtime_targets: z.array(runtimeTargetSchema),
});
export type RuntimeTargetListResponseDto = z.infer<typeof runtimeTargetListResponseSchema>;

export const runtimeTargetResponseSchema = z.object({
  runtime_target: runtimeTargetSchema,
});
export type RuntimeTargetResponseDto = z.infer<typeof runtimeTargetResponseSchema>;

export const upsertRuntimeTargetOverlayRequestSchema = z.object({
  enabled: z.boolean().optional(),
  display_name: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  allowed_projects: z.array(z.string()).optional(),
  default_roles: z.array(z.string()).optional(),
  presentation_mode: runtimeTargetPresentationModeSchema.optional(),
  presentation_provider: z.string().nullable().optional(),
  presentation_identity_ref: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
}).strict();
export type UpsertRuntimeTargetOverlayRequestDto = z.infer<typeof upsertRuntimeTargetOverlayRequestSchema>;

export const projectRuntimeTargetMapSchema = z.object({
  flavors: z.record(z.string(), z.string()).optional(),
  default: z.string().optional(),
  default_coding: z.string().optional(),
  default_review: z.string().optional(),
}).strict();
export type ProjectRuntimeTargetMapDto = z.infer<typeof projectRuntimeTargetMapSchema>;

export const projectRoleRuntimePolicyItemSchema = z.object({
  preferred_flavor: z.string().nullable().optional(),
}).strict();
export type ProjectRoleRuntimePolicyItemDto = z.infer<typeof projectRoleRuntimePolicyItemSchema>;

export const projectRuntimePolicySchema = z.object({
  runtime_targets: projectRuntimeTargetMapSchema.nullable(),
  role_runtime_policy: z.record(z.string(), projectRoleRuntimePolicyItemSchema),
});
export type ProjectRuntimePolicyDto = z.infer<typeof projectRuntimePolicySchema>;

export const projectRuntimePolicyResponseSchema = z.object({
  project_id: z.string().min(1),
  runtime_policy: projectRuntimePolicySchema,
});
export type ProjectRuntimePolicyResponseDto = z.infer<typeof projectRuntimePolicyResponseSchema>;

export const updateProjectRuntimePolicyRequestSchema = z.object({
  runtime_targets: projectRuntimeTargetMapSchema.nullable().optional(),
  role_runtime_policy: z.record(z.string(), projectRoleRuntimePolicyItemSchema).optional(),
}).strict();
export type UpdateProjectRuntimePolicyRequestDto = z.infer<typeof updateProjectRuntimePolicyRequestSchema>;
