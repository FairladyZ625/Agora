import { z } from 'zod';

export const projectMembershipRoleSchema = z.enum(['admin', 'member']);
export type ProjectMembershipRoleDto = z.infer<typeof projectMembershipRoleSchema>;

export const projectMembershipStatusSchema = z.enum(['active', 'removed']);
export type ProjectMembershipStatusDto = z.infer<typeof projectMembershipStatusSchema>;

export const projectMembershipSchema = z.object({
  id: z.string().min(1),
  project_id: z.string().min(1),
  account_id: z.number().int().positive(),
  role: projectMembershipRoleSchema,
  status: projectMembershipStatusSchema,
  added_by_account_id: z.number().int().positive().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ProjectMembershipDto = z.infer<typeof projectMembershipSchema>;

export const createProjectMembershipSchema = z.object({
  account_id: z.number().int().positive(),
  role: projectMembershipRoleSchema,
}).strict();
export type CreateProjectMembershipDto = z.infer<typeof createProjectMembershipSchema>;

export const createProjectAdminSchema = z.object({
  account_id: z.number().int().positive(),
}).strict();
export type CreateProjectAdminDto = z.infer<typeof createProjectAdminSchema>;
