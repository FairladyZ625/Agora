import { EventEmitter } from 'node:events';
import type { Agent } from 'node:http';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { WebSocket, type ClientOptions, type RawData } from 'ws';
import { resolveDiscordProxyEnvironment, sanitizeProxyForLogs } from './proxy-support.js';

const DISCORD_GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';
const DISCORD_GATEWAY_GUILDS_INTENT = 1;
const DISCORD_WATCHING_ACTIVITY_TYPE = 3;

export type DiscordGatewayPresenceStatus = 'online' | 'idle' | 'dnd' | 'invisible';

export interface DiscordGatewayPresenceServiceOptions {
  botToken: string;
  enabled?: boolean;
  status?: DiscordGatewayPresenceStatus;
  activityName?: string | null;
  proxyBootstrap?: () => {
    enabled: boolean;
    httpsProxy: string | null;
    httpProxy: string | null;
  };
  clientFactory?: (proxy: {
    enabled: boolean;
    httpsProxy: string | null;
    httpProxy: string | null;
  }) => DiscordGatewayPresenceClient;
  logger?: {
    info?: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string, error?: unknown) => void;
  };
}

export interface DiscordGatewayPresenceClient {
  login(token: string): Promise<string>;
  destroy(): void;
  once(event: 'ready', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  user: {
    setPresence: (presence: unknown) => Promise<unknown> | unknown;
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
}, logger: NonNullable<DiscordGatewayPresenceServiceOptions['logger']>) => WebSocket;

export function createDiscordGatewayWebSocketProxyAgent(proxy: {
  enabled: boolean;
  httpsProxy: string | null;
  httpProxy: string | null;
}, logger: NonNullable<DiscordGatewayPresenceServiceOptions['logger']>): Agent | undefined {
  const proxyUrl = proxy.httpsProxy ?? proxy.httpProxy;
  if (!proxy.enabled || !proxyUrl) {
    return undefined;
  }

  let protocol: string;
  try {
    protocol = new URL(proxyUrl).protocol;
  } catch {
    logger.warn?.('[agora] discord gateway presence proxy url is invalid; websocket proxy agent disabled');
    return undefined;
  }

  if (protocol !== 'http:' && protocol !== 'https:') {
    logger.warn?.(`[agora] discord gateway presence proxy scheme unsupported for websocket (${protocol})`);
    return undefined;
  }

  return new HttpsProxyAgent(proxyUrl);
}

function createDiscordGatewayWebSocket(
  proxy: { enabled: boolean; httpsProxy: string | null; httpProxy: string | null },
  logger: NonNullable<DiscordGatewayPresenceServiceOptions['logger']>,
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

class MinimalDiscordGatewayPresenceClient extends EventEmitter implements DiscordGatewayPresenceClient {
  user: DiscordGatewayPresenceClient['user'] = null;

  private readonly proxy: {
    enabled: boolean;
    httpsProxy: string | null;
    httpProxy: string | null;
  };

  private readonly logger: NonNullable<DiscordGatewayPresenceServiceOptions['logger']>;
  private readonly webSocketFactory: GatewayWebSocketFactory;
  private socket: WebSocket | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private sequence: number | null = null;
  private ready = false;

  constructor(options: {
    proxy: {
      enabled: boolean;
      httpsProxy: string | null;
      httpProxy: string | null;
    };
    logger: NonNullable<DiscordGatewayPresenceServiceOptions['logger']>;
    webSocketFactory?: GatewayWebSocketFactory;
  }) {
    super();
    this.proxy = options.proxy;
    this.logger = options.logger;
    this.webSocketFactory = options.webSocketFactory ?? createDiscordGatewayWebSocket;
  }

  login(token: string): Promise<string> {
    this.destroy();

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
        this.ready = false;
        this.user = null;
        if (!settled) {
          settled = true;
          reject(new Error(`discord gateway closed before ready (${code})`));
        }
      });
    });
  }

  destroy() {
    this.clearHeartbeat();
    this.ready = false;
    this.user = null;
    if (this.socket) {
      try {
        this.socket.close();
      } finally {
        this.socket = null;
      }
    }
  }

  private handleGatewayMessage(data: WebSocket.RawData, token: string, resolveReady: () => void) {
    const payload = parseGatewayPayload(data);
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
            intents: DISCORD_GATEWAY_GUILDS_INTENT,
            properties: {
              os: process.platform,
              browser: 'agora-presence',
              device: 'agora-presence',
            },
          },
        });
        break;
      }
      case 1:
        this.sendHeartbeat();
        break;
      case 7:
        throw new Error('discord gateway requested reconnect before presence became ready');
      case 9:
        throw new Error('discord gateway invalidated session before presence became ready');
      case 0:
        if (payload.t === 'READY') {
          this.ready = true;
          this.user = {
            setPresence: (presence: unknown) => this.sendPayload({ op: 3, d: presence }),
          };
          this.emit('ready');
          resolveReady();
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

function parseGatewayPayload(data: RawData): GatewayPayload {
  const text = typeof data === 'string'
    ? data
    : Buffer.isBuffer(data)
      ? data.toString('utf8')
      : Array.isArray(data)
        ? Buffer.concat(data).toString('utf8')
      : data instanceof ArrayBuffer
        ? Buffer.from(data).toString('utf8')
        : Buffer.from(data as ArrayBufferView).toString('utf8');
  return JSON.parse(text) as GatewayPayload;
}

function extractHeartbeatInterval(payload: unknown) {
  if (
    typeof payload === 'object'
    && payload !== null
    && 'heartbeat_interval' in payload
    && typeof (payload as { heartbeat_interval?: unknown }).heartbeat_interval === 'number'
  ) {
    return (payload as { heartbeat_interval: number }).heartbeat_interval;
  }
  throw new Error('discord gateway hello payload missing heartbeat_interval');
}

function createDefaultClient(
  proxy: { enabled: boolean; httpsProxy: string | null; httpProxy: string | null },
  logger: NonNullable<DiscordGatewayPresenceServiceOptions['logger']>,
) {
  return new MinimalDiscordGatewayPresenceClient({ proxy, logger });
}

export class DiscordGatewayPresenceService {
  readonly enabled: boolean;

  private readonly botToken: string;
  private readonly status: DiscordGatewayPresenceStatus;
  private readonly activityName: string | null;
  private readonly proxyBootstrap: NonNullable<DiscordGatewayPresenceServiceOptions['proxyBootstrap']>;
  private readonly clientFactory: NonNullable<DiscordGatewayPresenceServiceOptions['clientFactory']>;
  private client: DiscordGatewayPresenceClient | null = null;
  private readonly logger: NonNullable<DiscordGatewayPresenceServiceOptions['logger']>;
  private started = false;

  constructor(options: DiscordGatewayPresenceServiceOptions) {
    this.botToken = options.botToken;
    this.enabled = options.enabled ?? true;
    this.status = options.status ?? 'online';
    this.activityName = options.activityName?.trim() ? options.activityName.trim() : 'Agora';
    this.proxyBootstrap = options.proxyBootstrap ?? (() => {
      const resolved = resolveDiscordProxyEnvironment();
      return {
        enabled: resolved.enabled,
        httpsProxy: resolved.httpsProxy,
        httpProxy: resolved.httpProxy,
      };
    });
    this.logger = options.logger ?? {};
    this.clientFactory = options.clientFactory ?? ((proxy) => createDefaultClient(proxy, this.logger));
  }

  start() {
    if (!this.enabled || this.started) {
      return;
    }
    this.started = true;

    const proxy = this.proxyBootstrap();
    if (proxy.enabled) {
      const proxyTarget = sanitizeProxyForLogs(proxy.httpsProxy ?? proxy.httpProxy);
      this.logger.info?.(`[agora] discord gateway presence proxy enabled${proxyTarget ? ` (${proxyTarget})` : ''}`);
    }

    this.client = this.clientFactory(proxy);
    const client = this.client;

    client.once('ready', () => {
      if (!client.user) {
        this.logger.warn?.('[agora] discord presence ready without user');
        return;
      }
      void Promise.resolve(
        client.user.setPresence({
          status: this.status,
          activities: this.activityName
            ? [{ name: this.activityName, type: DISCORD_WATCHING_ACTIVITY_TYPE }]
            : [],
        }),
      )
        .then(() => {
          this.logger.info?.(`[agora] discord gateway presence online (${this.status})`);
        })
        .catch((error) => {
          this.logger.error?.('[agora] discord gateway presence update failed', error);
        });
    });

    client.on('error', (error) => {
      this.logger.error?.('[agora] discord gateway presence client error', error);
    });

    void client.login(this.botToken).catch((error) => {
      this.started = false;
      this.logger.error?.('[agora] discord gateway presence login failed', error);
    });
  }

  stop() {
    if (!this.started) {
      return;
    }
    this.started = false;
    this.client?.destroy();
    this.client = null;
  }
}
