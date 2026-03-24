#!/usr/bin/env tsx
import process from "node:process";
import { spawn } from "node:child_process";

const DEFAULT_COMMANDS = [
  "/project list active",
  "/project show {{firstActiveProjectId}}",
  "/task list active",
  "/task status {{firstActiveTaskId}}",
  "/task",
  "/project",
];

async function main() {
  const passThroughArgs = process.argv.slice(2);
  const args = [
    "scripts/smoke-discord-web-slash.ts",
    ...DEFAULT_COMMANDS.flatMap((command) => ["--command", command]),
    ...passThroughArgs,
  ];
  const exitCode = await run("npx", ["tsx", ...args]);
  process.exit(exitCode);
}

async function run(command: string, args: string[]) {
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}

void main();
