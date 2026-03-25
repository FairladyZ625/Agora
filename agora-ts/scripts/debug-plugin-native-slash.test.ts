import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeLogFreshness, isLikelyRuntimeDrift } from "./debug-plugin-native-slash";

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
