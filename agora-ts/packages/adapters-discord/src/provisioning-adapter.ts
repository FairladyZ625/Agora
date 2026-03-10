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

  async provisionThread(taskId: string, taskTitle: string): Promise<string> {
    const name = `[${taskId}] ${taskTitle}`.slice(0, 100);
    const message = `Task **${taskId}** created: ${taskTitle}`;
    return this.client.createThread(this.defaultChannelId, name, message);
  }
}
