import { describe, expect, it, vi } from 'vitest';
import { HttpsProxyAgent } from 'https-proxy-agent';
import {
  DiscordGatewayPresenceService,
  createDiscordGatewayWebSocketProxyAgent,
  type DiscordGatewayPresenceClient,
} from './presence-service.js';

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
      since: null,
      status: 'online',
      activities: [{
        name: 'Agora',
        type: 3,
      }],
      afk: false,
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
    const clientFactory = vi.fn(() => stub.client);
    const service = new DiscordGatewayPresenceService({
      botToken: 'discord-token',
      clientFactory,
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

    expect(clientFactory).toHaveBeenCalledWith({
      enabled: true,
      httpsProxy: 'http://127.0.0.1:7897',
      httpProxy: 'http://127.0.0.1:7897',
    }, {
      since: null,
      status: 'online',
      activities: [{ name: 'Agora', type: 3 }],
      afk: false,
    });
    expect(info).toHaveBeenCalledWith('[agora] discord gateway presence proxy enabled (http://127.0.0.1:7897)');
  });

  it('creates an https proxy agent for gateway websocket connections', () => {
    const warn = vi.fn();
    const agent = createDiscordGatewayWebSocketProxyAgent({
      enabled: true,
      httpsProxy: 'http://127.0.0.1:7897',
      httpProxy: null,
    }, { warn });

    expect(agent).toBeInstanceOf(HttpsProxyAgent);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when proxy scheme is unsupported for websocket injection', () => {
    const warn = vi.fn();
    const agent = createDiscordGatewayWebSocketProxyAgent({
      enabled: true,
      httpsProxy: 'socks5://127.0.0.1:1080',
      httpProxy: null,
    }, { warn });

    expect(agent).toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[agora] discord gateway presence proxy scheme unsupported for websocket (socks5:)');
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
