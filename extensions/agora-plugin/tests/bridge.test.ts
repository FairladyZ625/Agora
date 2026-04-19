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

  it("throws a descriptive error when a successful response body is not valid json", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not-json", { status: 200 })));

    const bridge = new AgoraBridge("http://127.0.0.1:8420");
    await expect(bridge.listTasks()).rejects.toThrow(/invalid json response/i);
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

  it("posts task-scoped project context delivery requests to the ts delivery facade", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      scope: "project_context",
      delivery: {
        briefing: {
          project_id: "proj-ctx",
          audience: "craftsman",
          markdown: "# Project Context Briefing",
          source_documents: [],
        },
        reference_bundle: null,
        attention_routing_plan: null,
        runtime_delivery: {
          task_id: "OC-200",
          task_title: "Implement hybrid retrieval",
          workspace_path: "/tmp/proj-ctx/tasks/OC-200",
          manifest_path: "/tmp/proj-ctx/tasks/OC-200/04-context/runtime-delivery-manifest.md",
          artifact_paths: {
            controller: "/tmp/proj-ctx/tasks/OC-200/04-context/project-context-controller.md",
            citizen: "/tmp/proj-ctx/tasks/OC-200/04-context/project-context-citizen.md",
            craftsman: "/tmp/proj-ctx/tasks/OC-200/04-context/project-context-craftsman.md",
          },
        },
      },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const bridge = new AgoraBridge("http://127.0.0.1:8420", "sec-token");
    await bridge.getTaskContextDelivery({
      taskId: "OC-200",
      audience: "craftsman",
      allowedCitizenIds: ["citizen-alpha"],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8420/api/tasks/OC-200/context/delivery",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          audience: "craftsman",
          allowed_citizen_ids: ["citizen-alpha"],
        }),
        headers: expect.objectContaining({
          Authorization: "Bearer sec-token",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("posts current-thread task context delivery requests to the im-scoped delivery facade", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      scope: "project_context",
      delivery: {
        briefing: {
          project_id: "proj-ctx",
          audience: "controller",
          markdown: "# Project Context Briefing",
          source_documents: [],
        },
        reference_bundle: null,
        attention_routing_plan: null,
        runtime_delivery: null,
      },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const bridge = new AgoraBridge("http://127.0.0.1:8420");
    await bridge.getCurrentTaskContextDelivery({
      provider: "discord",
      threadRef: "thread-7",
      audience: "controller",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8420/api/im/tasks/current/context/delivery",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          provider: "discord",
          thread_ref: "thread-7",
          audience: "controller",
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

  it("sends human identity headers for archon review actions with the caller provider", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "OC-001" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const bridge = new AgoraBridge("http://127.0.0.1:8420");
    await bridge.archonApprove("OC-001", "reviewer-1", "feishu", "ok");
    await bridge.archonReject("OC-001", "reviewer-2", "slack", "nope");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:8420/api/tasks/OC-001/archon-approve",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-agora-human-provider": "feishu",
          "x-agora-human-external-id": "reviewer-1",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8420/api/tasks/OC-001/archon-reject",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-agora-human-provider": "slack",
          "x-agora-human-external-id": "reviewer-2",
        }),
      }),
    );
  });

  it("sends human identity headers for direct approve and reject actions when provider is present", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "OC-002" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const bridge = new AgoraBridge("http://127.0.0.1:8420");
    await bridge.approve("OC-002", "discord-user-1", "ship it", "discord");
    await bridge.reject("OC-003", "discord-user-2", "needs fixes", "discord");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:8420/api/tasks/OC-002/approve",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-agora-human-provider": "discord",
          "x-agora-human-external-id": "discord-user-1",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8420/api/tasks/OC-003/reject",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-agora-human-provider": "discord",
          "x-agora-human-external-id": "discord-user-2",
        }),
      }),
    );
  });

  it("posts thread-scoped current-task approval and rejection requests", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "OC-777" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const bridge = new AgoraBridge("http://127.0.0.1:8420");
    await bridge.approveCurrent({
      provider: "feishu",
      threadRef: "thread-7",
      actorId: "reviewer-1",
      comment: "ship it",
    });
    await bridge.rejectCurrent({
      provider: "slack",
      conversationRef: "channel-9",
      actorId: "reviewer-2",
      reason: "needs tests",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:8420/api/im/tasks/current/approve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          provider: "feishu",
          thread_ref: "thread-7",
          actor_id: "reviewer-1",
          comment: "ship it",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8420/api/im/tasks/current/reject",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          provider: "slack",
          conversation_ref: "channel-9",
          actor_id: "reviewer-2",
          reason: "needs tests",
        }),
      }),
    );
  });

  it("omits optional actor identity headers for current-task actions when actor/provider is missing", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "OC-778" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const bridge = new AgoraBridge("http://127.0.0.1:8420");
    await bridge.approveCurrent({
      threadRef: "thread-8",
    });
    await bridge.rejectCurrent({
      conversationRef: "channel-10",
      reason: "needs follow-up",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:8420/api/im/tasks/current/approve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          thread_ref: "thread-8",
          comment: "",
        }),
        headers: expect.not.objectContaining({
          "x-agora-human-provider": expect.anything(),
          "x-agora-human-external-id": expect.anything(),
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8420/api/im/tasks/current/reject",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          conversation_ref: "channel-10",
          reason: "needs follow-up",
        }),
        headers: expect.not.objectContaining({
          "x-agora-human-provider": expect.anything(),
          "x-agora-human-external-id": expect.anything(),
        }),
      }),
    );
  });

  it("returns an empty object for successful empty responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));

    const bridge = new AgoraBridge("http://127.0.0.1:8420");
    const payload = await (bridge as any).request("/api/empty-success");

    expect(payload).toEqual({});
  });

  it("falls back to the raw error body when json error payload does not contain detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "no detail field" }), { status: 422 })),
    );

    const bridge = new AgoraBridge("http://127.0.0.1:8420");
    await expect(bridge.listTasks()).rejects.toThrow('Agora API 422: {"message":"no detail field"}');
  });
});
