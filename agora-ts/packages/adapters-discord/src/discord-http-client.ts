import { EnvHttpProxyAgent, type Dispatcher } from 'undici';

const DISCORD_API = 'https://discord.com/api/v10';

export interface DiscordClientOptions {
  botToken: string;
}

export class DiscordHttpClient {
  private readonly headers: Record<string, string>;
  private readonly dispatcher: Dispatcher | undefined;

  constructor(options: DiscordClientOptions) {
    this.headers = {
      Authorization: `Bot ${options.botToken}`,
      'Content-Type': 'application/json',
    };
    this.dispatcher = hasProxyEnvironment() ? new EnvHttpProxyAgent() : undefined;
  }

  async createThread(channelId: string, name: string, message: string): Promise<string> {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/threads`, {
      method: 'POST',
      headers: this.headers,
      ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}),
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
      ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}),
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Discord sendMessage failed: ${res.status} ${body}`);
    }
  }
}

function hasProxyEnvironment() {
  return [
    process.env.https_proxy,
    process.env.HTTPS_PROXY,
    process.env.http_proxy,
    process.env.HTTP_PROXY,
    process.env.all_proxy,
    process.env.ALL_PROXY,
  ].some((value) => typeof value === 'string' && value.length > 0);
}
