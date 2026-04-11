#!/usr/bin/env tsx
import process from "node:process";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export const DEFAULT_GRAPH_SCENARIOS = ["branch", "complete", "timeout"] as const;
export const DEFAULT_PROCESS_TIMEOUT_MS = 120_000;

export async function runSmokeDiscordGraphRuntimeMain() {
  const passThroughArgs = process.argv.slice(2);
  for (const scenario of DEFAULT_GRAPH_SCENARIOS) {
    const exitCode = await run("npx", ["tsx", ...buildDiscordGraphRuntimeArgs(scenario, passThroughArgs)]);
    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  }
  process.exit(0);
}

export function buildDiscordGraphRuntimeArgs(
  scenario: typeof DEFAULT_GRAPH_SCENARIOS[number],
  passThroughArgs: string[],
) {
  return [
    "scripts/smoke-discord-inbound-action.ts",
    "--scenario",
    scenario,
    ...passThroughArgs,
  ];
}

export async function run(command: string, args: string[], timeoutMs = DEFAULT_PROCESS_TIMEOUT_MS) {
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    });
    let timedOut = false;
    const killTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 2_000).unref();
    }, timeoutMs);
    child.on("error", reject);
    child.on("exit", (code) => {
      clearTimeout(killTimer);
      if (timedOut) {
        process.stderr.write(`smoke-discord-graph-runtime timed out after ${timeoutMs}ms\n`);
        resolve(124);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

const isDirectExecution = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (isDirectExecution) {
  void runSmokeDiscordGraphRuntimeMain();
}
