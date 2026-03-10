import type { IMMessagingPort, NotificationPayload } from '@agora-ts/core';
import { DiscordHttpClient } from './discord-http-client.js';

export interface DiscordIMMessagingAdapterOptions {
  botToken: string;
}

export class DiscordIMMessagingAdapter implements IMMessagingPort {
  private readonly client: DiscordHttpClient;

  constructor(options: DiscordIMMessagingAdapterOptions) {
    this.client = new DiscordHttpClient({ botToken: options.botToken });
  }

  async sendNotification(targetRef: string, payload: NotificationPayload): Promise<void> {
    const content = formatNotification(payload);
    await this.client.sendMessage(targetRef, content);
  }
}

function formatNotification(payload: NotificationPayload): string {
  const { task_id, event_type, data } = payload;
  if (event_type === 'craftsman_completed') {
    const summary = (data as Record<string, unknown>)?.output ?? 'completed';
    return `Task **${task_id}** — craftsman finished: ${summary}`;
  }
  return `Task **${task_id}** — ${event_type}`;
}
