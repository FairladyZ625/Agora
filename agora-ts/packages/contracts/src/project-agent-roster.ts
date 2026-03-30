import { z } from 'zod';

export const projectAgentRosterKindSchema = z.enum(['orchestrator', 'worker', 'specialist']);
export type ProjectAgentRosterKindDto = z.infer<typeof projectAgentRosterKindSchema>;

export const projectAgentRosterStatusSchema = z.enum(['active', 'removed']);
export type ProjectAgentRosterStatusDto = z.infer<typeof projectAgentRosterStatusSchema>;

export const projectAgentRosterSchema = z.object({
  id: z.string().min(1),
  project_id: z.string().min(1),
  agent_ref: z.string().min(1),
  kind: projectAgentRosterKindSchema,
  default_inclusion: z.boolean(),
  status: projectAgentRosterStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
});
export type ProjectAgentRosterDto = z.infer<typeof projectAgentRosterSchema>;

export const createProjectAgentRosterEntrySchema = z.object({
  agent_ref: z.string().min(1),
  kind: projectAgentRosterKindSchema,
  default_inclusion: z.boolean().optional(),
}).strict();
export type CreateProjectAgentRosterEntryDto = z.infer<typeof createProjectAgentRosterEntrySchema>;
