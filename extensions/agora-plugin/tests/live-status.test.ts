import { describe, expect, it, vi } from "vitest";
import { registerLiveStatusBridge } from "../src/live-status";

function createApi() {
  const hooks = new Map<string, Function>();
  let service: { start: () => void | Promise<void>; stop?: () => void | Promise<void> } | undefined;
  const onAgentEvent = vi.fn((listener: (event: unknown) => void) => {
    createApiState.listener = listener;
    return () => {
      createApiState.listener = undefined;
    };
  });

  const createApiState: { listener?: (event: unknown) => void } = {};

  const api = {
    pluginConfig: { agentId: "ops" },
    logger: { info: vi.fn(), error: vi.fn() },
    runtime: { events: { onAgentEvent } },
    registerService: vi.fn((value) => {
      service = value;
    }),
    on: vi.fn((hook: string, handler: Function) => {
      hooks.set(hook, handler);
    }),
  };

  return {
    api,
    hooks,
    getService: () => service,
    emitAgentEvent: (event: unknown) => createApiState.listener?.(event),
  };
}

describe("registerLiveStatusBridge", () => {
  it("pushes session lifecycle events to Agora TS", async () => {
    const bridge = { upsertLiveSession: vi.fn().mockResolvedValue({ ok: true }) };
    const { api, hooks } = createApi();

    registerLiveStatusBridge(api as never, bridge as never);

    const sessionStart = hooks.get("session_start");
    const sessionEnd = hooks.get("session_end");
    expect(sessionStart).toBeTypeOf("function");
    expect(sessionEnd).toBeTypeOf("function");

    await sessionStart?.(
      { sessionId: "sess-1", sessionKey: "agent:ops:discord:channel:alerts" },
      { sessionId: "sess-1", sessionKey: "agent:ops:discord:channel:alerts", agentId: "ops" },
    );
    await sessionEnd?.(
      { sessionId: "sess-1", sessionKey: "agent:ops:discord:channel:alerts", messageCount: 3 },
      { sessionId: "sess-1", sessionKey: "agent:ops:discord:channel:alerts", agentId: "ops" },
    );

    expect(bridge.upsertLiveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id: "ops",
        session_key: "agent:ops:discord:channel:alerts",
        channel: "discord",
        status: "active",
        last_event: "session_start",
      }),
    );
    expect(bridge.upsertLiveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id: "ops",
        session_key: "agent:ops:discord:channel:alerts",
        status: "closed",
        last_event: "session_end",
      }),
    );
  });

  it("projects message hooks and runtime agent events into live status snapshots", async () => {
    const bridge = { upsertLiveSession: vi.fn().mockResolvedValue({ ok: true }) };
    const { api, hooks, getService, emitAgentEvent } = createApi();

    registerLiveStatusBridge(api as never, bridge as never);

    const messageReceived = hooks.get("message_received");
    const messageSent = hooks.get("message_sent");
    expect(messageReceived).toBeTypeOf("function");
    expect(messageSent).toBeTypeOf("function");

    await messageReceived?.(
      {
        content: "hello",
        timestamp: Date.parse("2026-03-08T07:05:00.000Z"),
        metadata: { threadId: "thread-7" },
      },
      {
        channelId: "discord",
        conversationId: "alerts",
        accountId: "default",
      },
    );
    await messageSent?.(
      {
        content: "done",
        success: false,
        error: "denied",
      },
      {
        channelId: "discord",
        conversationId: "alerts",
        accountId: "default",
      },
    );

    const service = getService();
    expect(service).toBeDefined();
    await service?.start();
    emitAgentEvent({
      runId: "run-1",
      seq: 1,
      stream: "tool",
      ts: Date.parse("2026-03-08T07:06:00.000Z"),
      sessionKey: "agent:ops:discord:channel:alerts",
      data: { tool: "exec" },
    });

    expect(bridge.upsertLiveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id: "ops",
        session_key: "agent:ops:discord:channel:alerts",
        thread_id: "thread-7",
        last_event: "message_received",
      }),
    );
    expect(bridge.upsertLiveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "idle",
        last_event: "message_sent",
        metadata: { error: "denied" },
      }),
    );
    expect(bridge.upsertLiveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        last_event: "tool",
        last_event_at: "2026-03-08T07:06:00.000Z",
        metadata: { tool: "exec" },
      }),
    );
  });

  it("covers success and error branches for message send and runtime events", async () => {
    const bridge = { upsertLiveSession: vi.fn().mockResolvedValue({ ok: true }) };
    const { api, hooks, getService, emitAgentEvent } = createApi();

    registerLiveStatusBridge(api as never, bridge as never);

    const messageSent = hooks.get("message_sent");
    await messageSent?.(
      { content: "done", success: true },
      {
        channelId: "discord",
        conversationId: "alerts",
      },
    );

    await getService()?.start();
    emitAgentEvent({
      runId: "run-err",
      seq: 2,
      stream: "error",
      ts: Date.parse("2026-03-08T07:07:00.000Z"),
      sessionKey: "agent:ops:discord:channel:alerts",
      data: { error: "timeout" },
    });

    expect(bridge.upsertLiveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
        last_event: "message_sent",
        metadata: {},
      }),
    );
    expect(bridge.upsertLiveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "idle",
        last_event: "error",
        metadata: { error: "timeout" },
      }),
    );
  });

  it("uses the default main agent id for message hooks and can stop the runtime subscription", async () => {
    const bridge = { upsertLiveSession: vi.fn().mockResolvedValue({ ok: true }) };
    const { api, hooks, getService } = createApi();
    api.pluginConfig = {};
    const unsubscribe = vi.fn();
    api.runtime.events.onAgentEvent = vi.fn(() => unsubscribe);

    registerLiveStatusBridge(api as never, bridge as never);

    const messageReceived = hooks.get("message_received");
    await messageReceived?.(
      {
        content: "hello",
        metadata: { message_thread_id: 99 },
      },
      {
        channelId: "discord",
        conversationId: "ops-room",
      },
    );

    expect(bridge.upsertLiveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id: "main",
        session_key: "agent:main:discord:channel:ops-room",
        thread_id: "99",
      }),
    );

    await getService()?.start();
    await getService()?.stop?.();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("skips incomplete hook context and logs bridge push failures", async () => {
    const bridge = {
      upsertLiveSession: vi
        .fn()
        .mockRejectedValueOnce(new Error("bridge down"))
        .mockResolvedValue({ ok: true }),
    };
    const { api, hooks } = createApi();

    registerLiveStatusBridge(api as never, bridge as never);

    const messageReceived = hooks.get("message_received");
    const sessionStart = hooks.get("session_start");

    await messageReceived?.(
      { content: "hello" },
      {
        channelId: "discord",
      },
    );
    await sessionStart?.(
      { sessionId: "sess-2" },
      { sessionId: "sess-2" },
    );
    await messageReceived?.(
      { content: "hello", metadata: {} },
      {
        channelId: "discord",
        conversationId: "alerts",
      },
    );
    await Promise.resolve();

    expect(bridge.upsertLiveSession).toHaveBeenCalledTimes(1);
    expect(api.logger.error).toHaveBeenCalledWith("bridge down");
  });

  it("does nothing when runtime events are unavailable or service start is repeated", async () => {
    const bridge = { upsertLiveSession: vi.fn().mockResolvedValue({ ok: true }) };
    const { api, getService } = createApi();
    api.runtime = undefined;

    registerLiveStatusBridge(api as never, bridge as never);

    await getService()?.start();
    await getService()?.start();

    expect(bridge.upsertLiveSession).not.toHaveBeenCalled();
  });

  it("covers fallback parsing branches for short session keys and missing message metadata", async () => {
    const bridge = { upsertLiveSession: vi.fn().mockResolvedValue({ ok: true }) };
    const { api, hooks } = createApi();

    registerLiveStatusBridge(api as never, bridge as never);

    const sessionStart = hooks.get("session_start");
    const messageSent = hooks.get("message_sent");

    await sessionStart?.(
      { sessionId: "sess-short", sessionKey: "agent:ops:main" },
      { sessionId: "sess-short", sessionKey: "agent:ops:main" },
    );
    await messageSent?.(
      { content: "done", success: false },
      {
        channelId: "discord",
        conversationId: "alerts",
      },
    );

    expect(bridge.upsertLiveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        session_key: "agent:ops:main",
        channel: "main",
        conversation_id: "main",
      }),
    );
    expect(bridge.upsertLiveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        thread_id: null,
        metadata: { error: "unknown" },
      }),
    );
  });

  it("logs non-Error bridge failures as strings", async () => {
    const bridge = {
      upsertLiveSession: vi.fn().mockRejectedValue("raw failure"),
    };
    const { api, hooks } = createApi();

    registerLiveStatusBridge(api as never, bridge as never);

    const sessionStart = hooks.get("session_start");
    await sessionStart?.(
      { sessionId: "sess-log", sessionKey: "agent:ops:discord:channel:alerts" },
      { sessionId: "sess-log", sessionKey: "agent:ops:discord:channel:alerts", agentId: "ops" },
    );
    await Promise.resolve();

    expect(api.logger.error).toHaveBeenCalledWith("raw failure");
  });
});
