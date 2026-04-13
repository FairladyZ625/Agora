import { z } from 'zod';

export const runtimeProviderSchema = z.enum(['openclaw', 'cc-connect', 'acpx', 'tmux']);
export type RuntimeProviderDto = z.infer<typeof runtimeProviderSchema>;
export const runtimeSessionPresenceStateSchema = z.enum(['active', 'idle', 'closed']);
export type RuntimeSessionPresenceStateDto = z.infer<typeof runtimeSessionPresenceStateSchema>;
export const runtimeSessionDesiredPresenceSchema = z.enum(['attached', 'detached']);
export type RuntimeSessionDesiredPresenceDto = z.infer<typeof runtimeSessionDesiredPresenceSchema>;

export const runtimeSessionBindingSchema = z.object({
  id: z.string(),
  participant_binding_id: z.string(),
  runtime_provider: runtimeProviderSchema,
  runtime_session_ref: z.string(),
  runtime_actor_ref: z.string().nullable(),
  continuity_ref: z.string().nullable(),
  presence_state: runtimeSessionPresenceStateSchema,
  binding_reason: z.string().nullable(),
  desired_runtime_presence: runtimeSessionDesiredPresenceSchema,
  reconcile_stage_id: z.string().nullable(),
  reconciled_at: z.string().nullable(),
  last_seen_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
});
export type RuntimeSessionBindingDto = z.infer<typeof runtimeSessionBindingSchema>;
