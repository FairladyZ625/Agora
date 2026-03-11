import { EnvHttpProxyAgent, type Dispatcher } from 'undici';

const DISCORD_API = 'https://discord.com/api/v10';

export interface DiscordClientOptions {
  botToken: string;
}

export interface DiscordCurrentUser {
  id: string;
  username?: string;
}

export interface DiscordThreadMember {
  user_id?: string;
  id?: string;
  user?: {
    id?: string;
  };
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

  async createThread(channelId: string, name: string, message: string, visibility: 'public' | 'private' = 'public'): Promise<string> {
    const body = visibility === 'private'
      ? {
          name,
          auto_archive_duration: 1440,
          type: 12,
          invitable: false,
        }
      : {
          name,
          auto_archive_duration: 1440,
          type: 11,
          message: { content: message },
        };
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/threads`, {
      method: 'POST',
      headers: this.headers,
      ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}),
      body: JSON.stringify(body),
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

  async joinThread(threadId: string): Promise<void> {
    const res = await fetch(`${DISCORD_API}/channels/${threadId}/thread-members/@me`, {
      method: 'PUT',
      headers: this.headers,
      ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Discord joinThread failed: ${res.status} ${body}`);
    }
  }

  async addThreadMember(threadId: string, userId: string): Promise<void> {
    const res = await fetch(`${DISCORD_API}/channels/${threadId}/thread-members/${userId}`, {
      method: 'PUT',
      headers: this.headers,
      ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Discord addThreadMember failed: ${res.status} ${body}`);
    }
  }

  async listThreadMembers(threadId: string): Promise<DiscordThreadMember[]> {
    const res = await fetch(`${DISCORD_API}/channels/${threadId}/thread-members`, {
      method: 'GET',
      headers: this.headers,
      ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Discord listThreadMembers failed: ${res.status} ${body}`);
    }
    return (await res.json()) as DiscordThreadMember[];
  }

  async getCurrentUser(): Promise<DiscordCurrentUser> {
    const res = await fetch(`${DISCORD_API}/users/@me`, {
      method: 'GET',
      headers: this.headers,
      ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Discord getCurrentUser failed: ${res.status} ${body}`);
    }
    return (await res.json()) as DiscordCurrentUser;
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
