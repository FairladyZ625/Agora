import { z } from 'zod';

export const taskContextBindingStatusSchema = z.enum([
  'provisioning',
  'active',
  'archived',
  'destroyed',
  'failed',
]);

export type TaskContextBindingStatus = z.infer<typeof taskContextBindingStatusSchema>;

export const taskContextBindingSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  im_provider: z.string(),
  conversation_ref: z.string().nullable(),
  thread_ref: z.string().nullable(),
  message_root_ref: z.string().nullable(),
  status: taskContextBindingStatusSchema,
  created_at: z.string(),
  closed_at: z.string().nullable(),
});

export type TaskContextBindingDto = z.infer<typeof taskContextBindingSchema>;

export const createTaskContextBindingRequestSchema = z.object({
  im_provider: z.string(),
  conversation_ref: z.string().optional(),
  thread_ref: z.string().optional(),
  message_root_ref: z.string().optional(),
});

export type CreateTaskContextBindingRequestDto = z.infer<typeof createTaskContextBindingRequestSchema>;
