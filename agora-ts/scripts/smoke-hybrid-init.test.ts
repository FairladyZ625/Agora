import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../packages/config/src/env.js", () => ({
  findAgoraProjectRoot: vi.fn(),
  loadAgoraDotEnv: vi.fn(),
}));

import { findAgoraProjectRoot, loadAgoraDotEnv } from "../packages/config/src/env.js";
import { resolveHybridSmokeDefaults } from "./smoke-hybrid-init";

describe("resolveHybridSmokeDefaults", () => {
  beforeEach(() => {
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
});
