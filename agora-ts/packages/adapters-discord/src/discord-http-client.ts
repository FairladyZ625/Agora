const DISCORD_API = 'https://discord.com/api/v10';

export interface DiscordClientOptions {
  botToken: string;
}

export class DiscordHttpClient {
  private readonly headers: Record<string, string>;

  constructor(options: DiscordClientOptions) {
    this.headers = {
      Authorization: `Bot ${options.botToken}`,
      'Content-Type': 'application/json',
    };
  }

  async createThread(channelId: string, name: string, message: string): Promise<string> {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/threads`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        name,
        auto_archive_duration: 1440,
        type: 11, // PUBLIC_THREAD
        message: { content: message },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Discord createThread failed: ${res.status} ${body}`);
    }
    const data = (await res.json()) as { id: string };
    return data.id;
  }

  async sendMessage(channelId: string, content: string): Promise<void> {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Discord sendMessage failed: ${res.status} ${body}`);
    }
  }
}
