import { EventEmitter } from 'node:events';
import type { Agent } from 'node:http';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { WebSocket, type ClientOptions, type RawData } from 'ws';
import type { TaskContextBindingService, TaskInboundService } from '@agora-ts/core';
import { resolveDiscordProxyEnvironment, sanitizeProxyForLogs } from './proxy-support.js';
import { extractHeartbeatInterval, parseGatewayPayload } from './presence-service.js';

const DISCORD_GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';
const DISCORD_GATEWAY_GUILDS_INTENT = 1;
const DISCORD_GATEWAY_GUILD_MESSAGES_INTENT = 1 << 9;
const DISCORD_GATEWAY_MESSAGE_CONTENT_INTENT = 1 << 15;

export interface DiscordGatewayThreadIngressServiceOptions {
  botToken: string;
  enabled?: boolean;
  reconnectDelayMs?: number;
  proxyBootstrap?: () => {
    enabled: boolean;
    httpsProxy: string | null;
    httpProxy: string | null;
  };
  clientFactory?: (proxy: {
    enabled: boolean;
    httpsProxy: string | null;
    httpProxy: string | null;
  }) => DiscordGatewayThreadIngressClient;
  logger?: {
    info?: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string, error?: unknown) => void;
  };
  mentionResolver?: (input: {
    task_id: string;
    provider: 'discord';
    thread_ref: string;
    body: string;
    author_ref: string | null;
  }) => string[];
  taskContextBindingService: Pick<TaskContextBindingService, 'findLatestBindingByRefs'>;
  taskInboundService: Pick<TaskInboundService, 'ingest'>;
}

export interface DiscordGatewayThreadIngressClient {
  login(token: string): Promise<string>;
  destroy(): void;
  once(event: 'ready', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'messageCreate', listener: (payload: DiscordGatewayMessageCreatePayload) => void): this;
}

export interface DiscordGatewayMessageCreatePayload {
  id: string;
  channel_id: string;
  content?: string;
  timestamp: string;
  author?: {
    id?: string;
    username?: string;
    global_name?: string | null;
    bot?: boolean;
  };
  referenced_message?: {
    id?: string;
  } | null;
}

type GatewayPayload = {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
};

type GatewayWebSocketFactory = (proxy: {
  enabled: boolean;
  httpsProxy: string | null;
  httpProxy: string | null;
}, logger: NonNullable<DiscordGatewayThreadIngressServiceOptions['logger']>) => WebSocket;

function createDiscordGatewayWebSocketProxyAgent(proxy: {
  enabled: boolean;
  httpsProxy: string | null;
  httpProxy: string | null;
}, logger: NonNullable<DiscordGatewayThreadIngressServiceOptions['logger']>): Agent | undefined {
  const proxyUrl = proxy.httpsProxy ?? proxy.httpProxy;
  if (!proxy.enabled || !proxyUrl) {
    return undefined;
  }

  let protocol: string;
  try {
    protocol = new URL(proxyUrl).protocol;
  } catch {
    logger.warn?.('[agora] discord thread ingress proxy url is invalid; websocket proxy agent disabled');
    return undefined;
  }

  if (protocol !== 'http:' && protocol !== 'https:') {
    logger.warn?.(`[agora] discord thread ingress proxy scheme unsupported for websocket (${protocol})`);
    return undefined;
  }

  return new HttpsProxyAgent(proxyUrl);
}

function createDiscordGatewayWebSocket(
  proxy: { enabled: boolean; httpsProxy: string | null; httpProxy: string | null },
  logger: NonNullable<DiscordGatewayThreadIngressServiceOptions['logger']>,
) {
  const gatewayUrl = new URL(DISCORD_GATEWAY_URL);
  const agent = createDiscordGatewayWebSocketProxyAgent(proxy, logger);
  const options = (agent
    ? {
        agent,
        host: gatewayUrl.hostname,
        port: gatewayUrl.port ? Number(gatewayUrl.port) : 443,
        handshakeTimeout: 15_000,
      }
    : {
        handshakeTimeout: 15_000,
      }) as ClientOptions;
  return new WebSocket(DISCORD_GATEWAY_URL, [], options);
}

export class MinimalDiscordGatewayThreadIngressClient extends EventEmitter implements DiscordGatewayThreadIngressClient {
  private readonly proxy: {
    enabled: boolean;
    httpsProxy: string | null;
    httpProxy: string | null;
  };

  private readonly logger: NonNullable<DiscordGatewayThreadIngressServiceOptions['logger']>;
  private readonly webSocketFactory: GatewayWebSocketFactory;
  private socket: WebSocket | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private sequence: number | null = null;
  private ready = false;
  private destroying = false;

  constructor(options: {
    proxy: {
      enabled: boolean;
      httpsProxy: string | null;
      httpProxy: string | null;
    };
    logger: NonNullable<DiscordGatewayThreadIngressServiceOptions['logger']>;
    webSocketFactory?: GatewayWebSocketFactory;
  }) {
    super();
    this.proxy = options.proxy;
    this.logger = options.logger;
    this.webSocketFactory = options.webSocketFactory ?? createDiscordGatewayWebSocket;
  }

  login(token: string): Promise<string> {
    this.destroy();
    this.destroying = false;

    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
        this.emit('error', error);
      };

      const socket = this.webSocketFactory(this.proxy, this.logger);
      this.socket = socket;

      socket.on('message', (data) => {
        try {
          this.handleGatewayMessage(data, token, () => {
            if (!settled) {
              settled = true;
              resolve(token);
            }
          });
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      });

      socket.on('error', (error) => {
        fail(error instanceof Error ? error : new Error(String(error)));
      });

      socket.on('close', (code) => {
        this.clearHeartbeat();
        this.socket = null;
        const wasReady = this.ready;
        this.ready = false;
        const intentional = this.destroying;
        this.destroying = false;
        if (!settled) {
          settled = true;
          reject(new Error(`discord gateway closed before ready (${code})`));
          return;
        }
        if (wasReady && !intentional) {
          this.emit('error', new Error(`discord gateway closed after ingress became ready (${code})`));
        }
      });
    });
  }

  destroy() {
    this.clearHeartbeat();
    this.ready = false;
    if (this.socket) {
      this.destroying = true;
      try {
        this.socket.close();
      } finally {
        this.socket = null;
      }
    }
  }

  private handleGatewayMessage(data: RawData, token: string, resolveReady: () => void) {
    const payload = parseGatewayPayload(data) as GatewayPayload;
    if (typeof payload.s === 'number') {
      this.sequence = payload.s;
    }

    switch (payload.op) {
      case 10: {
        const heartbeatInterval = extractHeartbeatInterval(payload.d);
        this.startHeartbeat(heartbeatInterval);
        this.sendPayload({
          op: 2,
          d: {
            token,
            intents: DISCORD_GATEWAY_GUILDS_INTENT | DISCORD_GATEWAY_GUILD_MESSAGES_INTENT | DISCORD_GATEWAY_MESSAGE_CONTENT_INTENT,
            properties: {
              os: process.platform,
              browser: 'agora-thread-ingress',
              device: 'agora-thread-ingress',
            },
          },
        });
        break;
      }
      case 1:
        this.sendHeartbeat();
        break;
      case 7:
        throw new Error(`discord gateway requested reconnect ${this.ready ? 'after' : 'before'} ingress became ready`);
      case 9:
        throw new Error(`discord gateway invalidated session ${this.ready ? 'after' : 'before'} ingress became ready`);
      case 0:
        if (payload.t === 'READY') {
          this.ready = true;
          this.emit('ready');
          resolveReady();
          break;
        }
        if (payload.t === 'MESSAGE_CREATE') {
          const message = parseMessageCreatePayload(payload.d);
          if (message) {
            this.emit('messageCreate', message);
          }
        }
        break;
      default:
        break;
    }
  }

  private startHeartbeat(intervalMs: number) {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, intervalMs);
    this.heartbeatTimer.unref?.();
  }

  private clearHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private sendHeartbeat() {
    this.sendPayload({
      op: 1,
      d: this.sequence,
    });
  }

  private sendPayload(payload: GatewayPayload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('discord gateway websocket is not open');
    }
    this.socket.send(JSON.stringify(payload));
  }
}

export class DiscordGatewayThreadIngressService {
  readonly enabled: boolean;

  private readonly botToken: string;
  private readonly proxyBootstrap: NonNullable<DiscordGatewayThreadIngressServiceOptions['proxyBootstrap']>;
  private readonly clientFactory: NonNullable<DiscordGatewayThreadIngressServiceOptions['clientFactory']>;
  private readonly logger: NonNullable<DiscordGatewayThreadIngressServiceOptions['logger']>;
  private readonly reconnectDelayMs: number;
  private readonly taskContextBindingService: Pick<TaskContextBindingService, 'findLatestBindingByRefs'>;
  private readonly taskInboundService: Pick<TaskInboundService, 'ingest'>;
  private readonly mentionResolver: NonNullable<DiscordGatewayThreadIngressServiceOptions['mentionResolver']>;
  private client: DiscordGatewayThreadIngressClient | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private started = false;

  constructor(options: DiscordGatewayThreadIngressServiceOptions) {
    this.botToken = options.botToken;
    this.enabled = options.enabled ?? true;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1_000;
    this.proxyBootstrap = options.proxyBootstrap ?? (() => {
      const resolved = resolveDiscordProxyEnvironment();
      return {
        enabled: resolved.enabled,
        httpsProxy: resolved.httpsProxy,
        httpProxy: resolved.httpProxy,
      };
    });
    this.clientFactory = options.clientFactory ?? ((proxy) => new MinimalDiscordGatewayThreadIngressClient({
      proxy,
      logger: this.logger,
    }));
    this.logger = options.logger ?? {};
    this.taskContextBindingService = options.taskContextBindingService;
    this.taskInboundService = options.taskInboundService;
    this.mentionResolver = options.mentionResolver ?? (() => []);
  }

  start() {
    if (!this.enabled || this.started) {
      return;
    }
    this.started = true;
    this.connect();
  }

  stop() {
    if (!this.started) {
      return;
    }
    this.started = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.client?.destroy();
    this.client = null;
  }

  private connect() {
    const proxy = this.proxyBootstrap();
    if (proxy.enabled) {
      const proxyTarget = sanitizeProxyForLogs(proxy.httpsProxy ?? proxy.httpProxy);
      this.logger.info?.(`[agora] discord thread ingress proxy enabled${proxyTarget ? ` (${proxyTarget})` : ''}`);
    }

    this.client = this.clientFactory(proxy);
    const client = this.client;

    client.once('ready', () => {
      this.logger.info?.('[agora] discord thread ingress online');
    });

    client.on('messageCreate', (payload) => {
      this.handleMessageCreate(payload);
    });

    client.on('error', (error) => {
      if (this.client !== client || !this.started) {
        return;
      }
      this.logger.error?.('[agora] discord thread ingress client error', error);
      this.scheduleReconnect(client);
    });

    void client.login(this.botToken).catch((error) => {
      if (this.client !== client || !this.started) {
        return;
      }
      this.logger.error?.('[agora] discord thread ingress login failed', error);
      this.scheduleReconnect(client);
    });
  }

  private handleMessageCreate(payload: DiscordGatewayMessageCreatePayload) {
    if (payload.author?.bot) {
      return;
    }
    const body = payload.content?.trim() ?? '';
    if (!body) {
      return;
    }
    const binding = this.taskContextBindingService.findLatestBindingByRefs({
      provider: 'discord',
      thread_ref: payload.channel_id,
      conversation_ref: null,
    });
    if (!binding) {
      return;
    }
    const explicitMentions = this.mentionResolver({
      task_id: binding.task_id,
      provider: 'discord',
      thread_ref: payload.channel_id,
      body,
      author_ref: payload.author?.id ?? null,
    });
    this.taskInboundService.ingest({
      provider: 'discord',
      conversation_ref: binding.conversation_ref,
      thread_ref: payload.channel_id,
      provider_message_ref: payload.id,
      parent_message_ref: payload.referenced_message?.id ?? null,
      direction: 'inbound',
      author_kind: 'human',
      author_ref: payload.author?.id ?? null,
      display_name: payload.author?.global_name ?? payload.author?.username ?? null,
      body,
      occurred_at: payload.timestamp,
      metadata: {
        event_type: 'discord_message_create',
        ...(explicitMentions.length > 0 ? { explicit_mentions: explicitMentions } : {}),
      },
    });
  }

  private scheduleReconnect(client: DiscordGatewayThreadIngressClient) {
    if (!this.started || this.client !== client || this.reconnectTimer) {
      return;
    }
    this.client?.destroy();
    this.client = null;
    this.logger.warn?.(`[agora] discord thread ingress reconnect scheduled in ${this.reconnectDelayMs}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.started) {
        return;
      }
      this.connect();
    }, this.reconnectDelayMs);
    this.reconnectTimer.unref?.();
  }
}

function parseMessageCreatePayload(payload: unknown): DiscordGatewayMessageCreatePayload | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const value = payload as Record<string, unknown>;
  if (typeof value.id !== 'string' || typeof value.channel_id !== 'string' || typeof value.timestamp !== 'string') {
    return null;
  }
  return {
    id: value.id,
    channel_id: value.channel_id,
    ...(typeof value.content === 'string' ? { content: value.content } : {}),
    timestamp: value.timestamp,
    ...(value.author && typeof value.author === 'object'
      ? {
          author: {
            ...(typeof (value.author as Record<string, unknown>).id === 'string' ? { id: (value.author as Record<string, unknown>).id as string } : {}),
            ...(typeof (value.author as Record<string, unknown>).username === 'string' ? { username: (value.author as Record<string, unknown>).username as string } : {}),
            ...(typeof (value.author as Record<string, unknown>).global_name === 'string' || (value.author as Record<string, unknown>).global_name === null
              ? { global_name: (value.author as Record<string, unknown>).global_name as string | null }
              : {}),
            ...(typeof (value.author as Record<string, unknown>).bot === 'boolean' ? { bot: (value.author as Record<string, unknown>).bot as boolean } : {}),
          },
        }
      : {}),
    ...(value.referenced_message && typeof value.referenced_message === 'object'
      ? {
          referenced_message: {
            ...(typeof (value.referenced_message as Record<string, unknown>).id === 'string'
              ? { id: (value.referenced_message as Record<string, unknown>).id as string }
              : {}),
          },
        }
      : {}),
  };
}
