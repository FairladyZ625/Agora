export interface CommandContext {
  args?: string;
  senderId?: string;
  from?: string;
}

export interface CommandResult {
  text: string;
}

export interface PluginLogger {
  info(message: string): void;
  error(message: string): void;
}

export interface AgentEventPayload {
  runId: string;
  seq: number;
  stream: string;
  ts: number;
  sessionKey?: string;
  data: Record<string, unknown>;
}

export interface SessionHookEvent {
  sessionId: string;
  sessionKey?: string;
  messageCount?: number;
  timestamp?: number;
}

export interface MessageHookEvent {
  from?: string;
  to?: string;
  content: string;
  success?: boolean;
  error?: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

export interface MessageHookContext {
  channelId?: string;
  accountId?: string;
  conversationId?: string;
  sessionKey?: string;
  agentId?: string;
}

export interface AgentHookEvent {
  prompt?: string;
  messages?: unknown[];
  success?: boolean;
  error?: string;
  durationMs?: number;
}

export interface AgentHookContext {
  channelId?: string;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  trigger?: string;
}

export interface OpenClawPluginApi {
  pluginConfig?: Record<string, unknown>;
  logger: PluginLogger;
  runtime?: {
    events?: {
      onAgentEvent: (listener: (event: AgentEventPayload) => void) => () => void;
    };
  };
  registerCommand(def: {
    name: string;
    description: string;
    acceptsArgs?: boolean;
    requireAuth?: boolean;
    handler: (ctx: CommandContext) => Promise<CommandResult>;
  }): void;
  registerService?(service: {
    id: string;
    start: () => void | Promise<void>;
    stop?: () => void | Promise<void>;
  }): void;
  on?<K extends 'session_start' | 'session_end' | 'message_received' | 'message_sent' | 'before_agent_start' | 'agent_end'>(
    hook: K,
    handler: (
      event: K extends 'session_start' | 'session_end'
        ? SessionHookEvent
        : K extends 'before_agent_start' | 'agent_end'
          ? AgentHookEvent
          : MessageHookEvent,
      ctx: K extends 'session_start' | 'session_end'
        ? { sessionKey?: string; agentId?: string; sessionId: string }
        : K extends 'before_agent_start' | 'agent_end'
          ? AgentHookContext
        : MessageHookContext,
    ) => void | Promise<void>,
  ): void;
}
