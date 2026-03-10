import { describe, expect, it } from 'vitest';
import {
  taskConversationEntrySchema,
  taskConversationListResponseSchema,
  ingestTaskConversationEntryRequestSchema,
} from './task-conversation.js';

describe('task conversation contracts', () => {
  it('parses a task conversation entry', () => {
    const parsed = taskConversationEntrySchema.parse({
      id: 'entry-1',
      task_id: 'OC-960',
      binding_id: 'binding-1',
      provider: 'discord',
      provider_message_ref: 'msg-1',
      parent_message_ref: null,
      direction: 'inbound',
      author_kind: 'human',
      author_ref: 'user-1',
      display_name: 'Lizeyu',
      body: 'hello world',
      body_format: 'plain_text',
      occurred_at: '2026-03-10T12:00:00.000Z',
      ingested_at: '2026-03-10T12:00:01.000Z',
      metadata: { thread_name: 'task-thread' },
    });

    expect(parsed.provider).toBe('discord');
    expect(parsed.body).toBe('hello world');
  });

  it('parses an ingest request and list response', () => {
    const request = ingestTaskConversationEntryRequestSchema.parse({
      provider: 'discord',
      thread_ref: 'thread-1',
      provider_message_ref: 'msg-1',
      direction: 'inbound',
      author_kind: 'human',
      author_ref: 'user-1',
      display_name: 'Lizeyu',
      body: 'hello',
      occurred_at: '2026-03-10T12:00:00.000Z',
      metadata: { account_id: 'main' },
    });
    const response = taskConversationListResponseSchema.parse({
      entries: [{
        id: 'entry-1',
        task_id: 'OC-960',
        binding_id: 'binding-1',
        provider: 'discord',
        provider_message_ref: 'msg-1',
        parent_message_ref: null,
        direction: 'inbound',
        author_kind: 'human',
        author_ref: 'user-1',
        display_name: 'Lizeyu',
        body: 'hello',
        body_format: 'plain_text',
        occurred_at: '2026-03-10T12:00:00.000Z',
        ingested_at: '2026-03-10T12:00:01.000Z',
        metadata: null,
      }],
    });

    expect(request.thread_ref).toBe('thread-1');
    expect(response.entries).toHaveLength(1);
  });
});
