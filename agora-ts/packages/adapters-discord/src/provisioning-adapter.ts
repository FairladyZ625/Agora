import type { IMProvisioningPort } from '@agora-ts/core';
import { DiscordHttpClient } from './discord-http-client.js';

export interface DiscordIMProvisioningAdapterOptions {
  botToken: string;
  defaultChannelId: string;
}

export class DiscordIMProvisioningAdapter implements IMProvisioningPort {
  private readonly client: DiscordHttpClient;
  private readonly defaultChannelId: string;

  constructor(options: DiscordIMProvisioningAdapterOptions) {
    this.client = new DiscordHttpClient({ botToken: options.botToken });
    this.defaultChannelId = options.defaultChannelId;
  }

  async provisionThread(taskId: string, taskTitle: string): Promise<{
    im_provider: string;
    conversation_ref: string;
    thread_ref: string;
    message_root_ref: null;
  }> {
    const name = `[${taskId}] ${taskTitle}`.slice(0, 100);
    const message = `Task **${taskId}** created: ${taskTitle}`;
    const threadRef = await this.client.createThread(this.defaultChannelId, name, message);
    return {
      im_provider: 'discord',
      conversation_ref: this.defaultChannelId,
      thread_ref: threadRef,
      message_root_ref: null,
    };
  }
}
