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
});
