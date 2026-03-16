import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import process from "node:process";

const REPO_ROOT = "/Users/lizeyu/Projects/Agora";
const WRAPPER = "/Users/lizeyu/Projects/Agora/scripts/acpx-delegate.mjs";
const ENABLE_LIVE = process.env.AGORA_LIVE_ACPX_CLAUDE === "1";

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? REPO_ROOT,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Process terminated by signal ${signal}`));
        return;
      }
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

test("live Claude ACPX flows: opus exec and named Opus session remain usable", {
  skip: !ENABLE_LIVE,
  timeout: 5 * 60 * 1000,
}, async () => {
  const sessionName = `live-opus-${Date.now()}`;
  try {
    const execResult = await runCommand("node", [
      WRAPPER,
      "--profile", "claude-opus-safe",
      "--cwd", REPO_ROOT,
      "--timeout", "240",
      "--prompt", "Reply with exactly ACPX live opus exec ok. Do not use tools.",
    ]);
    assert.equal(execResult.code, 0, execResult.stderr || execResult.stdout);
    assert.match(execResult.stdout, /ACPX live opus exec ok/i);

    const freshSession = await runCommand("node", [
      WRAPPER,
      "--profile", "claude-session-opus-safe",
      "--session-name", sessionName,
      "--cwd", REPO_ROOT,
      "--timeout", "240",
      "--prompt", "Reply with exactly ACPX live opus session ok. Do not use tools.",
    ]);
    assert.equal(freshSession.code, 0, freshSession.stderr || freshSession.stdout);
    assert.match(freshSession.stdout, /ACPX live opus session ok/i);

    const followup = await runCommand("node", [
      WRAPPER,
      "--agent", "claude",
      "session",
      "--session-name", sessionName,
      "--cwd", REPO_ROOT,
      "--model", "opus",
      "--timeout", "240",
      "--prompt", "Reply with exactly ACPX live opus second turn ok. Do not use tools.",
    ]);
    assert.equal(followup.code, 0, followup.stderr || followup.stdout);
    assert.match(followup.stdout, /ACPX live opus second turn ok/i);
  } finally {
    await runCommand("acpx", [
      "claude",
      "sessions",
      "close",
      sessionName,
    ]);
  }
});
