import { EnvHttpProxyAgent, type Dispatcher } from 'undici';
import { resolveDiscordProxyEnvironment } from './proxy-support.js';

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
    const proxy = resolveDiscordProxyEnvironment();
    this.dispatcher = proxy.enabled
      ? new EnvHttpProxyAgent({
          ...(proxy.httpProxy ? { httpProxy: proxy.httpProxy } : {}),
          ...(proxy.httpsProxy ? { httpsProxy: proxy.httpsProxy } : {}),
          ...(proxy.noProxy ? { noProxy: proxy.noProxy } : {}),
        })
      : undefined;
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

  async removeThreadMember(threadId: string, userId: string): Promise<void> {
    const res = await fetch(`${DISCORD_API}/channels/${threadId}/thread-members/${userId}`, {
      method: 'DELETE',
      headers: this.headers,
      ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Discord removeThreadMember failed: ${res.status} ${body}`);
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

  async archiveThread(threadId: string): Promise<void> {
    const res = await fetch(`${DISCORD_API}/channels/${threadId}`, {
      method: 'PATCH',
      headers: this.headers,
      ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}),
      body: JSON.stringify({
        archived: true,
        locked: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Discord archiveThread failed: ${res.status} ${body}`);
    }
  }

  async unarchiveThread(threadId: string): Promise<void> {
    const res = await fetch(`${DISCORD_API}/channels/${threadId}`, {
      method: 'PATCH',
      headers: this.headers,
      ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}),
      body: JSON.stringify({
        archived: false,
        locked: false,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Discord unarchiveThread failed: ${res.status} ${body}`);
    }
  }

  async deleteChannel(channelId: string): Promise<void> {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}`, {
      method: 'DELETE',
      headers: this.headers,
      ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Discord deleteChannel failed: ${res.status} ${body}`);
    }
  }
}
