import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const { spawn } = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn,
}));

import {
  buildDiscordWebQueryArgs,
  DEFAULT_MIN_QUIET_MS,
  DEFAULT_SETTLE_TIMEOUT_MS,
  run,
  runSmokeDiscordWebQueryMain,
} from "./smoke-discord-web-query";

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

describe("buildDiscordWebQueryArgs", () => {
  it("injects tighter query-suite settle defaults before the default commands", () => {
    expect(buildDiscordWebQueryArgs([])).toEqual([
      "scripts/smoke-discord-web-slash.ts",
      "--settle-timeout-ms",
      String(DEFAULT_SETTLE_TIMEOUT_MS),
      "--min-quiet-ms",
      String(DEFAULT_MIN_QUIET_MS),
      "--command",
      "/project list active",
      "--command",
      "/project show {{firstActiveProjectId}}",
      "--command",
      "/task list active",
      "--command",
      "/task status {{firstActiveTaskId}}",
      "--command",
      "/task",
      "--command-responder",
      "Codex Main",
      "--command",
      "/project",
    ]);
  });

  it("lets later passthrough args override defaults", () => {
    expect(buildDiscordWebQueryArgs(["--settle-timeout-ms", "5000"]).slice(-2)).toEqual([
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

  it("falls back to exit code 1 when the child exits without a code", async () => {
    const child = createChildProcessStub();
    spawn.mockReturnValue(child);

    const pending = run("npx", ["tsx", "noop"], 100);
    child.emit("exit", null);

    await expect(pending).resolves.toBe(1);
  });

  it("rejects when the child process emits an error", async () => {
    const child = createChildProcessStub();
    spawn.mockReturnValue(child);

    const pending = run("npx", ["tsx", "noop"], 100);
    child.emit("error", new Error("spawn failed"));

    await expect(pending).rejects.toThrow("spawn failed");
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
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(stderrWrite).toHaveBeenCalledWith("smoke-discord-web-query timed out after 25ms\n");
    vi.useRealTimers();
  });

  it("escalates to SIGKILL when the child ignores SIGTERM after timeout", async () => {
    vi.useFakeTimers();
    const child = createChildProcessStub();
    child.kill = vi.fn(() => true);
    spawn.mockReturnValue(child);

    const pending = run("npx", ["tsx", "noop"], 25);
    await vi.advanceTimersByTimeAsync(25);
    await vi.advanceTimersByTimeAsync(2_000);
    child.emit("exit", null);

    await expect(pending).resolves.toBe(124);
    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
    vi.useRealTimers();
  });

  it("runs the wrapper main with the default command envelope", async () => {
    const child = createChildProcessStub();
    spawn.mockReturnValue(child);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const originalArgv = process.argv;

    process.argv = ["node", "/tmp/smoke-discord-web-query.ts", "--json"];

    const pending = runSmokeDiscordWebQueryMain();
    child.emit("exit", 0);
    await pending;

    expect(spawn).toHaveBeenCalledWith("npx", ["tsx", ...buildDiscordWebQueryArgs(["--json"])], expect.any(Object));
    expect(exitSpy).toHaveBeenCalledWith(0);

    process.argv = originalArgv;
  });
});
