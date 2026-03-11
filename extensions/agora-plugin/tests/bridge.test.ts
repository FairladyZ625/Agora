import { afterEach, describe, expect, it, vi } from "vitest";

import { AgoraBridge } from "../src/bridge";

describe("AgoraBridge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns payload when response is ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ id: "OC-001" }), { status: 200 }))
    );

    const bridge = new AgoraBridge("http://127.0.0.1:8420");
    const task = await bridge.createTask("t", "quick", "u1");

    expect(task.id).toBe("OC-001");
  });

  it("throws detail from json error payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "bad request" }), { status: 400 }))
    );

    const bridge = new AgoraBridge("http://127.0.0.1:8420");
    await expect(bridge.listTasks()).rejects.toThrow("Agora API 400: bad request");
  });

  it("falls back to raw text for non-json errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));

    const bridge = new AgoraBridge("http://127.0.0.1:8420");
    await expect(bridge.listTasks()).rejects.toThrow("Agora API 500: boom");
  });

  it("sends bearer token when configured", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const bridge = new AgoraBridge("http://127.0.0.1:8420", "sec-token");
    await bridge.listTasks();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer sec-token");
  });

  it("does not send bearer token when not configured", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const bridge = new AgoraBridge("http://127.0.0.1:8420");
    await bridge.listTasks();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("posts live session snapshots to the ts live status endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const bridge = new AgoraBridge("http://127.0.0.1:8420");
    await bridge.upsertLiveSession({
      source: "openclaw",
      agent_id: "ops",
      session_key: "agent:ops:discord:channel:alerts",
      channel: "discord",
      conversation_id: "alerts",
      thread_id: "42",
      status: "active",
      last_event: "session_start",
      last_event_at: "2026-03-08T07:00:00.000Z",
      metadata: { trigger: "user" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8420/api/live/openclaw/sessions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          source: "openclaw",
          agent_id: "ops",
          session_key: "agent:ops:discord:channel:alerts",
          channel: "discord",
          conversation_id: "alerts",
          thread_id: "42",
          status: "active",
          last_event: "session_start",
          last_event_at: "2026-03-08T07:00:00.000Z",
          metadata: { trigger: "user" },
        }),
      }),
    );
  });

  it("posts task conversation ingress payloads to the ts conversation endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "entry-1" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const bridge = new AgoraBridge("http://127.0.0.1:8420", "sec-token");
    await bridge.ingestTaskConversationEntry({
      provider: "discord",
      conversation_ref: "alerts",
      thread_ref: "thread-7",
      provider_message_ref: "msg-1",
      direction: "inbound",
      author_kind: "human",
      author_ref: "default",
      display_name: "default",
      body: "hello",
      occurred_at: "2026-03-08T07:05:00.000Z",
      metadata: { source: "plugin" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8420/api/conversations/ingest",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          provider: "discord",
          conversation_ref: "alerts",
          thread_ref: "thread-7",
          provider_message_ref: "msg-1",
          direction: "inbound",
          author_kind: "human",
          author_ref: "default",
          display_name: "default",
          body: "hello",
          occurred_at: "2026-03-08T07:05:00.000Z",
          metadata: { source: "plugin" },
        }),
        headers: expect.objectContaining({
          Authorization: "Bearer sec-token",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("posts runtime identity payloads to the ts craftsmen identity endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, identity: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const bridge = new AgoraBridge("http://127.0.0.1:8420", "sec-token");
    await bridge.ingestRuntimeIdentity({
      agent: "gemini",
      session_reference: "gemini-session-123",
      identity_source: "plugin_event",
      identity_path: "/tmp/gemini/session.json",
      session_observed_at: "2026-03-08T08:00:00.000Z",
      workspace_root: "/Users/lizeyu/Projects/Agora",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8420/api/craftsmen/runtime/identity",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          agent: "gemini",
          session_reference: "gemini-session-123",
          identity_source: "plugin_event",
          identity_path: "/tmp/gemini/session.json",
          session_observed_at: "2026-03-08T08:00:00.000Z",
          workspace_root: "/Users/lizeyu/Projects/Agora",
        }),
        headers: expect.objectContaining({
          Authorization: "Bearer sec-token",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("posts cleanup requests with an empty body when no task id is provided", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ cleaned: 0 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const bridge = new AgoraBridge("http://127.0.0.1:8420");
    await bridge.cleanup();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8420/api/tasks/cleanup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
  });

  it("sends human identity headers for archon review actions", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "OC-001" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const bridge = new AgoraBridge("http://127.0.0.1:8420");
    await bridge.archonApprove("OC-001", "reviewer-1", "ok");
    await bridge.archonReject("OC-001", "reviewer-2", "nope");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:8420/api/tasks/OC-001/archon-approve",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-agora-human-provider": "discord",
          "x-agora-human-external-id": "reviewer-1",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8420/api/tasks/OC-001/archon-reject",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-agora-human-provider": "discord",
          "x-agora-human-external-id": "reviewer-2",
        }),
      }),
    );
  });
});
