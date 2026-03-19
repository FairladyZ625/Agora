import { z } from 'zod';

const allowedWorkflowRosterRoles = [
  'architect',
  'developer',
  'reviewer',
  'writer',
  'researcher',
  'analyst',
  'executor',
  'craftsman',
] as const;

export const workflowRosterRoleSchema = z.enum(allowedWorkflowRosterRoles);
export type WorkflowRosterRoleDto = z.infer<typeof workflowRosterRoleSchema>;

const workflowRosterAgentRefSchema = z.string().min(1);

export const workflowStageRosterSchema = z.object({
  include_roles: z.array(workflowRosterRoleSchema).min(1).optional(),
  include_agents: z.array(workflowRosterAgentRefSchema).min(1).optional(),
  exclude_agents: z.array(workflowRosterAgentRefSchema).min(1).optional(),
  keep_controller: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (
    !value.include_roles?.length
    && !value.include_agents?.length
    && !value.exclude_agents?.length
    && value.keep_controller === undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'stage roster must declare at least one selector or keep_controller',
      path: [],
    });
  }
});
export type WorkflowStageRosterDto = z.infer<typeof workflowStageRosterSchema>;
