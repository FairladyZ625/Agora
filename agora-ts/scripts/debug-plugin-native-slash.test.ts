import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { spawnSync } = vi.hoisted(() => ({
  spawnSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawnSync,
}));

import {
  describeLogFreshness,
  isLikelyRuntimeDrift,
  parseBoolean,
  probeGateway,
  readConfig,
  readOpenClawCliVersion,
} from "./debug-plugin-native-slash";

const tempPaths: string[] = [];

afterEach(() => {
  spawnSync.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  while (tempPaths.length > 0) {
    const dir = tempPaths.pop();
    if (dir && existsSync(dir)) {
      // handled by OS temp cleanup if directory already removed by test
    }
  }
});

describe("readConfig", () => {
  it("returns null for missing files", () => {
    expect(readConfig("/path/that/does/not/exist.json")).toBeNull();
  });

  it("parses existing OpenClaw config files", () => {
    const dir = mkdtempSync(join(tmpdir(), "agora-debug-plugin-slash-config-"));
    const path = join(dir, "openclaw.json");
    tempPaths.push(dir);
    writeFileSync(path, JSON.stringify({
      meta: { lastTouchedVersion: "1.2.3" },
      plugins: { load: { paths: ["/repo/plugin"] } },
    }), "utf8");

    expect(readConfig(path)).toMatchObject({
      meta: { lastTouchedVersion: "1.2.3" },
      plugins: { load: { paths: ["/repo/plugin"] } },
    });
  });
});

describe("parseBoolean", () => {
  it("understands booleans and string encodings", () => {
    expect(parseBoolean(true)).toBe(true);
    expect(parseBoolean(false)).toBe(false);
    expect(parseBoolean("true")).toBe(true);
    expect(parseBoolean(" 1 ")).toBe(true);
    expect(parseBoolean("false")).toBe(false);
    expect(parseBoolean("0")).toBe(false);
    expect(parseBoolean("maybe")).toBeNull();
  });
});

describe("describeLogFreshness", () => {
  it("marks missing log files as stale", () => {
    const result = describeLogFreshness("/path/that/does/not/exist.log", new Date("2026-03-25T15:30:00.000Z"));
    expect(result).toEqual({
      path: "/path/that/does/not/exist.log",
      exists: false,
      stale: true,
    });
  });

  it("reports age and stale status for existing logs", () => {
    const dir = mkdtempSync(join(tmpdir(), "agora-debug-plugin-slash-"));
    const logPath = join(dir, "gateway.log");
    tempPaths.push(dir);
    writeFileSync(logPath, "hello\n", "utf8");
    const result = describeLogFreshness(logPath, new Date(Date.now() + 2 * 60 * 60 * 1000));
    expect(result.exists).toBe(true);
    expect(result.stale).toBe(true);
    expect(result.ageMinutes).toBeGreaterThanOrEqual(119);
  });
});

describe("isLikelyRuntimeDrift", () => {
  it("flags version mismatch immediately", () => {
    expect(isLikelyRuntimeDrift(true, [])).toBe(true);
  });

  it("flags stale main logs plus fresh error log as runtime drift", () => {
    expect(
      isLikelyRuntimeDrift(false, [
        { path: "/tmp/gateway.log", exists: true, stale: true },
        { path: "/tmp/commands.log", exists: true, stale: true },
        { path: "/tmp/gateway.err.log", exists: true, stale: false },
      ]),
    ).toBe(true);
  });
});

describe("readOpenClawCliVersion", () => {
  it("extracts the CLI version from command output", () => {
    spawnSync.mockReturnValue({ status: 0, stdout: "OpenClaw 1.4.2\n", stderr: "" });

    expect(readOpenClawCliVersion()).toBe("1.4.2");
  });

  it("returns null when the command fails", () => {
    spawnSync.mockReturnValue({ status: 1, stdout: "", stderr: "not installed" });

    expect(readOpenClawCliVersion()).toBeNull();
  });
});

describe("probeGateway", () => {
  it("returns the gateway health payload on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "healthy",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(probeGateway("http://127.0.0.1:18789/health")).resolves.toEqual({
      ok: true,
      status: 200,
      body: "healthy",
      url: "http://127.0.0.1:18789/health",
    });
  });

  it("returns a structured error payload when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")));

    await expect(probeGateway("http://127.0.0.1:18789/health")).resolves.toEqual({
      ok: false,
      status: null,
      body: "connect ECONNREFUSED",
      url: "http://127.0.0.1:18789/health",
    });
  });
});
