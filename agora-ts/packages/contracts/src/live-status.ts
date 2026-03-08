import { z } from 'zod';

export const liveSessionStatusSchema = z.enum(['active', 'idle', 'closed']);
export type LiveSessionStatusDto = z.infer<typeof liveSessionStatusSchema>;

export const liveSessionSchema = z.object({
  source: z.literal('openclaw'),
  agent_id: z.string().min(1),
  session_key: z.string().min(1),
  channel: z.string().min(1).nullable(),
  account_id: z.string().min(1).nullable().optional(),
  conversation_id: z.string().min(1).nullable().optional(),
  thread_id: z.string().min(1).nullable().optional(),
  status: liveSessionStatusSchema,
  last_event: z.string().min(1),
  last_event_at: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type LiveSessionDto = z.infer<typeof liveSessionSchema>;

