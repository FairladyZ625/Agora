import type {
  INotificationOutboxRepository,
  ITaskConversationRepository,
  ITaskContextBindingRepository,
  NotificationOutboxRecord,
} from '@agora-ts/contracts';
import type { IMMessagingPort } from './im-ports.js';
import { summarizeCraftsmanOutputForHuman } from './craftsman-output.js';

export interface NotificationDispatcherOptions {
  outboxRepository: INotificationOutboxRepository;
  conversationRepository: ITaskConversationRepository;
  bindingRepository: ITaskContextBindingRepository;
  messagingPort: IMMessagingPort;
  batchSize?: number;
}

export class NotificationDispatcher {
  private readonly outbox: INotificationOutboxRepository;
  private readonly conversations: ITaskConversationRepository;
  private readonly bindings: ITaskContextBindingRepository;
  private readonly messagingPort: IMMessagingPort;
  private readonly batchSize: number;

  constructor(options: NotificationDispatcherOptions) {
    this.outbox = options.outboxRepository;
    this.conversations = options.conversationRepository;
    this.bindings = options.bindingRepository;
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
        this.mirrorDeliveredNotification(notification);
        delivered += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.outbox.markFailed(notification.id, message);
        failed += 1;
      }
    }

    return { delivered, failed };
  }

  private resolveTarget(notification: NotificationOutboxRecord): string | null {
    if (!notification.target_binding_id) {
      return null;
    }
    const binding = this.bindings.getById(notification.target_binding_id);
    if (!binding) {
      return null;
    }
    return binding.thread_ref ?? binding.conversation_ref ?? null;
  }

  private mirrorDeliveredNotification(notification: NotificationOutboxRecord) {
    if (!notification.target_binding_id) {
      return;
    }
    const binding = this.bindings.getById(notification.target_binding_id);
    if (!binding) {
      return;
    }
    this.conversations.insert({
      id: `${notification.id}:delivered`,
      task_id: notification.task_id,
      binding_id: binding.id,
      provider: binding.im_provider,
      direction: 'system',
      author_kind: 'system',
      author_ref: 'notification-dispatcher',
      display_name: 'notification-dispatcher',
      body: formatDeliveredNotificationBody(notification),
      body_format: 'plain_text',
      occurred_at: new Date().toISOString(),
      dedupe_key: `notification-delivered:${notification.id}`,
      metadata: {
        notification_id: notification.id,
        event_type: notification.event_type,
      },
    });
  }
}

function formatDeliveredNotificationBody(notification: NotificationOutboxRecord) {
  if (notification.event_type === 'craftsman_completed') {
    const output = typeof notification.payload.display_output === 'string'
      ? notification.payload.display_output
      : notification.payload.output;
    const summary = typeof output === 'string' && output.trim().length > 0
      ? summarizeCraftsmanOutputForHuman(output, 'completed')
      : 'completed';
    return `Notification delivered: craftsman finished: ${summary}`;
  }
  if (notification.event_type === 'craftsman_failed') {
    const output = typeof notification.payload.display_output === 'string'
      ? notification.payload.display_output
      : notification.payload.output;
    const summary = typeof output === 'string' && output.trim().length > 0
      ? summarizeCraftsmanOutputForHuman(output, 'failed')
      : 'failed';
    return `Notification delivered: craftsman failed: ${summary}`;
  }
  return `Notification delivered: ${notification.event_type}`;
}
