import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { WebSocket, type RawData } from 'ws';
import {
  DiscordGatewayPresenceService,
  MinimalDiscordGatewayPresenceClient,
  createDiscordGatewayWebSocketProxyAgent,
  extractHeartbeatInterval,
  parseGatewayPayload,
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

function createRejectingClientStub(error: Error) {
  const client = {} as DiscordGatewayPresenceClient;
  client.user = null;
  client.login = vi.fn(async () => {
    throw error;
  });
  client.destroy = vi.fn();
  client.once = vi.fn(() => client);
  client.on = vi.fn(() => client);
  return {
    client,
    login: client.login,
    destroy: client.destroy,
  };
}

function createWebSocketStub() {
  const socket = new EventEmitter() as EventEmitter & {
    readyState: number;
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  socket.readyState = WebSocket.OPEN;
  socket.send = vi.fn();
  socket.close = vi.fn(() => {
    socket.emit('close', 1000);
  });
  return socket;
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

  it('reconnects after an initial login failure and eventually restores presence', async () => {
    vi.useFakeTimers();
    const first = createRejectingClientStub(new Error('discord gateway requested reconnect before presence became ready'));
    const second = createClientStub();
    const clientFactory = vi
      .fn<() => DiscordGatewayPresenceClient>()
      .mockReturnValueOnce(first.client)
      .mockReturnValueOnce(second.client);
    const warn = vi.fn();
    const service = new DiscordGatewayPresenceService({
      botToken: 'discord-token',
      clientFactory,
      reconnectDelayMs: 5,
      logger: { warn },
    });

    service.start();
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5);
    await Promise.resolve();
    await Promise.resolve();

    expect(clientFactory).toHaveBeenCalledTimes(2);
    expect(first.client.destroy).toHaveBeenCalled();
    expect(second.setPresence).toHaveBeenCalledWith({
      since: null,
      status: 'online',
      activities: [{
        name: 'Agora',
        type: 3,
      }],
      afk: false,
    });
    expect(warn).toHaveBeenCalledWith('[agora] discord gateway presence reconnect scheduled in 5ms');

    service.stop();
    vi.useRealTimers();
  });

  it('parses gateway payloads from all supported raw-data forms', () => {
    const payload = { op: 10, d: { heartbeat_interval: 1000 } };
    const text = JSON.stringify(payload);

    expect(parseGatewayPayload(text as unknown as RawData)).toEqual(payload);
    expect(parseGatewayPayload(Buffer.from(text, 'utf8') as RawData)).toEqual(payload);
    expect(parseGatewayPayload([Buffer.from(text, 'utf8')] as unknown as RawData)).toEqual(payload);
    expect(parseGatewayPayload(new TextEncoder().encode(text).buffer as RawData)).toEqual(payload);
  });

  it('extracts heartbeat intervals and rejects malformed hello payloads', () => {
    expect(extractHeartbeatInterval({ heartbeat_interval: 5000 })).toBe(5000);
    expect(() => extractHeartbeatInterval({})).toThrow('heartbeat_interval');
  });

  it('completes the minimal gateway ready handshake and sends presence updates', async () => {
    vi.useFakeTimers();
    const socket = createWebSocketStub();
    const client = new MinimalDiscordGatewayPresenceClient({
      proxy: { enabled: false, httpsProxy: null, httpProxy: null },
      logger: {},
      initialPresence: {
        since: null,
        status: 'online',
        activities: [{ name: 'Agora', type: 3 }],
        afk: false,
      },
      webSocketFactory: () => socket as never,
    });

    const ready = client.login('discord-token');
    socket.emit('message', JSON.stringify({ op: 10, d: { heartbeat_interval: 25 } }));
    socket.emit('message', JSON.stringify({ op: 0, t: 'READY', s: 7, d: {} }));

    await expect(ready).resolves.toBe('discord-token');
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"op":2'));

    await client.user?.setPresence({
      since: null,
      status: 'idle',
      activities: [],
      afk: false,
    });
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"op":3'));

    await vi.advanceTimersByTimeAsync(25);
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"op":1'));
    client.destroy();
    vi.useRealTimers();
  });

  it('rejects login when the gateway requests reconnect before readiness', async () => {
    const socket = createWebSocketStub();
    const client = new MinimalDiscordGatewayPresenceClient({
      proxy: { enabled: false, httpsProxy: null, httpProxy: null },
      logger: {},
      initialPresence: {
        since: null,
        status: 'online',
        activities: [],
        afk: false,
      },
      webSocketFactory: () => socket as never,
    });
    client.on('error', () => {});

    const ready = client.login('discord-token');
    socket.emit('message', JSON.stringify({ op: 10, d: { heartbeat_interval: 25 } }));
    socket.emit('message', JSON.stringify({ op: 7 }));

    await expect(ready).rejects.toThrow('requested reconnect');
  });

  it('emits an after-ready reconnect error when the gateway requests reconnect after readiness', async () => {
    const socket = createWebSocketStub();
    const client = new MinimalDiscordGatewayPresenceClient({
      proxy: { enabled: false, httpsProxy: null, httpProxy: null },
      logger: {},
      initialPresence: {
        since: null,
        status: 'online',
        activities: [],
        afk: false,
      },
      webSocketFactory: () => socket as never,
    });
    const onError = vi.fn();
    client.on('error', onError);

    const ready = client.login('discord-token');
    socket.emit('message', JSON.stringify({ op: 10, d: { heartbeat_interval: 25 } }));
    socket.emit('message', JSON.stringify({ op: 0, t: 'READY', s: 7, d: {} }));
    await expect(ready).resolves.toBe('discord-token');

    socket.emit('message', JSON.stringify({ op: 7 }));

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: 'discord gateway requested reconnect after presence became ready',
    }));
  });
});
