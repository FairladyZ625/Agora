import { z } from 'zod';

export const inboxItemSchema = z.object({
  id: z.number().int().nonnegative(),
  text: z.string(),
  status: z.string(),
  source: z.string().nullable(),
  notes: z.string().nullable(),
  tags: z.array(z.string()),
  created_at: z.string(),
  promoted_to_type: z.string().nullable(),
  promoted_to_id: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
});
export type InboxItemDto = z.infer<typeof inboxItemSchema>;

export const createInboxRequestSchema = z.object({
  text: z.string().min(1),
  source: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
export type CreateInboxRequestDto = z.infer<typeof createInboxRequestSchema>;

export const updateInboxRequestSchema = z.object({
  text: z.string().min(1).optional(),
  status: z.string().optional(),
  source: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type UpdateInboxRequestDto = z.infer<typeof updateInboxRequestSchema>;

export const promoteInboxRequestSchema = z.object({
  target: z.enum(['todo', 'task']).default('todo'),
  type: z.string().default('quick'),
  creator: z.string().default('archon'),
  priority: z.string().default('normal'),
});
export type PromoteInboxRequestDto = z.infer<typeof promoteInboxRequestSchema>;
