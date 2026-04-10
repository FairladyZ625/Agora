import { z } from 'zod';
import {
  createTaskAuthoritySchema,
  createTaskImTargetSchema,
  taskControlSchema,
  taskLocaleSchema,
  taskSkillPolicySchema,
  teamSchema,
  workflowSchema,
} from './task-api.js';
import { taskPrioritySchema } from './task.js';

export const orchestratorConversationConfirmationSchema = z.object({
  kind: z.literal('conversation_confirmation'),
  confirmation_mode: z.literal('oral'),
  confirmed_by: z.string().min(1),
  confirmed_at: z.string().datetime(),
  source: z.literal('conversation'),
  source_ref: z.string().min(1).nullable().optional(),
}).strict();
export type OrchestratorConversationConfirmationDto = z.infer<typeof orchestratorConversationConfirmationSchema>;

export const orchestratorDirectCreateRequestSchema = z.object({
  orchestrator_ref: z.string().min(1),
  confirmation: orchestratorConversationConfirmationSchema,
  create: z.object({
    title: z.string().min(1),
    type: z.string().min(1),
    creator: z.string().min(1),
    description: z.string(),
    priority: taskPrioritySchema.default('normal'),
    locale: taskLocaleSchema.optional(),
    project_id: z.string().min(1).nullable().optional(),
    team_override: teamSchema.optional(),
    workflow_override: workflowSchema.optional(),
    im_target: createTaskImTargetSchema.optional(),
    authority: createTaskAuthoritySchema.optional(),
    control: taskControlSchema.nullable().optional(),
    skill_policy: taskSkillPolicySchema.nullable().optional(),
  }).strict(),
}).strict();
export type OrchestratorDirectCreateRequestDto = z.infer<typeof orchestratorDirectCreateRequestSchema>;
