import { describe, expect, it, vi } from 'vitest';
import {
  DiscordGatewayThreadIngressService,
  type DiscordGatewayThreadIngressClient,
} from './thread-ingress-service.js';

function createClientStub() {
  const readyListeners: Array<() => void> = [];
  const errorListeners: Array<(error: Error) => void> = [];
  const messageListeners: Array<(payload: { id: string; channel_id: string; timestamp: string; content?: string; author?: { id?: string; username?: string; global_name?: string | null; bot?: boolean } }) => void> = [];

  const login = vi.fn(async () => {
    for (const listener of readyListeners) {
      listener();
    }
    return 'ok';
  });
  const destroy = vi.fn();

  const client: DiscordGatewayThreadIngressClient = {
    login,
    destroy,
    once: vi.fn((_event, listener) => {
      readyListeners.push(listener);
      return client;
    }),
    on: vi.fn((event, listener) => {
      if (event === 'error') {
        errorListeners.push(listener as (error: Error) => void);
      }
      if (event === 'messageCreate') {
        messageListeners.push(listener as (payload: { id: string; channel_id: string; timestamp: string; content?: string; author?: { id?: string; username?: string; global_name?: string | null; bot?: boolean } }) => void);
      }
      return client;
    }),
  };
  return { client, login, destroy, errorListeners, messageListeners };
}

describe('DiscordGatewayThreadIngressService', () => {
  it('ingests human messages for Agora-managed task threads', async () => {
    const stub = createClientStub();
    const ingest = vi.fn();
    const service = new DiscordGatewayThreadIngressService({
      botToken: 'discord-token',
      clientFactory: () => stub.client,
      taskContextBindingService: {
        findLatestBindingByRefs: ({ thread_ref }) => thread_ref === 'thread-1'
          ? {
              id: 'binding-1',
              task_id: 'OC-THREAD-1',
              im_provider: 'discord',
              conversation_ref: 'forum-1',
              thread_ref: 'thread-1',
              message_root_ref: null,
              status: 'active',
              created_at: '2026-04-14T08:00:00.000Z',
              closed_at: null,
            }
          : null,
      },
      taskInboundService: { ingest },
    });

    service.start();
    await Promise.resolve();
    await Promise.resolve();

    stub.messageListeners[0]?.({
      id: 'msg-1',
      channel_id: 'thread-1',
      timestamp: '2026-04-14T08:30:00.000Z',
      content: '@agora-codex-immediate hello',
      author: {
        id: 'user-1',
        username: 'tester',
        global_name: 'Tester',
        bot: false,
      },
    });

    expect(ingest).toHaveBeenCalledWith({
      provider: 'discord',
      conversation_ref: 'forum-1',
      thread_ref: 'thread-1',
      provider_message_ref: 'msg-1',
      parent_message_ref: null,
      direction: 'inbound',
      author_kind: 'human',
      author_ref: 'user-1',
      display_name: 'Tester',
      body: '@agora-codex-immediate hello',
      occurred_at: '2026-04-14T08:30:00.000Z',
      metadata: {
        event_type: 'discord_message_create',
      },
    });
  });

  it('passes resolved explicit mention aliases through metadata for Discord native mentions', async () => {
    const stub = createClientStub();
    const ingest = vi.fn();
    const service = new DiscordGatewayThreadIngressService({
      botToken: 'discord-token',
      clientFactory: () => stub.client,
      mentionResolver: ({ body }) => body.includes('<@1491781344664227942>') ? ['agora-codex-immediate'] : [],
      taskContextBindingService: {
        findLatestBindingByRefs: () => ({
          id: 'binding-1',
          task_id: 'OC-THREAD-1',
          im_provider: 'discord',
          conversation_ref: 'forum-1',
          thread_ref: 'thread-1',
          message_root_ref: null,
          status: 'active',
          created_at: '2026-04-14T08:00:00.000Z',
          closed_at: null,
        }),
      },
      taskInboundService: { ingest },
    });

    service.start();
    await Promise.resolve();
    await Promise.resolve();

    stub.messageListeners[0]?.({
      id: 'msg-2',
      channel_id: 'thread-1',
      timestamp: '2026-04-14T08:31:00.000Z',
      content: '<@1491781344664227942> hello',
      author: {
        id: 'user-1',
        username: 'tester',
        global_name: 'Tester',
        bot: false,
      },
    });

    expect(ingest).toHaveBeenCalledWith(expect.objectContaining({
      body: '<@1491781344664227942> hello',
      metadata: {
        event_type: 'discord_message_create',
        explicit_mentions: ['agora-codex-immediate'],
      },
    }));
  });

  it('ignores bot messages and unmanaged threads', async () => {
    const stub = createClientStub();
    const ingest = vi.fn();
    const service = new DiscordGatewayThreadIngressService({
      botToken: 'discord-token',
      clientFactory: () => stub.client,
      taskContextBindingService: {
        findLatestBindingByRefs: () => null,
      },
      taskInboundService: { ingest },
    });

    service.start();
    await Promise.resolve();
    await Promise.resolve();

    stub.messageListeners[0]?.({
      id: 'msg-bot',
      channel_id: 'thread-1',
      timestamp: '2026-04-14T08:30:00.000Z',
      content: 'ignore me',
      author: {
        id: 'bot-1',
        username: 'Agora',
        bot: true,
      },
    });
    stub.messageListeners[0]?.({
      id: 'msg-user',
      channel_id: 'thread-missing',
      timestamp: '2026-04-14T08:30:01.000Z',
      content: '@agora-codex-immediate hello',
      author: {
        id: 'user-1',
        username: 'tester',
        bot: false,
      },
    });

    expect(ingest).not.toHaveBeenCalled();
  });
});
