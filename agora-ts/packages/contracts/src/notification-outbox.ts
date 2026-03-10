import { z } from 'zod';

export const notificationOutboxStatusSchema = z.enum([
  'pending',
  'delivered',
  'failed',
  'skipped',
]);

export type NotificationOutboxStatus = z.infer<typeof notificationOutboxStatusSchema>;

export const notificationEventTypeSchema = z.enum([
  'craftsman_completed',
  'craftsman_failed',
  'task_state_changed',
  'stage_advanced',
]);

export type NotificationEventType = z.infer<typeof notificationEventTypeSchema>;

export const notificationOutboxSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  event_type: notificationEventTypeSchema,
  target_binding_id: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  status: notificationOutboxStatusSchema,
  sequence_no: z.number().int(),
  retry_count: z.number().int(),
  max_retries: z.number().int(),
  next_retry_at: z.string().nullable(),
  last_error: z.string().nullable(),
  created_at: z.string(),
  delivered_at: z.string().nullable(),
});

export type NotificationOutboxDto = z.infer<typeof notificationOutboxSchema>;
