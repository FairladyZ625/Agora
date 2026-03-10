import { z } from 'zod';

export const taskConversationDirectionSchema = z.enum(['inbound', 'outbound', 'system']);
export type TaskConversationDirection = z.infer<typeof taskConversationDirectionSchema>;

export const taskConversationAuthorKindSchema = z.enum(['human', 'agent', 'craftsman', 'system']);
export type TaskConversationAuthorKind = z.infer<typeof taskConversationAuthorKindSchema>;

export const taskConversationBodyFormatSchema = z.enum(['plain_text', 'markdown', 'structured']);
export type TaskConversationBodyFormat = z.infer<typeof taskConversationBodyFormatSchema>;

export const taskConversationEntrySchema = z.object({
  id: z.string(),
  task_id: z.string(),
  binding_id: z.string(),
  provider: z.string(),
  provider_message_ref: z.string().nullable(),
  parent_message_ref: z.string().nullable(),
  direction: taskConversationDirectionSchema,
  author_kind: taskConversationAuthorKindSchema,
  author_ref: z.string().nullable(),
  display_name: z.string().nullable(),
  body: z.string(),
  body_format: taskConversationBodyFormatSchema,
  occurred_at: z.string(),
  ingested_at: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
});

export type TaskConversationEntryDto = z.infer<typeof taskConversationEntrySchema>;

export const ingestTaskConversationEntryRequestSchema = z.object({
  provider: z.string().min(1),
  conversation_ref: z.string().min(1).nullable().optional(),
  thread_ref: z.string().min(1).nullable().optional(),
  provider_message_ref: z.string().min(1).nullable().optional(),
  parent_message_ref: z.string().min(1).nullable().optional(),
  direction: taskConversationDirectionSchema,
  author_kind: taskConversationAuthorKindSchema,
  author_ref: z.string().min(1).nullable().optional(),
  display_name: z.string().min(1).nullable().optional(),
  body: z.string().min(1),
  body_format: taskConversationBodyFormatSchema.optional(),
  occurred_at: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type IngestTaskConversationEntryRequestDto = z.infer<typeof ingestTaskConversationEntryRequestSchema>;

export const taskConversationListResponseSchema = z.object({
  entries: z.array(taskConversationEntrySchema),
});

export type TaskConversationListResponseDto = z.infer<typeof taskConversationListResponseSchema>;

export const taskConversationSummarySchema = z.object({
  task_id: z.string(),
  total_entries: z.number().int().nonnegative(),
  latest_entry_id: z.string().nullable(),
  latest_provider: z.string().nullable(),
  latest_direction: taskConversationDirectionSchema.nullable(),
  latest_author_kind: taskConversationAuthorKindSchema.nullable(),
  latest_display_name: z.string().nullable(),
  latest_occurred_at: z.string().nullable(),
  latest_body_excerpt: z.string().nullable(),
  last_read_at: z.string().nullable(),
  unread_count: z.number().int().nonnegative(),
  has_unread: z.boolean(),
});

export type TaskConversationSummaryDto = z.infer<typeof taskConversationSummarySchema>;

export const taskConversationMarkReadRequestSchema = z.object({
  last_read_entry_id: z.string().min(1).nullable().optional(),
  read_at: z.string().nullable().optional(),
});

export type TaskConversationMarkReadRequestDto = z.infer<typeof taskConversationMarkReadRequestSchema>;
