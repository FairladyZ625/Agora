import { describe, expect, it } from 'vitest';
import { createTestRuntime } from '@agora-ts/testing';
import { TaskContextBindingService } from './task-context-binding-service.js';
import { TaskConversationService } from './task-conversation-service.js';

describe('TaskConversationService', () => {
  it('ingests an entry by matching thread_ref to an active binding', () => {
    const runtime = createTestRuntime();
    try {
      const bindings = new TaskContextBindingService(runtime.db, {
        idGenerator: () => 'binding-1',
      });
      const task = runtime.taskService.createTask({
        title: 'Conversation task',
        type: 'coding',
        creator: 'archon',
        description: 'test',
        priority: 'normal',
      });
      bindings.createBinding({
        task_id: task.id,
        im_provider: 'discord',
        thread_ref: 'thread-1',
      });

      const service = new TaskConversationService(runtime.db, {
        idGenerator: () => 'entry-1',
        now: () => new Date('2026-03-10T12:00:01.000Z'),
      });
      const entry = service.ingest({
        provider: 'discord',
        thread_ref: 'thread-1',
        provider_message_ref: 'msg-1',
        direction: 'inbound',
        author_kind: 'human',
        author_ref: 'user-1',
        display_name: 'Lizeyu',
        body: 'hello',
        occurred_at: '2026-03-10T12:00:00.000Z',
      });

      expect(entry?.task_id).toBe(task.id);
      expect(service.listByTask(task.id)).toHaveLength(1);
    } finally {
      runtime.cleanup();
    }
  });

  it('falls back to conversation_ref matching and dedupes repeated entries', () => {
    const runtime = createTestRuntime();
    try {
      const bindings = new TaskContextBindingService(runtime.db, {
        idGenerator: () => 'binding-2',
      });
      const task = runtime.taskService.createTask({
        title: 'Conversation task 2',
        type: 'coding',
        creator: 'archon',
        description: 'test',
        priority: 'normal',
      });
      bindings.createBinding({
        task_id: task.id,
        im_provider: 'discord',
        conversation_ref: 'conv-1',
      });

      const service = new TaskConversationService(runtime.db, {
        idGenerator: () => 'entry-2',
        now: () => new Date('2026-03-10T12:00:02.000Z'),
      });
      const first = service.ingest({
        provider: 'discord',
        conversation_ref: 'conv-1',
        provider_message_ref: 'msg-2',
        direction: 'inbound',
        author_kind: 'human',
        body: 'hello again',
        occurred_at: '2026-03-10T12:00:00.000Z',
      });
      const second = service.ingest({
        provider: 'discord',
        conversation_ref: 'conv-1',
        provider_message_ref: 'msg-2',
        direction: 'inbound',
        author_kind: 'human',
        body: 'hello again',
        occurred_at: '2026-03-10T12:00:00.000Z',
      });

      expect(second?.id).toBe(first?.id);
      expect(service.listByTask(task.id)).toHaveLength(1);
    } finally {
      runtime.cleanup();
    }
  });
});
