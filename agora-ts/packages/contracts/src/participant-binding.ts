import { z } from 'zod';

export const participantBindingSourceSchema = z.enum(['template', 'manual', 'scheduler', 'recovery']);
export type ParticipantBindingSourceDto = z.infer<typeof participantBindingSourceSchema>;

export const participantBindingJoinStatusSchema = z.enum(['pending', 'joined', 'left', 'failed']);
export type ParticipantBindingJoinStatusDto = z.infer<typeof participantBindingJoinStatusSchema>;

export const participantBindingSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  binding_id: z.string().nullable(),
  agent_ref: z.string(),
  runtime_provider: z.string().nullable(),
  task_role: z.string(),
  source: participantBindingSourceSchema,
  join_status: participantBindingJoinStatusSchema,
  created_at: z.string(),
  joined_at: z.string().nullable(),
  left_at: z.string().nullable(),
});
export type ParticipantBindingDto = z.infer<typeof participantBindingSchema>;

