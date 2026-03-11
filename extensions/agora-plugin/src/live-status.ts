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

  const pushRuntimeIdentity = (payload: {
    agent: string;
    sessionReference?: string | null;
    identitySource: "plugin_event";
    identityPath?: string | null;
    sessionObservedAt: string;
    workspaceRoot?: string | null;
  }) => {
    if (typeof bridge.ingestRuntimeIdentity !== "function") {
      return;
    }
    void bridge.ingestRuntimeIdentity({
      agent: payload.agent,
      session_reference: payload.sessionReference ?? null,
      identity_source: payload.identitySource,
      identity_path: payload.identityPath ?? null,
      session_observed_at: payload.sessionObservedAt,
      workspace_root: payload.workspaceRoot ?? null,
    }).catch((error) => {
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
    const runtimeIdentity = extractRuntimeIdentity(
      ctx.agentId,
      {
        sessionId: ctx.sessionId,
        workspaceRoot: metadataString(event, "workspaceRoot") ?? metadataString(event, "workdir") ?? metadataString(event, "cwd"),
        identityPath: metadataString(event, "identityPath") ?? metadataString(event, "sessionPath") ?? metadataString(event, "chatFile"),
      },
      new Date().toISOString(),
    );
    if (runtimeIdentity) {
      pushRuntimeIdentity(runtimeIdentity);
    }
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
    const runtimeIdentity = extractRuntimeIdentity(
      ctx.agentId,
      {
        sessionId: ctx.sessionId,
        workspaceRoot: metadataString(event, "workspaceRoot") ?? metadataString(event, "workdir") ?? metadataString(event, "cwd"),
        identityPath: metadataString(event, "identityPath") ?? metadataString(event, "sessionPath") ?? metadataString(event, "chatFile"),
      },
      new Date().toISOString(),
    );
    if (runtimeIdentity) {
      pushRuntimeIdentity(runtimeIdentity);
    }
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
    if (event.success && typeof bridge.ingestTaskConversationEntry === "function") {
      void bridge.ingestTaskConversationEntry({
        provider: ctx.channelId ?? inferChannel(sessionKey) ?? "unknown",
        conversation_ref: ctx.conversationId ?? inferConversationId(sessionKey),
        thread_ref: threadIdFromMetadata(event.metadata),
        provider_message_ref: messageIdFromMetadata(event.metadata),
        direction: "outbound",
        author_kind: "agent",
        author_ref: agentId,
        display_name: agentId,
        body: event.content,
        occurred_at: isoNow(event.timestamp),
        metadata: event.metadata ?? {},
      }).catch((error) => {
        logError(logger, error);
      });
    }
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
        const runtimeIdentity = extractRuntimeIdentity(
          runtimeAgentId(event.data),
          {
            sessionId: stringValue(event.data.sessionId) ?? stringValue(event.data.session_id),
            workspaceRoot:
              stringValue(event.data.workspaceRoot)
              ?? stringValue(event.data.workdir)
              ?? stringValue(event.data.cwd),
            identityPath:
              stringValue(event.data.identityPath)
              ?? stringValue(event.data.sessionPath)
              ?? stringValue(event.data.chatFile),
          },
          new Date(event.ts).toISOString(),
        );
        if (runtimeIdentity) {
          pushRuntimeIdentity(runtimeIdentity);
        }
      });
    },
    stop: () => {
      unsubscribe?.();
      unsubscribe = undefined;
    },
  });
}

function extractRuntimeIdentity(
  agentId: string | undefined,
  input: {
    sessionId?: string | null;
    workspaceRoot?: string | null;
    identityPath?: string | null;
  },
  observedAt: string,
) {
  if (!isCraftsmanRuntimeAgent(agentId)) {
    return null;
  }
  if (!input.sessionId && !input.identityPath && !input.workspaceRoot) {
    return null;
  }
  return {
    agent: agentId,
    sessionReference: input.sessionId ?? null,
    identitySource: "plugin_event" as const,
    identityPath: input.identityPath ?? null,
    sessionObservedAt: observedAt,
    workspaceRoot: input.workspaceRoot ?? null,
  };
}

function isCraftsmanRuntimeAgent(agentId?: string) {
  return agentId === "codex" || agentId === "claude" || agentId === "gemini";
}

function runtimeAgentId(data: Record<string, unknown>) {
  const direct =
    stringValue(data.agent)
    ?? stringValue(data.agentId)
    ?? stringValue(data.runtimeAgent)
    ?? stringValue(data.craftsman)
    ?? stringValue(data.adapter);
  return isCraftsmanRuntimeAgent(direct) ? direct : undefined;
}

function metadataString(event: object, key: string) {
  const direct = (event as Record<string, unknown>)[key];
  const metadata = (event as { metadata?: Record<string, unknown> }).metadata;
  return stringValue(direct) ?? stringValue(metadata?.[key]);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
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
