import { describe, expect, it } from 'vitest';
import { createTestRuntime } from '@agora-ts/testing';
import { NotificationDispatcher } from './notification-dispatcher.js';
import { StubIMMessagingPort } from './im-ports.js';
import { NotificationOutboxRepository, TaskContextBindingRepository, TaskConversationRepository } from '@agora-ts/db';

describe('NotificationDispatcher', () => {
  it('delivers pending notifications via the messaging port', async () => {
    const runtime = createTestRuntime();
    try {
      const port = new StubIMMessagingPort();
      const bindings = new TaskContextBindingRepository(runtime.db);
      const outbox = new NotificationOutboxRepository(runtime.db);
      const conversations = new TaskConversationRepository(runtime.db);
      const dispatcher = new NotificationDispatcher({
        outboxRepository: outbox,
        conversationRepository: conversations,
        bindingRepository: bindings,
        messagingPort: port,
      });

      const task = runtime.taskService.createTask({
        title: 'Notify test',
        type: 'coding',
        creator: 'archon',
        description: 'test',
        priority: 'normal',
      });

      const binding = bindings.insert({
        id: 'bind-1',
        task_id: task.id,
        im_provider: 'discord',
        thread_ref: 'thread-abc',
        status: 'active',
      });

      outbox.insert({
        id: 'notif-1',
        task_id: task.id,
        event_type: 'craftsman_completed',
        target_binding_id: binding.id,
        payload: { execution_id: 'exec-1', output: 'done' },
        sequence_no: 1,
      });

      const result = await dispatcher.scan();

      expect(result.delivered).toBe(1);
      expect(result.failed).toBe(0);
      expect(port.sent).toHaveLength(1);
      expect(port.sent[0]?.targetRef).toBe('thread-abc');
      expect(port.sent[0]?.payload.event_type).toBe('craftsman_completed');

      const updated = outbox.getById('notif-1');
      expect(updated?.status).toBe('delivered');
      expect(updated?.delivered_at).not.toBeNull();
      expect(conversations.listByTask(task.id)).toEqual([
        expect.objectContaining({
          task_id: task.id,
          binding_id: binding.id,
          provider: 'discord',
          direction: 'system',
          author_kind: 'system',
          body: 'Notification delivered: craftsman finished: done',
          metadata: expect.objectContaining({
            notification_id: 'notif-1',
            event_type: 'craftsman_completed',
          }),
        }),
      ]);
    } finally {
      runtime.cleanup();
    }
  });

  it('skips notifications without a resolvable target', async () => {
    const runtime = createTestRuntime();
    try {
      const port = new StubIMMessagingPort();
      const outbox = new NotificationOutboxRepository(runtime.db);
      const dispatcher = new NotificationDispatcher({
        outboxRepository: outbox,
        conversationRepository: new TaskConversationRepository(runtime.db),
        bindingRepository: new TaskContextBindingRepository(runtime.db),
        messagingPort: port,
      });

      const task = runtime.taskService.createTask({
        title: 'No binding test',
        type: 'coding',
        creator: 'archon',
        description: 'test',
        priority: 'normal',
      });

      outbox.insert({
        id: 'notif-2',
        task_id: task.id,
        event_type: 'craftsman_completed',
        payload: { execution_id: 'exec-2' },
        sequence_no: 1,
      });

      const result = await dispatcher.scan();

      expect(result.delivered).toBe(0);
      expect(port.sent).toHaveLength(0);
      const updated = outbox.getById('notif-2');
      expect(updated?.status).toBe('delivered');
    } finally {
      runtime.cleanup();
    }
  });

  it('marks notifications as failed when messaging port throws', async () => {
    const runtime = createTestRuntime();
    try {
      const port: StubIMMessagingPort = {
        sent: [],
        async sendNotification() {
          throw new Error('Discord API error');
        },
      };
      const bindings = new TaskContextBindingRepository(runtime.db);
      const outbox = new NotificationOutboxRepository(runtime.db);
      const dispatcher = new NotificationDispatcher({
        outboxRepository: outbox,
        conversationRepository: new TaskConversationRepository(runtime.db),
        bindingRepository: bindings,
        messagingPort: port,
      });

      const task = runtime.taskService.createTask({
        title: 'Fail test',
        type: 'coding',
        creator: 'archon',
        description: 'test',
        priority: 'normal',
      });

      bindings.insert({
        id: 'bind-fail',
        task_id: task.id,
        im_provider: 'discord',
        thread_ref: 'thread-fail',
        status: 'active',
      });

      outbox.insert({
        id: 'notif-fail',
        task_id: task.id,
        event_type: 'craftsman_completed',
        target_binding_id: 'bind-fail',
        payload: { execution_id: 'exec-fail' },
        sequence_no: 1,
      });

      const result = await dispatcher.scan();

      expect(result.delivered).toBe(0);
      expect(result.failed).toBe(1);
      const updated = outbox.getById('notif-fail');
      expect(updated?.last_error).toBe('Discord API error');
      expect(updated?.retry_count).toBe(1);
    } finally {
      runtime.cleanup();
    }
  });
});
