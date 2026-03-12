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

  it('joinThread calls Discord API for the current account', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', mockFetch);

    const client = new DiscordHttpClient({ botToken: 'tok' });
    await client.joinThread('thread-join-1');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/channels/thread-join-1/thread-members/@me',
      expect.objectContaining({ method: 'PUT' }),
    );

    vi.unstubAllGlobals();
  });

  it('addThreadMember calls Discord API for another user', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', mockFetch);

    const client = new DiscordHttpClient({ botToken: 'tok' });
    await client.addThreadMember('thread-add-1', 'user-42');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/channels/thread-add-1/thread-members/user-42',
      expect.objectContaining({ method: 'PUT' }),
    );

    vi.unstubAllGlobals();
  });

  it('removeThreadMember calls Discord API for another user', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', mockFetch);

    const client = new DiscordHttpClient({ botToken: 'tok' });
    await client.removeThreadMember('thread-remove-1', 'user-42');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/channels/thread-remove-1/thread-members/user-42',
      expect.objectContaining({ method: 'DELETE' }),
    );

    vi.unstubAllGlobals();
  });

  it('getCurrentUser resolves the current bot user id', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'bot-user-7', username: 'agora-bot' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = new DiscordHttpClient({ botToken: 'tok' });
    await expect(client.getCurrentUser()).resolves.toEqual({
      id: 'bot-user-7',
      username: 'agora-bot',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/users/@me',
      expect.objectContaining({ method: 'GET' }),
    );

    vi.unstubAllGlobals();
  });

  it('archiveThread patches the channel as archived and locked', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', mockFetch);

    const client = new DiscordHttpClient({ botToken: 'tok' });
    await client.archiveThread('thread-archive-1');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/channels/thread-archive-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ archived: true, locked: true }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it('deleteChannel calls Discord delete API', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', mockFetch);

    const client = new DiscordHttpClient({ botToken: 'tok' });
    await client.deleteChannel('thread-delete-1');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/channels/thread-delete-1',
      expect.objectContaining({ method: 'DELETE' }),
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
    const result = await adapter.provisionContext({
      task_id: 'OC-1',
      title: 'My Task',
    });

    expect(result).toEqual({
      im_provider: 'discord',
      conversation_ref: 'chan-1',
      thread_ref: 'new-thread-456',
      message_root_ref: null,
    });
    vi.unstubAllGlobals();
  });

  it('provisionContext honors conversation target and private visibility', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'private-thread-789' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });
    vi.stubGlobal('fetch', mockFetch);

    const adapter = new DiscordIMProvisioningAdapter({
      botToken: 'tok',
      defaultChannelId: 'chan-default',
    });
    const result = await adapter.provisionContext({
      task_id: 'OC-2',
      title: 'Private Task',
      target: {
        provider: 'discord',
        conversation_ref: 'chan-private',
        visibility: 'private',
      },
    });

    const body = JSON.parse((mockFetch.mock.calls[0] as [string, { body: string }])[1].body) as { type: number; message?: unknown; invitable?: boolean };
    expect(body.type).toBe(12);
    expect(body.message).toBeUndefined();
    expect(body.invitable).toBe(false);
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://discord.com/api/v10/channels/private-thread-789/messages',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.conversation_ref).toBe('chan-private');
    expect(result.thread_ref).toBe('private-thread-789');

    vi.unstubAllGlobals();
  });

  it('joinParticipant uses the Agora bot to add the participant account to the thread', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'discord-user-sonnet', username: 'sonnet' }),
      })
      .mockResolvedValueOnce({ ok: true, text: async () => '' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([{ user_id: 'discord-user-sonnet' }]),
      });
    vi.stubGlobal('fetch', mockFetch);

    const adapter = new DiscordIMProvisioningAdapter({
      botToken: 'main-token',
      defaultChannelId: 'chan-default',
      primaryAccountId: 'main',
      participantTokens: {
        main: 'main-token',
        sonnet: 'token-sonnet',
      },
    });

    const result = await adapter.joinParticipant({
      binding_id: 'bind-1',
      participant_ref: 'sonnet',
      thread_ref: 'thread-join-2',
    });

    expect(result).toEqual({ status: 'joined', detail: null });
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'https://discord.com/api/v10/users/@me',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bot token-sonnet' }),
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://discord.com/api/v10/channels/thread-join-2/thread-members/discord-user-sonnet',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ Authorization: 'Bot main-token' }),
      }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      'https://discord.com/api/v10/channels/thread-join-2/thread-members',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bot main-token' }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it('joinParticipant ignores the primary provisioning account', async () => {
    const adapter = new DiscordIMProvisioningAdapter({
      botToken: 'main-token',
      defaultChannelId: 'chan-default',
      primaryAccountId: 'main',
      participantTokens: {
        main: 'main-token',
      },
    });

    await expect(adapter.joinParticipant({
      binding_id: 'bind-1',
      participant_ref: 'main',
      thread_ref: 'thread-join-3',
    })).resolves.toEqual({
      status: 'ignored',
      detail: 'primary provisioning account already owns the thread',
    });
  });

  it('joinParticipant accepts a raw discord user id for human participants', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, text: async () => '' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([{ user_id: '530383608410800138' }]),
      });
    vi.stubGlobal('fetch', mockFetch);

    const adapter = new DiscordIMProvisioningAdapter({
      botToken: 'main-token',
      defaultChannelId: 'chan-default',
      participantTokens: {},
    });

    const result = await adapter.joinParticipant({
      binding_id: 'bind-raw-1',
      participant_ref: '530383608410800138',
      thread_ref: 'thread-join-human',
    });

    expect(result).toEqual({ status: 'joined', detail: null });
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'https://discord.com/api/v10/channels/thread-join-human/thread-members/530383608410800138',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ Authorization: 'Bot main-token' }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it('removeParticipant removes a joined participant through the Agora bot', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'discord-user-sonnet', username: 'sonnet' }),
      })
      .mockResolvedValueOnce({ ok: true, text: async () => '' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([{ user_id: 'someone-else' }]),
      });
    vi.stubGlobal('fetch', mockFetch);

    const adapter = new DiscordIMProvisioningAdapter({
      botToken: 'main-token',
      defaultChannelId: 'chan-default',
      primaryAccountId: 'main',
      participantTokens: {
        sonnet: 'token-sonnet',
      },
    });

    const result = await adapter.removeParticipant({
      binding_id: 'bind-rm-1',
      participant_ref: 'sonnet',
      thread_ref: 'thread-rm-1',
    });

    expect(result).toEqual({ status: 'removed', detail: null });
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://discord.com/api/v10/channels/thread-rm-1/thread-members/discord-user-sonnet',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ Authorization: 'Bot main-token' }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it('archiveContext archives the bound thread by default', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', mockFetch);

    const adapter = new DiscordIMProvisioningAdapter({
      botToken: 'main-token',
      defaultChannelId: 'chan-default',
    });

    await adapter.archiveContext({
      binding_id: 'bind-archive-1',
      thread_ref: 'thread-archive-2',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/channels/thread-archive-2',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ archived: true, locked: true }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it('archiveContext deletes the bound thread when mode=delete', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', mockFetch);

    const adapter = new DiscordIMProvisioningAdapter({
      botToken: 'main-token',
      defaultChannelId: 'chan-default',
    });

    await adapter.archiveContext({
      binding_id: 'bind-delete-1',
      thread_ref: 'thread-delete-2',
      mode: 'delete',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/channels/thread-delete-2',
      expect.objectContaining({ method: 'DELETE' }),
    );

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
