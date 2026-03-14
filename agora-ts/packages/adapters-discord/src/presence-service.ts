import { ActivityType, Client, GatewayIntentBits } from 'discord.js';
import { ensureDiscordGatewayProxy, sanitizeProxyForLogs } from './proxy-support.js';

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
  clientFactory?: () => DiscordGatewayPresenceClient;
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

function createDefaultClient() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });
  const wrapped: DiscordGatewayPresenceClient = {
    login: (token) => client.login(token),
    destroy: () => client.destroy(),
    once: (event, listener) => {
      client.once(event, listener);
      return wrapped;
    },
    on: (event, listener) => {
      client.on(event, listener);
      return wrapped;
    },
    get user() {
      if (!client.user) {
        return null;
      }
      return {
        setPresence: (presence: unknown) => client.user?.setPresence(presence as never),
      };
    },
  };
  return wrapped;
}

export class DiscordGatewayPresenceService {
  readonly enabled: boolean;

  private readonly botToken: string;
  private readonly status: DiscordGatewayPresenceStatus;
  private readonly activityName: string | null;
  private readonly proxyBootstrap: NonNullable<DiscordGatewayPresenceServiceOptions['proxyBootstrap']>;
  private readonly client: DiscordGatewayPresenceClient;
  private readonly logger: NonNullable<DiscordGatewayPresenceServiceOptions['logger']>;
  private started = false;

  constructor(options: DiscordGatewayPresenceServiceOptions) {
    this.botToken = options.botToken;
    this.enabled = options.enabled ?? true;
    this.status = options.status ?? 'online';
    this.activityName = options.activityName?.trim() ? options.activityName.trim() : 'Agora';
    this.proxyBootstrap = options.proxyBootstrap ?? (() => ensureDiscordGatewayProxy());
    this.client = options.clientFactory?.() ?? createDefaultClient();
    this.logger = options.logger ?? {};
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

    this.client.once('ready', () => {
      if (!this.client.user) {
        this.logger.warn?.('[agora] discord presence ready without user');
        return;
      }
      void Promise.resolve(
        this.client.user.setPresence({
          status: this.status,
          activities: this.activityName
            ? [{ name: this.activityName, type: ActivityType.Watching }]
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

    this.client.on('error', (error) => {
      this.logger.error?.('[agora] discord gateway presence client error', error);
    });

    void this.client.login(this.botToken).catch((error) => {
      this.started = false;
      this.logger.error?.('[agora] discord gateway presence login failed', error);
    });
  }

  stop() {
    if (!this.started) {
      return;
    }
    this.started = false;
    this.client.destroy();
  }
}
