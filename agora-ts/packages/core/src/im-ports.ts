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
  /** Create a thread for a task. Returns the thread ref (e.g. Discord thread ID). */
  provisionThread(taskId: string, taskTitle: string): Promise<string>;
}

export class StubIMProvisioningPort implements IMProvisioningPort {
  readonly provisioned: Array<{ taskId: string; taskTitle: string }> = [];

  async provisionThread(taskId: string, taskTitle: string): Promise<string> {
    this.provisioned.push({ taskId, taskTitle });
    return `stub-thread-${taskId}`;
  }
}
