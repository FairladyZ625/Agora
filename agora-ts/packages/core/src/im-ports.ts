export interface NotificationPayload {
  task_id: string;
  event_type: string;
  data: Record<string, unknown>;
}

export interface IMMessagingPort {
  sendNotification(targetRef: string, payload: NotificationPayload): Promise<void>;
}

export class StubIMMessagingPort implements IMMessagingPort {
  readonly sent: Array<{ targetRef: string; payload: NotificationPayload }> = [];

  async sendNotification(targetRef: string, payload: NotificationPayload): Promise<void> {
    this.sent.push({ targetRef, payload });
  }
}

export interface IMProvisioningPort {
  /** Create/bind an IM context for a task and return provider-neutral refs. */
  provisionThread(taskId: string, taskTitle: string): Promise<{
    im_provider: string;
    conversation_ref?: string | null;
    thread_ref?: string | null;
    message_root_ref?: string | null;
  }>;
}

export class StubIMProvisioningPort implements IMProvisioningPort {
  private readonly provisionedBinding: {
    im_provider: string;
    conversation_ref?: string | null;
    thread_ref?: string | null;
    message_root_ref?: string | null;
  };
  readonly provisioned: Array<{ taskId: string; taskTitle: string }> = [];

  constructor(binding: {
    im_provider?: string;
    conversation_ref?: string | null;
    thread_ref?: string | null;
    message_root_ref?: string | null;
  } = {}) {
    this.provisionedBinding = {
      im_provider: binding.im_provider ?? 'stub',
      conversation_ref: binding.conversation_ref ?? null,
      thread_ref: binding.thread_ref ?? null,
      message_root_ref: binding.message_root_ref ?? null,
    };
  }

  async provisionThread(taskId: string, taskTitle: string): Promise<{
    im_provider: string;
    conversation_ref?: string | null;
    thread_ref?: string | null;
    message_root_ref?: string | null;
  }> {
    this.provisioned.push({ taskId, taskTitle });
    return {
      ...this.provisionedBinding,
      thread_ref: this.provisionedBinding.thread_ref ?? `stub-thread-${taskId}`,
    };
  }
}
