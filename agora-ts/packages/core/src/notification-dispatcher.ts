import {
  NotificationOutboxRepository,
  TaskContextBindingRepository,
  type AgoraDatabase,
  type StoredNotificationOutbox,
} from '@agora-ts/db';
import type { IMMessagingPort } from './im-ports.js';

export interface NotificationDispatcherOptions {
  messagingPort: IMMessagingPort;
  batchSize?: number;
}

export class NotificationDispatcher {
  private readonly outbox: NotificationOutboxRepository;
  private readonly bindings: TaskContextBindingRepository;
  private readonly messagingPort: IMMessagingPort;
  private readonly batchSize: number;

  constructor(db: AgoraDatabase, options: NotificationDispatcherOptions) {
    this.outbox = new NotificationOutboxRepository(db);
    this.bindings = new TaskContextBindingRepository(db);
    this.messagingPort = options.messagingPort;
    this.batchSize = options.batchSize ?? 50;
  }

  async scan(): Promise<{ delivered: number; failed: number }> {
    const pending = this.outbox.listPending(this.batchSize);
    let delivered = 0;
    let failed = 0;

    for (const notification of pending) {
      const targetRef = this.resolveTarget(notification);
      if (!targetRef) {
        this.outbox.markDelivered(notification.id);
        continue;
      }
      try {
        await this.messagingPort.sendNotification(targetRef, {
          task_id: notification.task_id,
          event_type: notification.event_type,
          data: notification.payload,
        });
        this.outbox.markDelivered(notification.id);
        delivered += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.outbox.markFailed(notification.id, message);
        failed += 1;
      }
    }

    return { delivered, failed };
  }

  private resolveTarget(notification: StoredNotificationOutbox): string | null {
    if (!notification.target_binding_id) {
      return null;
    }
    const binding = this.bindings.getById(notification.target_binding_id);
    if (!binding) {
      return null;
    }
    return binding.thread_ref ?? binding.conversation_ref ?? null;
  }
}
