type BridgeSocketLike = {
  send(data: string): void;
  close(code?: number): void;
  addEventListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
};

type BridgeSocketFactory = (url: string) => BridgeSocketLike;

export interface CcConnectBridgeConnectInput {
  baseUrl: string;
  token: string;
  path?: string;
  platform: string;
  project?: string;
  capabilities: string[];
  metadata?: Record<string, unknown>;
}

export interface CcConnectBridgeMessageInput {
  msg_id: string;
  session_key: string;
  user_id: string;
  user_name?: string;
  content: string;
  reply_ctx: string;
  project?: string;
  images?: unknown[];
  files?: unknown[];
  audio?: unknown | null;
}

export type CcConnectBridgeEvent =
  | {
      type: 'register_ack';
      ok: boolean;
      error?: string;
    }
  | {
      type: 'reply';
      session_key: string;
      reply_ctx: string;
      content: string;
      format?: string;
    }
  | {
      type: 'reply_stream';
      session_key: string;
      reply_ctx: string;
      delta?: string;
      full_text?: string;
      preview_handle?: string;
      done?: boolean;
    }
  | {
      type: 'pong';
      ts?: number;
    };

export interface CcConnectBridgeClientOptions {
  webSocketFactory?: BridgeSocketFactory;
}

export class CcConnectBridgeClient {
  private readonly listeners = new Set<(event: CcConnectBridgeEvent) => void>();
  private readonly webSocketFactory: BridgeSocketFactory;
  private socket: BridgeSocketLike | null = null;
  private connected = false;

  constructor(options: CcConnectBridgeClientOptions = {}) {
    this.webSocketFactory = options.webSocketFactory ?? defaultBridgeSocketFactory;
  }

  onEvent(listener: (event: CcConnectBridgeEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async connect(input: CcConnectBridgeConnectInput): Promise<void> {
    const socket = this.webSocketFactory(buildBridgeWebSocketUrl(input.baseUrl, input.path, input.token));
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        fn();
      };

      listen(socket, 'open', () => {
        socket.send(JSON.stringify({
          type: 'register',
          platform: input.platform,
          ...(input.project ? { project: input.project } : {}),
          capabilities: input.capabilities,
          ...(input.metadata ? { metadata: input.metadata } : {}),
        }));
      });

      listen(socket, 'message', (payload) => {
        const event = parseBridgeEvent(payload);
        if (!event) {
          return;
        }
        this.emit(event);
        if (event.type === 'register_ack') {
          if (event.ok) {
            this.connected = true;
            finish(resolve);
            return;
          }
          finish(() => reject(new Error(event.error ?? 'cc-connect bridge registration rejected')));
        }
      });

      listen(socket, 'error', (error) => {
        finish(() => reject(error instanceof Error ? error : new Error(String(error))));
      });

      listen(socket, 'close', () => {
        if (!this.connected) {
          finish(() => reject(new Error('cc-connect bridge closed before register_ack')));
          return;
        }
        this.connected = false;
      });
    });
  }

  async sendMessage(input: CcConnectBridgeMessageInput): Promise<void> {
    if (!this.socket || !this.connected) {
      throw new Error('cc-connect bridge is not connected');
    }
    this.socket.send(JSON.stringify({
      type: 'message',
      msg_id: input.msg_id,
      session_key: input.session_key,
      user_id: input.user_id,
      ...(input.user_name ? { user_name: input.user_name } : {}),
      content: input.content,
      reply_ctx: input.reply_ctx,
      ...(input.project ? { project: input.project } : {}),
      images: input.images ?? [],
      files: input.files ?? [],
      audio: input.audio ?? null,
    }));
  }

  async ping(ts = Date.now()): Promise<void> {
    if (!this.socket || !this.connected) {
      throw new Error('cc-connect bridge is not connected');
    }
    this.socket.send(JSON.stringify({ type: 'ping', ts }));
  }

  close() {
    this.connected = false;
    this.socket?.close();
    this.socket = null;
  }

  private emit(event: CcConnectBridgeEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function buildBridgeWebSocketUrl(baseUrl: string, path = '/bridge/ws', token: string) {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = path;
  url.searchParams.set('token', token);
  return url.toString();
}

function defaultBridgeSocketFactory(url: string): BridgeSocketLike {
  const WebSocketCtor = (globalThis as { WebSocket?: new (input: string) => BridgeSocketLike }).WebSocket;
  if (!WebSocketCtor) {
    throw new Error(`global WebSocket is unavailable for ${url}`);
  }
  return new WebSocketCtor(url);
}

function listen(socket: BridgeSocketLike, event: string, listener: (...args: unknown[]) => void) {
  if (typeof socket.addEventListener === 'function') {
    socket.addEventListener(event, listener);
    return;
  }
  if (typeof socket.on === 'function') {
    socket.on(event, listener);
    return;
  }
  throw new Error(`bridge socket does not support event subscription for ${event}`);
}

function parseBridgeEvent(payload: unknown): CcConnectBridgeEvent | null {
  const raw = toMessageText(payload);
  if (!raw) {
    return null;
  }
  const value = JSON.parse(raw) as Record<string, unknown>;
  if (value.type === 'register_ack') {
    return {
      type: 'register_ack',
      ok: value.ok === true,
      ...(typeof value.error === 'string' ? { error: value.error } : {}),
    };
  }
  if (value.type === 'reply') {
    return {
      type: 'reply',
      session_key: String(value.session_key ?? ''),
      reply_ctx: String(value.reply_ctx ?? ''),
      content: String(value.content ?? ''),
      ...(typeof value.format === 'string' ? { format: value.format } : {}),
    };
  }
  if (value.type === 'reply_stream') {
    return {
      type: 'reply_stream',
      session_key: String(value.session_key ?? ''),
      reply_ctx: String(value.reply_ctx ?? ''),
      ...(typeof value.delta === 'string' ? { delta: value.delta } : {}),
      ...(typeof value.full_text === 'string' ? { full_text: value.full_text } : {}),
      ...(typeof value.preview_handle === 'string' ? { preview_handle: value.preview_handle } : {}),
      ...(typeof value.done === 'boolean' ? { done: value.done } : {}),
    };
  }
  if (value.type === 'pong') {
    return {
      type: 'pong',
      ...(typeof value.ts === 'number' ? { ts: value.ts } : {}),
    };
  }
  return null;
}

function toMessageText(payload: unknown) {
  if (typeof payload === 'string') {
    return payload;
  }
  if (payload instanceof Uint8Array) {
    return Buffer.from(payload).toString('utf8');
  }
  if (
    typeof payload === 'object'
    && payload !== null
    && 'data' in payload
    && typeof (payload as { data?: unknown }).data === 'string'
  ) {
    return (payload as { data: string }).data;
  }
  return null;
}
