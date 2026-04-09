import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const { spawnSync } = vi.hoisted(() => ({
  spawnSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawnSync,
}));

describe("debug-plugin-native-slash entrypoint", () => {
  it("prints the diagnostic json when imported as the direct entrypoint", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agora-debug-plugin-entrypoint-"));
    const configPath = join(dir, "openclaw.json");
    writeFileSync(configPath, JSON.stringify({
      meta: { lastTouchedVersion: "1.4.2" },
      plugins: {
        installs: {
          agora: {
            sourcePath: "/repo/extensions/agora-plugin",
            installPath: "/repo/.openclaw/plugins/agora",
          },
        },
      },
    }), "utf8");

    const originalArgv = process.argv;
    const originalConfigPath = process.env.OPENCLAW_CONFIG_PATH;
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "healthy",
    });
    vi.stubGlobal("fetch", fetchMock);
    spawnSync.mockReturnValue({ status: 0, stdout: "OpenClaw 1.4.2\n", stderr: "" });

    try {
      vi.resetModules();
      process.argv = ["node", fileURLToPath(new URL("./debug-plugin-native-slash.ts", import.meta.url))];
      process.env.OPENCLAW_CONFIG_PATH = configPath;
      await import("./debug-plugin-native-slash");
      await Promise.resolve();

      expect(String(stdoutWrite.mock.calls.at(-1)?.[0])).toContain('"openclaw_cli_version": "1.4.2"');
      expect(String(stdoutWrite.mock.calls.at(-1)?.[0])).toContain('"gateway_health"');
    } finally {
      process.argv = originalArgv;
      if (originalConfigPath === undefined) {
        delete process.env.OPENCLAW_CONFIG_PATH;
      } else {
        process.env.OPENCLAW_CONFIG_PATH = originalConfigPath;
      }
      stdoutWrite.mockRestore();
    }
  });
});
