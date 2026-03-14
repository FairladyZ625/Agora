import { z } from 'zod';

export const roleMemberKindSchema = z.enum(['controller', 'citizen', 'craftsman']);
export type RoleMemberKindDto = z.infer<typeof roleMemberKindSchema>;

export const roleTargetKindSchema = z.enum(['runtime_agent', 'craftsman_executor']);
export type RoleTargetKindDto = z.infer<typeof roleTargetKindSchema>;

export const roleBindingScopeSchema = z.enum(['workspace', 'template', 'task']);
export type RoleBindingScopeDto = z.infer<typeof roleBindingScopeSchema>;

export const roleBindingModeSchema = z.enum(['overlay', 'generated']);
export type RoleBindingModeDto = z.infer<typeof roleBindingModeSchema>;

export const roleCitizenScaffoldSchema = z.object({
  soul: z.string().min(1),
  boundaries: z.array(z.string().min(1)).min(1),
  heartbeat: z.array(z.string().min(1)).min(1),
  recap_expectations: z.array(z.string().min(1)).min(1),
}).strict();
export type RoleCitizenScaffoldDto = z.infer<typeof roleCitizenScaffoldSchema>;

function defaultAllowedTargetKinds(memberKind: RoleMemberKindDto): RoleTargetKindDto[] {
  return memberKind === 'craftsman' ? ['craftsman_executor'] : ['runtime_agent'];
}

export const roleDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  member_kind: roleMemberKindSchema,
  summary: z.string().min(1),
  prompt_asset: z.string().min(1),
  source: z.string().min(1),
  source_ref: z.string().nullable().optional(),
  default_model_preference: z.string().nullable().optional(),
  allowed_target_kinds: z.array(roleTargetKindSchema).min(1).optional(),
  citizen_scaffold: roleCitizenScaffoldSchema.nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict().transform((value) => ({
  ...value,
  source_ref: value.source_ref ?? null,
  default_model_preference: value.default_model_preference ?? null,
  allowed_target_kinds: value.allowed_target_kinds ?? defaultAllowedTargetKinds(value.member_kind),
  citizen_scaffold: value.citizen_scaffold ?? null,
  metadata: value.metadata ?? {},
}));
export type RoleDefinitionDto = z.infer<typeof roleDefinitionSchema>;

export const rolePackManifestSchema = z.object({
  id: z.string().min(1).optional(),
  pack_id: z.string().min(1).optional(),
  name: z.string().min(1),
  version: z.number().int().positive(),
  source: z.string().min(1).optional(),
  roles: z.array(roleDefinitionSchema).min(1),
}).strict().superRefine((value, ctx) => {
  if (!value.id && !value.pack_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'role pack manifest requires id or pack_id',
      path: ['id'],
    });
  }
}).transform((value) => ({
  id: value.id ?? value.pack_id!,
  name: value.name,
  version: value.version,
  source: value.source ?? null,
  roles: value.roles,
}));
export type RolePackManifestDto = z.infer<typeof rolePackManifestSchema>;

export const roleBindingSchema = z.object({
  id: z.string().min(1),
  role_id: z.string().min(1),
  scope: roleBindingScopeSchema,
  scope_ref: z.string().min(1),
  target_kind: roleTargetKindSchema,
  target_adapter: z.string().min(1),
  target_ref: z.string().min(1),
  binding_mode: roleBindingModeSchema,
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
}).strict();
export type RoleBindingDto = z.infer<typeof roleBindingSchema>;
