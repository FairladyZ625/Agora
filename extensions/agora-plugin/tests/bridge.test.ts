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
});
