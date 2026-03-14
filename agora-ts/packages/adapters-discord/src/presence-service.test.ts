import { describe, expect, it, vi } from 'vitest';
import { ActivityType } from 'discord.js';
import { DiscordGatewayPresenceService, type DiscordGatewayPresenceClient } from './presence-service.js';

function createClientStub() {
  const readyListeners: Array<() => void> = [];
  const errorListeners: Array<(error: Error) => void> = [];
  const setPresence = vi.fn();
  const login = vi.fn(async () => {
    for (const listener of readyListeners) {
      listener();
    }
    return 'ok';
  });
  const destroy = vi.fn();
  const client: DiscordGatewayPresenceClient = {
    user: {
      setPresence,
    },
    login,
    destroy,
    once: vi.fn((_event, listener) => {
      readyListeners.push(listener);
      return client;
    }),
    on: vi.fn((_event, listener) => {
      errorListeners.push(listener);
      return client;
    }),
  };
  return { client, login, destroy, setPresence, errorListeners };
}

describe('DiscordGatewayPresenceService', () => {
  it('logs in and sets watching presence on ready', async () => {
    const stub = createClientStub();
    const service = new DiscordGatewayPresenceService({
      botToken: 'discord-token',
      clientFactory: () => stub.client,
    });

    service.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(stub.login).toHaveBeenCalledWith('discord-token');
    expect(stub.setPresence).toHaveBeenCalledWith({
      status: 'online',
      activities: [{
        name: 'Agora',
        type: ActivityType.Watching,
      }],
    });
  });

  it('does nothing when disabled', () => {
    const stub = createClientStub();
    const service = new DiscordGatewayPresenceService({
      botToken: 'discord-token',
      enabled: false,
      clientFactory: () => stub.client,
    });

    service.start();

    expect(stub.login).not.toHaveBeenCalled();
    expect(stub.setPresence).not.toHaveBeenCalled();
  });

  it('logs proxy enablement before login when proxy bootstrap is active', async () => {
    const stub = createClientStub();
    const info = vi.fn();
    const service = new DiscordGatewayPresenceService({
      botToken: 'discord-token',
      clientFactory: () => stub.client,
      proxyBootstrap: () => ({
        enabled: true,
        httpsProxy: 'http://127.0.0.1:7897',
        httpProxy: 'http://127.0.0.1:7897',
      }),
      logger: { info },
    });

    service.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(info).toHaveBeenCalledWith('[agora] discord gateway presence proxy enabled (http://127.0.0.1:7897)');
  });

  it('destroys the client when stopped after start', () => {
    const stub = createClientStub();
    const service = new DiscordGatewayPresenceService({
      botToken: 'discord-token',
      clientFactory: () => stub.client,
    });

    service.start();
    service.stop();

    expect(stub.destroy).toHaveBeenCalled();
  });
});
