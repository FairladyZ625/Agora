#!/usr/bin/env tsx
import process from "node:process";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export const DEFAULT_COMMANDS = [
  { command: "/project list active" },
  { command: "/project show {{firstActiveProjectId}}" },
  { command: "/task list active" },
  { command: "/task status {{firstActiveTaskId}}" },
  { command: "/task" },
  { command: "/project", responder: "Codex Main" },
] as const;

export const DEFAULT_SETTLE_TIMEOUT_MS = 10_000;
export const DEFAULT_MIN_QUIET_MS = 1_500;
export const DEFAULT_PROCESS_TIMEOUT_MS = 75_000;

export async function runSmokeDiscordWebQueryMain() {
  const passThroughArgs = process.argv.slice(2);
  const args = buildDiscordWebQueryArgs(passThroughArgs);
  const exitCode = await run("npx", ["tsx", ...args]);
  process.exit(exitCode);
}

export function buildDiscordWebQueryArgs(passThroughArgs: string[]) {
  return [
    "scripts/smoke-discord-web-slash.ts",
    "--settle-timeout-ms",
    String(DEFAULT_SETTLE_TIMEOUT_MS),
    "--min-quiet-ms",
    String(DEFAULT_MIN_QUIET_MS),
    ...DEFAULT_COMMANDS.flatMap((command) => command.responder
      ? ["--command-responder", command.responder, "--command", command.command]
      : ["--command", command.command]),
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
        process.stderr.write(`smoke-discord-web-query timed out after ${timeoutMs}ms\n`);
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
  void runSmokeDiscordWebQueryMain();
}
