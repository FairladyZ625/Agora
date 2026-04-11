import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const { spawn } = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn,
}));

import {
  buildDiscordWebCreateArgs,
  DEFAULT_MIN_QUIET_MS,
  DEFAULT_SETTLE_TIMEOUT_MS,
  run,
  runSmokeDiscordWebCreateMain,
} from "./smoke-discord-web-create";

function createChildProcessStub() {
  const child = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof vi.fn>;
    killed: boolean;
  };
  child.killed = false;
  child.kill = vi.fn((signal?: string) => {
    if (signal === "SIGKILL" || signal === "SIGTERM") {
      child.killed = signal === "SIGKILL" ? true : child.killed;
    }
    return true;
  });
  return child;
}

afterEach(() => {
  spawn.mockReset();
  vi.restoreAllMocks();
});

describe("buildDiscordWebCreateArgs", () => {
  it("injects the task help + quoted-title create defaults before passthrough args", () => {
    expect(buildDiscordWebCreateArgs([])).toEqual([
      "scripts/smoke-discord-web-slash.ts",
      "--settle-timeout-ms",
      String(DEFAULT_SETTLE_TIMEOUT_MS),
      "--min-quiet-ms",
      String(DEFAULT_MIN_QUIET_MS),
      "--command",
      "/task",
      "--command",
      '/task create "quoted title regression check" coding',
    ]);
  });

  it("lets later passthrough args override defaults", () => {
    expect(buildDiscordWebCreateArgs(["--settle-timeout-ms", "5000"]).slice(-2)).toEqual([
      "--settle-timeout-ms",
      "5000",
    ]);
  });
});

describe("run", () => {
  it("spawns the wrapped command and resolves the child exit code", async () => {
    const child = createChildProcessStub();
    spawn.mockReturnValue(child);

    const pending = run("npx", ["tsx", "scripts/smoke-discord-web-slash.ts"], 100);
    child.emit("exit", 0);

    await expect(pending).resolves.toBe(0);
    expect(spawn).toHaveBeenCalledWith("npx", ["tsx", "scripts/smoke-discord-web-slash.ts"], expect.objectContaining({
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    }));
  });

  it("returns timeout code 124 and reports the timeout", async () => {
    vi.useFakeTimers();
    const stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const child = createChildProcessStub();
    spawn.mockReturnValue(child);

    const pending = run("npx", ["tsx", "noop"], 25);
    await vi.advanceTimersByTimeAsync(25);
    child.emit("exit", null);

    await expect(pending).resolves.toBe(124);
    expect(stderrWrite).toHaveBeenCalledWith("smoke-discord-web-create timed out after 25ms\n");
    vi.useRealTimers();
  });

  it("runs the wrapper main with the default command envelope", async () => {
    const child = createChildProcessStub();
    spawn.mockReturnValue(child);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const originalArgv = process.argv;

    process.argv = ["node", "/tmp/smoke-discord-web-create.ts", "--json"];

    const pending = runSmokeDiscordWebCreateMain();
    child.emit("exit", 0);
    await pending;

    expect(spawn).toHaveBeenCalledWith("npx", ["tsx", ...buildDiscordWebCreateArgs(["--json"])], expect.any(Object));
    expect(exitSpy).toHaveBeenCalledWith(0);

    process.argv = originalArgv;
  });
});
