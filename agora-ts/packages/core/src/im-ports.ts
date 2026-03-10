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
