import { describe, expect, it, vi } from 'vitest';
import { DiscordHttpClient } from './discord-http-client.js';
import { DiscordIMProvisioningAdapter } from './provisioning-adapter.js';
import { DiscordIMMessagingAdapter } from './messaging-adapter.js';

describe('DiscordHttpClient', () => {
  it('uses a proxy-aware dispatcher when proxy env is configured', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'thread-proxy' }),
    });
    vi.stubGlobal('fetch', mockFetch);
    const originalHttpsProxy = process.env.https_proxy;
    process.env.https_proxy = 'http://127.0.0.1:7897';

    try {
      const client = new DiscordHttpClient({ botToken: 'test-token' });
      await client.createThread('channel-1', 'Test Thread', 'Hello');

      expect((mockFetch.mock.calls[0] as [string, { dispatcher?: unknown }])[1].dispatcher).toBeDefined();
    } finally {
      if (originalHttpsProxy === undefined) {
        delete process.env.https_proxy;
      } else {
        process.env.https_proxy = originalHttpsProxy;
      }
      vi.unstubAllGlobals();
    }
  });

  it('createThread calls Discord API and returns thread id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'thread-123' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new DiscordHttpClient({ botToken: 'test-token' });
    const threadId = await client.createThread('channel-1', 'Test Thread', 'Hello');

    expect(threadId).toBe('thread-123');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/channels/channel-1/threads',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bot test-token' }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it('createThread throws on non-ok response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Missing Permissions',
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new DiscordHttpClient({ botToken: 'bad-token' });
    await expect(client.createThread('ch', 'name', 'msg')).rejects.toThrow('403');

    vi.unstubAllGlobals();
  });

  it('sendMessage calls Discord API', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', mockFetch);

    const client = new DiscordHttpClient({ botToken: 'tok' });
    await client.sendMessage('thread-abc', 'Hello world');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/channels/thread-abc/messages',
      expect.objectContaining({ method: 'POST' }),
    );

    vi.unstubAllGlobals();
  });
});

describe('DiscordIMProvisioningAdapter', () => {
  it('provisionThread creates a thread and returns provider-neutral binding refs', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'new-thread-456' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const adapter = new DiscordIMProvisioningAdapter({
      botToken: 'tok',
      defaultChannelId: 'chan-1',
    });
    const result = await adapter.provisionThread('OC-1', 'My Task');

    expect(result).toEqual({
      im_provider: 'discord',
      conversation_ref: 'chan-1',
      thread_ref: 'new-thread-456',
      message_root_ref: null,
    });
    vi.unstubAllGlobals();
  });
});

describe('DiscordIMMessagingAdapter', () => {
  it('sendNotification formats and sends a message', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', mockFetch);

    const adapter = new DiscordIMMessagingAdapter({ botToken: 'tok' });
    await adapter.sendNotification('thread-xyz', {
      task_id: 'OC-1',
      event_type: 'craftsman_completed',
      data: { output: 'all done' },
    });

    const body = JSON.parse((mockFetch.mock.calls[0] as [string, { body: string }])[1].body) as { content: string };
    expect(body.content).toContain('OC-1');
    expect(body.content).toContain('all done');

    vi.unstubAllGlobals();
  });
});
