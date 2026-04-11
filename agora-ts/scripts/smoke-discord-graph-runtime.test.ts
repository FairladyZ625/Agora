import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const { spawn } = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn,
}));

import {
  buildDiscordGraphRuntimeArgs,
  DEFAULT_GRAPH_SCENARIOS,
  run,
  runSmokeDiscordGraphRuntimeMain,
} from "./smoke-discord-graph-runtime";

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

describe("buildDiscordGraphRuntimeArgs", () => {
  it("builds a scenario-specific inbound smoke invocation", () => {
    expect(buildDiscordGraphRuntimeArgs("timeout", ["--timeout-ms", "5000"])).toEqual([
      "scripts/smoke-discord-inbound-action.ts",
      "--scenario",
      "timeout",
      "--timeout-ms",
      "5000",
    ]);
  });
});

describe("run", () => {
  it("spawns the wrapped command and resolves the child exit code", async () => {
    const child = createChildProcessStub();
    spawn.mockReturnValue(child);

    const pending = run("npx", ["tsx", "scripts/smoke-discord-inbound-action.ts"]);
    child.emit("exit", 0);

    await expect(pending).resolves.toBe(0);
    expect(spawn).toHaveBeenCalledWith("npx", ["tsx", "scripts/smoke-discord-inbound-action.ts"], expect.objectContaining({
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    }));
  });
});

describe("runSmokeDiscordGraphRuntimeMain", () => {
  it("runs branch, complete, and timeout graph scenarios in order", async () => {
    const first = createChildProcessStub();
    const second = createChildProcessStub();
    const third = createChildProcessStub();
    spawn
      .mockImplementationOnce(() => {
        queueMicrotask(() => first.emit("exit", 0));
        return first;
      })
      .mockImplementationOnce(() => {
        queueMicrotask(() => second.emit("exit", 0));
        return second;
      })
      .mockImplementationOnce(() => {
        queueMicrotask(() => third.emit("exit", 0));
        return third;
      });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const originalArgv = process.argv;

    process.argv = ["node", "/tmp/smoke-discord-graph-runtime.ts", "--json"];

    const pending = runSmokeDiscordGraphRuntimeMain();
    await pending;

    expect(DEFAULT_GRAPH_SCENARIOS).toEqual(["branch", "complete", "timeout"]);
    expect(spawn.mock.calls.map((call) => call[1])).toEqual([
      ["tsx", ...buildDiscordGraphRuntimeArgs("branch", ["--json"])],
      ["tsx", ...buildDiscordGraphRuntimeArgs("complete", ["--json"])],
      ["tsx", ...buildDiscordGraphRuntimeArgs("timeout", ["--json"])],
    ]);
    expect(exitSpy).toHaveBeenCalledWith(0);

    process.argv = originalArgv;
  });
});
