import type { LiveSessionDto } from "@agora-ts/contracts";
import { AgoraBridge } from "./bridge";
import type { OpenClawPluginApi, PluginLogger } from "./types";

export function registerLiveStatusBridge(api: OpenClawPluginApi, bridge: AgoraBridge): void {
  const logger = api.logger;

  const push = (payload: LiveSessionDto) => {
    void bridge.upsertLiveSession(payload).catch((error) => {
      logError(logger, error);
    });
  };

  api.on?.("session_start", (event, ctx) => {
    const sessionKey = event.sessionKey ?? ctx.sessionKey;
    const agentId = ctx.agentId ?? parseAgentId(sessionKey);
    if (!sessionKey || !agentId) {
      return;
    }
    push({
      source: "openclaw",
      agent_id: agentId,
      session_key: sessionKey,
      channel: inferChannel(sessionKey),
      conversation_id: inferConversationId(sessionKey),
      thread_id: null,
      status: "active",
      last_event: "session_start",
      last_event_at: new Date().toISOString(),
      metadata: { sessionId: event.sessionId },
    });
  });

  api.on?.("before_agent_start", (event, ctx) => {
    const sessionKey = ctx.sessionKey;
    const agentId = ctx.agentId ?? parseAgentId(sessionKey);
    if (!sessionKey || !agentId) {
      return;
    }
    push({
      source: "openclaw",
      agent_id: agentId,
      session_key: sessionKey,
      channel: ctx.channelId ?? inferChannel(sessionKey),
      conversation_id: inferConversationId(sessionKey),
      thread_id: null,
      status: "active",
      last_event: "before_agent_start",
      last_event_at: new Date().toISOString(),
      metadata: {
        trigger: ctx.trigger,
        prompt: event.prompt,
        sessionId: ctx.sessionId,
      },
    });
  });

  api.on?.("session_end", (event, ctx) => {
    const sessionKey = event.sessionKey ?? ctx.sessionKey;
    const agentId = ctx.agentId ?? parseAgentId(sessionKey);
    if (!sessionKey || !agentId) {
      return;
    }
    push({
      source: "openclaw",
      agent_id: agentId,
      session_key: sessionKey,
      channel: inferChannel(sessionKey),
      conversation_id: inferConversationId(sessionKey),
      thread_id: null,
      status: "closed",
      last_event: "session_end",
      last_event_at: new Date().toISOString(),
      metadata: { sessionId: event.sessionId, messageCount: event.messageCount },
    });
  });

  api.on?.("agent_end", (event, ctx) => {
    const sessionKey = ctx.sessionKey;
    const agentId = ctx.agentId ?? parseAgentId(sessionKey);
    if (!sessionKey || !agentId) {
      return;
    }
    push({
      source: "openclaw",
      agent_id: agentId,
      session_key: sessionKey,
      channel: ctx.channelId ?? inferChannel(sessionKey),
      conversation_id: inferConversationId(sessionKey),
      thread_id: null,
      status: event.success ? "idle" : "idle",
      last_event: "agent_end",
      last_event_at: new Date().toISOString(),
      metadata: {
        success: event.success ?? false,
        error: event.error,
        durationMs: event.durationMs,
        trigger: ctx.trigger,
        sessionId: ctx.sessionId,
      },
    });
  });

  api.on?.("message_received", (event, ctx) => {
    const sessionKey = inferSessionKeyFromMessage(api, ctx);
    const agentId = parseAgentId(sessionKey);
    if (!sessionKey || !agentId) {
      return;
    }
    push({
      source: "openclaw",
      agent_id: agentId,
      session_key: sessionKey,
      channel: ctx.channelId ?? inferChannel(sessionKey),
      account_id: ctx.accountId,
      conversation_id: ctx.conversationId ?? inferConversationId(sessionKey),
      thread_id: threadIdFromMetadata(event.metadata),
      status: "active",
      last_event: "message_received",
      last_event_at: isoNow(event.timestamp),
      metadata: event.metadata ?? {},
    });
    if (typeof bridge.ingestTaskConversationEntry === "function") {
      void bridge.ingestTaskConversationEntry({
        provider: ctx.channelId ?? inferChannel(sessionKey) ?? "unknown",
        conversation_ref: ctx.conversationId ?? inferConversationId(sessionKey),
        thread_ref: threadIdFromMetadata(event.metadata),
        provider_message_ref: messageIdFromMetadata(event.metadata),
        direction: "inbound",
        author_kind: "human",
        author_ref: ctx.accountId ?? null,
        display_name: ctx.accountId ?? null,
        body: event.content,
        occurred_at: isoNow(event.timestamp),
        metadata: event.metadata ?? {},
      }).catch((error) => {
        logError(logger, error);
      });
    }
  });

  api.on?.("message_sent", (event, ctx) => {
    const sessionKey = inferSessionKeyFromMessage(api, ctx);
    const agentId = parseAgentId(sessionKey);
    if (!sessionKey || !agentId) {
      return;
    }
    push({
      source: "openclaw",
      agent_id: agentId,
      session_key: sessionKey,
      channel: ctx.channelId ?? inferChannel(sessionKey),
      account_id: ctx.accountId,
      conversation_id: ctx.conversationId ?? inferConversationId(sessionKey),
      thread_id: null,
      status: event.success ? "active" : "idle",
      last_event: "message_sent",
      last_event_at: new Date().toISOString(),
      metadata: event.success ? {} : { error: event.error ?? "unknown" },
    });
  });

  let unsubscribe: (() => void) | undefined;
  api.registerService?.({
    id: "agora-live-status",
    start: () => {
      if (unsubscribe || !api.runtime?.events?.onAgentEvent) {
        return;
      }
      unsubscribe = api.runtime.events.onAgentEvent((event) => {
        const sessionKey = event.sessionKey;
        const agentId = parseAgentId(sessionKey);
        if (!sessionKey || !agentId) {
          return;
        }
        push({
          source: "openclaw",
          agent_id: agentId,
          session_key: sessionKey,
          channel: inferChannel(sessionKey),
          conversation_id: inferConversationId(sessionKey),
          thread_id: null,
          status: event.stream === "error" ? "idle" : "active",
          last_event: String(event.stream),
          last_event_at: new Date(event.ts).toISOString(),
          metadata: event.data,
        });
      });
    },
    stop: () => {
      unsubscribe?.();
      unsubscribe = undefined;
    },
  });
}

function inferSessionKeyFromMessage(api: OpenClawPluginApi, ctx: { channelId?: string; conversationId?: string }) {
  const agentId = inferDefaultAgentId(api);
  const channel = ctx.channelId;
  const conversation = ctx.conversationId;
  if (!agentId || !channel || !conversation) {
    return undefined;
  }
  return `agent:${agentId}:${channel}:channel:${conversation}`;
}

function inferDefaultAgentId(api: OpenClawPluginApi) {
  const configured = api.pluginConfig?.agentId;
  if (typeof configured === "string" && configured.trim()) {
    return configured.trim();
  }
  return "main";
}

function parseAgentId(sessionKey?: string) {
  if (!sessionKey) {
    return undefined;
  }
  const parts = sessionKey.split(":");
  if (parts[0] !== "agent" || !parts[1]) {
    return undefined;
  }
  return parts[1];
}

function inferChannel(sessionKey?: string) {
  if (!sessionKey) {
    return null;
  }
  const parts = sessionKey.split(":");
  return parts[2] ?? null;
}

function inferConversationId(sessionKey?: string) {
  if (!sessionKey) {
    return null;
  }
  const parts = sessionKey.split(":");
  return parts[4] ?? parts.at(-1) ?? null;
}

function threadIdFromMetadata(metadata?: Record<string, unknown>) {
  const value = metadata?.threadId ?? metadata?.message_thread_id;
  if (typeof value === "number" || typeof value === "string") {
    return String(value);
  }
  return null;
}

function messageIdFromMetadata(metadata?: Record<string, unknown>) {
  const value = metadata?.messageId ?? metadata?.message_id ?? metadata?.id;
  if (typeof value === "number" || typeof value === "string") {
    return String(value);
  }
  return null;
}

function isoNow(timestamp?: number) {
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    return new Date(timestamp).toISOString();
  }
  return new Date().toISOString();
}

function logError(logger: PluginLogger, error: unknown) {
  logger.error(error instanceof Error ? error.message : String(error));
}
