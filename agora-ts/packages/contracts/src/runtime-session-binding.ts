import { z } from 'zod';

export const runtimeSessionPresenceStateSchema = z.enum(['active', 'idle', 'closed']);
export type RuntimeSessionPresenceStateDto = z.infer<typeof runtimeSessionPresenceStateSchema>;

export const runtimeSessionBindingSchema = z.object({
  id: z.string(),
  participant_binding_id: z.string(),
  runtime_provider: z.string(),
  runtime_session_ref: z.string(),
  runtime_actor_ref: z.string().nullable(),
  continuity_ref: z.string().nullable(),
  presence_state: runtimeSessionPresenceStateSchema,
  last_seen_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
});
export type RuntimeSessionBindingDto = z.infer<typeof runtimeSessionBindingSchema>;

