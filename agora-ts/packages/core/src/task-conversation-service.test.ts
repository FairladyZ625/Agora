import { describe, expect, it } from 'vitest';
import {
  HumanAccountRepository,
  HumanIdentityBindingRepository,
  TaskContextBindingRepository,
  TaskConversationReadCursorRepository,
  TaskConversationRepository,
} from '@agora-ts/db';
import { createTestRuntime } from '@agora-ts/testing';
import { HumanAccountService } from './human-account-service.js';
import { TaskContextBindingService } from './task-context-binding-service.js';
import { TaskConversationService } from './task-conversation-service.js';

describe('TaskConversationService', () => {
  it('ingests an entry by matching thread_ref to an active binding', () => {
    const runtime = createTestRuntime();
    try {
      const bindings = new TaskContextBindingService({
        repository: new TaskContextBindingRepository(runtime.db),
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

      const service = new TaskConversationService({
        bindingRepository: new TaskContextBindingRepository(runtime.db),
        conversationRepository: new TaskConversationRepository(runtime.db),
        readCursorRepository: new TaskConversationReadCursorRepository(runtime.db),
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
      const bindings = new TaskContextBindingService({
        repository: new TaskContextBindingRepository(runtime.db),
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

      const service = new TaskConversationService({
        bindingRepository: new TaskContextBindingRepository(runtime.db),
        conversationRepository: new TaskConversationRepository(runtime.db),
        readCursorRepository: new TaskConversationReadCursorRepository(runtime.db),
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

  it('builds a summary-first read model with latest excerpt and count', () => {
    const runtime = createTestRuntime();
    try {
      const bindings = new TaskContextBindingService({
        repository: new TaskContextBindingRepository(runtime.db),
        idGenerator: () => 'binding-3',
      });
      const task = runtime.taskService.createTask({
        title: 'Conversation summary task',
        type: 'coding',
        creator: 'archon',
        description: 'test',
        priority: 'normal',
      });
      bindings.createBinding({
        task_id: task.id,
        im_provider: 'discord',
        thread_ref: 'thread-3',
      });

      const service = new TaskConversationService({
        bindingRepository: new TaskContextBindingRepository(runtime.db),
        conversationRepository: new TaskConversationRepository(runtime.db),
        readCursorRepository: new TaskConversationReadCursorRepository(runtime.db),
        idGenerator: () => `entry-${Math.random()}`,
        now: () => new Date('2026-03-10T12:10:00.000Z'),
      });
      service.ingest({
        provider: 'discord',
        thread_ref: 'thread-3',
        direction: 'inbound',
        author_kind: 'human',
        display_name: 'Lizeyu',
        body: 'first note',
        occurred_at: '2026-03-10T12:00:00.000Z',
      });
      service.ingest({
        provider: 'discord',
        thread_ref: 'thread-3',
        direction: 'outbound',
        author_kind: 'agent',
        display_name: 'Agora Bot',
        body: 'x'.repeat(200),
        occurred_at: '2026-03-10T12:05:00.000Z',
      });

      expect(service.getSummaryByTask(task.id)).toMatchObject({
        task_id: task.id,
        total_entries: 2,
        latest_provider: 'discord',
        latest_direction: 'outbound',
        latest_author_kind: 'agent',
        latest_display_name: 'Agora Bot',
        latest_occurred_at: '2026-03-10T12:05:00.000Z',
      });
      expect(service.getSummaryByTask(task.id).latest_body_excerpt).toHaveLength(161);
    } finally {
      runtime.cleanup();
    }
  });

  it('tracks unread counts and clears them when a human marks the task conversation as read', () => {
    const runtime = createTestRuntime();
    try {
      const bindings = new TaskContextBindingService({
        repository: new TaskContextBindingRepository(runtime.db),
        idGenerator: () => 'binding-4',
      });
      const task = runtime.taskService.createTask({
        title: 'Conversation unread task',
        type: 'coding',
        creator: 'archon',
        description: 'test',
        priority: 'normal',
      });
      bindings.createBinding({
        task_id: task.id,
        im_provider: 'discord',
        thread_ref: 'thread-4',
      });
      const humans = new HumanAccountService({
        accountRepository: new HumanAccountRepository(runtime.db),
        identityBindingRepository: new HumanIdentityBindingRepository(runtime.db),
      });
      const account = humans.bootstrapAdmin({
        username: 'lizeyu',
        password: 'secret-pass',
      });

      let index = 0;
      const service = new TaskConversationService({
        bindingRepository: new TaskContextBindingRepository(runtime.db),
        conversationRepository: new TaskConversationRepository(runtime.db),
        readCursorRepository: new TaskConversationReadCursorRepository(runtime.db),
        idGenerator: () => `entry-${++index}`,
        now: () => new Date('2026-03-10T12:10:00.000Z'),
      });
      service.ingest({
        provider: 'discord',
        thread_ref: 'thread-4',
        direction: 'inbound',
        author_kind: 'human',
        body: 'first unread',
        occurred_at: '2026-03-10T12:00:00.000Z',
      });
      service.ingest({
        provider: 'discord',
        thread_ref: 'thread-4',
        direction: 'outbound',
        author_kind: 'agent',
        body: 'second unread',
        occurred_at: '2026-03-10T12:05:00.000Z',
      });

      expect(service.getSummaryByTask(task.id, account.id)).toMatchObject({
        task_id: task.id,
        unread_count: 2,
        has_unread: true,
        last_read_at: null,
      });

      const readSummary = service.markRead(task.id, account.id, {
        last_read_entry_id: 'entry-2',
        read_at: '2026-03-10T12:15:00.000Z',
      });

      expect(readSummary).toMatchObject({
        task_id: task.id,
        unread_count: 0,
        has_unread: false,
        last_read_at: '2026-03-10T12:15:00.000Z',
      });
    } finally {
      runtime.cleanup();
    }
  });
});
