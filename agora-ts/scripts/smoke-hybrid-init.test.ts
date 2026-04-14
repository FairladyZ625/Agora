import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { parseAsync, createCliProgram, setupHybridRetrieval } = vi.hoisted(() => {
  const parseAsync = vi.fn();
  const createCliProgram = vi.fn(() => ({ parseAsync }));
  const setupHybridRetrieval = vi.fn();
  return { parseAsync, createCliProgram, setupHybridRetrieval };
});

vi.mock("../packages/config/src/env.js", () => ({
  findAgoraProjectRoot: vi.fn(),
  loadAgoraDotEnv: vi.fn(),
}));

vi.mock("../apps/cli/src/index.js", () => ({
  createCliProgram,
}));

vi.mock("../apps/cli/src/hybrid-retrieval-setup.js", () => ({
  setupHybridRetrieval,
}));

import { findAgoraProjectRoot, loadAgoraDotEnv } from "../packages/config/src/env.js";
import { BufferStream, requireOption, resolveHybridSmokeDefaults, runCli, runSmokeHybridInitMain } from "./smoke-hybrid-init";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("resolveHybridSmokeDefaults", () => {
  beforeEach(() => {
    parseAsync.mockReset();
    createCliProgram.mockClear();
    setupHybridRetrieval.mockReset();
    vi.mocked(findAgoraProjectRoot).mockReturnValue("/repo");
    vi.mocked(loadAgoraDotEnv).mockReturnValue({
      OPENAI_API_KEY: "file-key",
      OPENAI_BASE_URL: "https://open.bigmodel.cn/api/paas/v4/",
      OPENAI_EMBEDDING_MODEL: "embedding-3",
      OPENAI_EMBEDDING_DIMENSION: "2048",
      QDRANT_URL: "http://127.0.0.1:6333",
      QDRANT_API_KEY: "qdrant-file-key",
    });
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_EMBEDDING_MODEL;
    delete process.env.OPENAI_EMBEDDING_DIMENSION;
    delete process.env.QDRANT_URL;
    delete process.env.QDRANT_API_KEY;
  });

  it("falls back to root .env values when the invoking shell is empty", () => {
    expect(resolveHybridSmokeDefaults("/repo/agora-ts")).toEqual({
      projectRoot: "/repo",
      rootEnvPath: "/repo/.env",
      apiKey: "file-key",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4/",
      model: "embedding-3",
      dimension: "2048",
      qdrantUrl: "http://127.0.0.1:6333",
      qdrantApiKey: "qdrant-file-key",
    });
  });

  it("lets process env override root .env defaults", () => {
    process.env.OPENAI_API_KEY = "runtime-key";
    process.env.QDRANT_URL = "http://runtime-qdrant:6333";

    expect(resolveHybridSmokeDefaults("/repo/agora-ts")).toMatchObject({
      apiKey: "runtime-key",
      qdrantUrl: "http://runtime-qdrant:6333",
    });
  });

  it("buffers output chunks in insertion order", () => {
    const stream = new BufferStream();
    stream.write("hello");
    stream.write(" world");

    expect(stream.toString()).toBe("hello world");
  });

  it("requires non-empty option values", () => {
    expect(requireOption("  value  ", "OPENAI_API_KEY")).toBe("value");
    expect(() => requireOption("   ", "OPENAI_API_KEY")).toThrow("OPENAI_API_KEY is required");
  });

  it("runs the CLI with injected stdout and stderr streams", async () => {
    parseAsync.mockResolvedValue(undefined);
    process.exitCode = undefined;

    const result = await runCli(["projects", "list"], {
      configPath: "/tmp/agora.json",
      dbPath: "/tmp/agora.db",
    });

    expect(createCliProgram).toHaveBeenCalledWith(expect.objectContaining({
      configPath: "/tmp/agora.json",
      dbPath: "/tmp/agora.db",
      stdout: expect.any(BufferStream),
      stderr: expect.any(BufferStream),
    }));
    expect(parseAsync).toHaveBeenCalledWith(["projects", "list"], { from: "user" });
    expect(result.exitCode).toBe(0);
  });

  it("surfaces CLI failures from process.exitCode", async () => {
    parseAsync.mockImplementation(async () => {
      process.exitCode = 2;
    });

    await expect(runCli(["projects", "list"], {
      configPath: "/tmp/agora.json",
      dbPath: "/tmp/agora.db",
    })).rejects.toThrow("cli command failed: projects list");
  });

  it("runs the full smoke flow and prints the summary payload", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "agora-smoke-project-"));
    tempDirs.push(projectRoot);
    const envPath = join(projectRoot, ".env");
    writeFileSync(envPath, "KEEP=1\n", "utf8");
    vi.mocked(findAgoraProjectRoot).mockReturnValue(projectRoot);
    vi.mocked(loadAgoraDotEnv).mockReturnValue({
      OPENAI_API_KEY: "",
      OPENAI_BASE_URL: "",
      OPENAI_EMBEDDING_MODEL: "",
      OPENAI_EMBEDDING_DIMENSION: "",
      QDRANT_URL: "",
      QDRANT_API_KEY: "",
    });
    setupHybridRetrieval.mockResolvedValue(undefined);
    createCliProgram.mockImplementation(({ stdout }) => ({
      parseAsync: vi.fn(async (args: string[]) => {
        if (args[0] === "create") {
          stdout.write("任务已创建: task-123\n");
          return;
        }
        if (args[0] === "projects" && args[1] === "brain" && args[2] === "index") {
          stdout.write(JSON.stringify({ queued: 1 }));
          return;
        }
        if (args[0] === "projects" && args[1] === "brain" && args[2] === "query") {
          stdout.write(JSON.stringify({
            retrieval_mode: "hybrid",
            results: [{ slug: "runtime-boundary" }],
          }));
          return;
        }
        if (args[0] === "context" && args[1] === "briefing") {
          stdout.write(JSON.stringify({
            source_documents: [{ kind: "decision", slug: "runtime-boundary" }],
          }));
        }
      }),
    }));
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const originalArgv = process.argv;

    process.argv = [
      "node",
      "/tmp/smoke-hybrid-init.ts",
      "--api-key",
      "hybrid-key",
      "--base-url",
      "https://api.example.com/v1",
      "--model",
      "embedding-3",
      "--dimension",
      "2048",
    ];

    try {
      await runSmokeHybridInitMain();
    } finally {
      process.argv = originalArgv;
    }

    expect(setupHybridRetrieval).toHaveBeenCalledWith({
      envPath,
      embedding: {
        apiKey: "hybrid-key",
        baseUrl: "https://api.example.com/v1",
        model: "embedding-3",
        dimension: "2048",
      },
      qdrantUrl: undefined,
      qdrantApiKey: undefined,
    });
    expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('"task_id": "task-123"'));
    expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('"top_hit": "runtime-boundary"'));
    expect(readFileSync(envPath, "utf8")).toBe("KEEP=1\n");
    expect(existsSync(join(projectRoot, "agora-ai-brain"))).toBe(false);
    stdoutWrite.mockRestore();
  });
});
