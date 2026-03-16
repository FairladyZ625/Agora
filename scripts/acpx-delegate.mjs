#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const SUPPORTED_AGENTS = new Set(["codex", "claude", "gemini"]);
const SUPPORTED_FORMATS = new Set(["json", "text", "quiet"]);
const SUPPORTED_PERMISSION_FLAGS = new Set(["--approve-all", "--approve-reads", "--deny-all"]);
const SUPPORTED_AUTH_POLICIES = new Set(["skip", "fail"]);
const SUPPORTED_NON_INTERACTIVE_PERMISSIONS = new Set(["deny", "fail"]);
const SUPPORTED_PROFILES = new Set(["claude-opus-safe", "claude-session-sonnet"]);

function printUsage() {
  process.stderr.write(
    [
      "Usage:",
      "  node scripts/acpx-delegate.mjs [--profile <claude-opus-safe|claude-session-sonnet>] --agent <codex|claude|gemini> exec [--cwd <path>] [--format <json|text|quiet>] [--model <id>] [--approve-all|--approve-reads|--deny-all] [--auth-policy <skip|fail>] [--non-interactive-permissions <deny|fail>] [--allowed-tools <list>] [--max-turns <count>] [--timeout <seconds>] [--ttl <seconds>] [--file <path> | --prompt <text> | <text...>]",
      "  node scripts/acpx-delegate.mjs [--profile <claude-opus-safe|claude-session-sonnet>] --agent <codex|claude|gemini> session --session-name <name> [--fresh-session | --resume-session <id>] [--cwd <path>] [--format <json|text|quiet>] [--model <id>] [--approve-all|--approve-reads|--deny-all] [--auth-policy <skip|fail>] [--non-interactive-permissions <deny|fail>] [--allowed-tools <list>] [--max-turns <count>] [--no-wait] [--timeout <seconds>] [--ttl <seconds>] [--file <path> | --prompt <text> | <text...>]",
      "",
      "Notes:",
      "  - Uses local `acpx` when available, otherwise falls back to `npx -y acpx@latest`.",
      "  - Reads prompt from stdin when `--prompt` and positional prompt text are omitted.",
      "  - `session` mode runs `sessions ensure` by default, `sessions new` with --fresh-session, or `sessions ensure --resume-session <id>` with --resume-session.",
      "  - This wrapper stays intentionally thin and only exposes shared ACPX flags.",
    ].join("\n") + "\n",
  );
}

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

export function parseArgs(argv) {
  const args = [...argv];
  const explicit = {
    agent: false,
    mode: false,
    format: false,
    model: false,
    permissionFlag: false,
    authPolicy: false,
    nonInteractivePermissions: false,
    allowedTools: false,
    maxTurns: false,
    timeout: false,
    ttl: false,
  };

  /** @type {{
   * profile: "claude-opus-safe" | "claude-session-sonnet" | null,
   * agent: "codex" | "claude" | "gemini" | null,
   * mode: "exec" | "session" | null,
   * cwd: string | null,
   * format: "json" | "text" | "quiet",
   * model: string | null,
   * sessionName: string | null,
   * file: string | null,
   * prompt: string | null,
   * permissionFlag: string | null,
   * authPolicy: "skip" | "fail" | null,
   * nonInteractivePermissions: "deny" | "fail" | null,
   * allowedTools: string | null,
   * maxTurns: string | null,
   * timeout: string | null,
   * ttl: string | null,
   * noWait: boolean,
   * freshSession: boolean,
   * resumeSession: string | null,
   * verbose: boolean
   * }} */
  const options = {
    profile: null,
    agent: null,
    mode: null,
    cwd: null,
    format: "text",
    model: null,
    sessionName: null,
    file: null,
    prompt: null,
    permissionFlag: "--approve-all",
    authPolicy: null,
    nonInteractivePermissions: null,
    allowedTools: null,
    maxTurns: null,
    timeout: null,
    ttl: null,
    noWait: false,
    freshSession: false,
    resumeSession: null,
    verbose: false,
  };

  const promptParts = [];
  while (args.length > 0) {
    const arg = args.shift();
    if (!arg) {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    if (arg === "--profile") {
      const profile = args.shift() ?? fail("Missing value for --profile");
      if (!SUPPORTED_PROFILES.has(profile)) {
        fail("Invalid --profile. Use claude-opus-safe or claude-session-sonnet.");
      }
      options.profile = profile;
      continue;
    }
    if (arg === "--agent") {
      const agent = args.shift() ?? fail("Missing value for --agent");
      if (!SUPPORTED_AGENTS.has(agent)) {
        fail("Invalid --agent. Use codex, claude, or gemini.");
      }
      options.agent = agent;
      explicit.agent = true;
      continue;
    }
    if (arg === "exec" || arg === "session") {
      if (options.mode) {
        fail("Specify only one mode: exec or session.");
      }
      options.mode = arg;
      explicit.mode = true;
      continue;
    }
    if (arg === "--cwd") {
      options.cwd = args.shift() ?? fail("Missing value for --cwd");
      continue;
    }
    if (arg === "--format") {
      const value = args.shift();
      if (!SUPPORTED_FORMATS.has(value)) {
        fail("Invalid --format. Use json, text, or quiet.");
      }
      options.format = value;
      explicit.format = true;
      continue;
    }
    if (arg === "--model") {
      options.model = args.shift() ?? fail("Missing value for --model");
      explicit.model = true;
      continue;
    }
    if (arg === "--session-name") {
      options.sessionName = args.shift() ?? fail("Missing value for --session-name");
      continue;
    }
    if (arg === "--file") {
      options.file = args.shift() ?? fail("Missing value for --file");
      continue;
    }
    if (arg === "--prompt") {
      options.prompt = args.shift() ?? fail("Missing value for --prompt");
      continue;
    }
    if (SUPPORTED_PERMISSION_FLAGS.has(arg)) {
      options.permissionFlag = arg;
      explicit.permissionFlag = true;
      continue;
    }
    if (arg === "--auth-policy") {
      const value = args.shift() ?? fail("Missing value for --auth-policy");
      if (!SUPPORTED_AUTH_POLICIES.has(value)) {
        fail("Invalid --auth-policy. Use skip or fail.");
      }
      options.authPolicy = value;
      explicit.authPolicy = true;
      continue;
    }
    if (arg === "--non-interactive-permissions") {
      const value = args.shift() ?? fail("Missing value for --non-interactive-permissions");
      if (!SUPPORTED_NON_INTERACTIVE_PERMISSIONS.has(value)) {
        fail("Invalid --non-interactive-permissions. Use deny or fail.");
      }
      options.nonInteractivePermissions = value;
      explicit.nonInteractivePermissions = true;
      continue;
    }
    if (arg === "--allowed-tools") {
      options.allowedTools = args.shift() ?? fail("Missing value for --allowed-tools");
      explicit.allowedTools = true;
      continue;
    }
    if (arg === "--max-turns") {
      options.maxTurns = args.shift() ?? fail("Missing value for --max-turns");
      explicit.maxTurns = true;
      continue;
    }
    if (arg === "--timeout") {
      options.timeout = args.shift() ?? fail("Missing value for --timeout");
      explicit.timeout = true;
      continue;
    }
    if (arg === "--ttl") {
      options.ttl = args.shift() ?? fail("Missing value for --ttl");
      explicit.ttl = true;
      continue;
    }
    if (arg === "--no-wait") {
      options.noWait = true;
      continue;
    }
    if (arg === "--fresh-session") {
      options.freshSession = true;
      continue;
    }
    if (arg === "--resume-session") {
      options.resumeSession = args.shift() ?? fail("Missing value for --resume-session");
      continue;
    }
    if (arg === "--verbose") {
      options.verbose = true;
      continue;
    }
    promptParts.push(arg);
  }

  applyProfileDefaults(options, explicit);
  if (!options.agent) {
    fail("Missing --agent <codex|claude|gemini>.");
  }
  if (!options.mode) {
    printUsage();
    process.exit(1);
  }
  if (options.mode === "session" && !options.sessionName) {
    fail("session mode requires --session-name <name>");
  }
  if (options.mode === "exec" && options.noWait) {
    fail("--no-wait is only valid in session mode.");
  }
  if (options.freshSession && options.resumeSession) {
    fail("Use only one of --fresh-session or --resume-session.");
  }
  if (options.mode !== "session" && (options.freshSession || options.resumeSession)) {
    fail("--fresh-session and --resume-session are only valid in session mode.");
  }
  if (!options.prompt && promptParts.length > 0) {
    options.prompt = promptParts.join(" ");
  }
  if (options.file && options.prompt) {
    fail("Use either --file or --prompt, not both.");
  }
  if (options.file && promptParts.length > 0) {
    fail("Use either --file or positional prompt text, not both.");
  }

  return options;
}

function applyProfileDefaults(options, explicit) {
  if (!options.profile) {
    return;
  }

  if (options.profile === "claude-opus-safe") {
    if (!explicit.agent) {
      options.agent = "claude";
    }
    if (!explicit.mode) {
      options.mode = "exec";
    }
    if (!explicit.model) {
      options.model = "opus";
    }
    if (!explicit.permissionFlag) {
      options.permissionFlag = "--approve-all";
    }
    if (!explicit.format) {
      options.format = "text";
    }
    if (!explicit.authPolicy) {
      options.authPolicy = "fail";
    }
    if (!explicit.nonInteractivePermissions) {
      options.nonInteractivePermissions = "fail";
    }
    return;
  }

  if (options.profile === "claude-session-sonnet") {
    if (!explicit.agent) {
      options.agent = "claude";
    }
    if (!explicit.mode) {
      options.mode = "session";
    }
    if (!explicit.model) {
      options.model = "sonnet";
    }
    if (!explicit.permissionFlag) {
      options.permissionFlag = "--approve-all";
    }
    if (!explicit.format) {
      options.format = "text";
    }
    if (!explicit.authPolicy) {
      options.authPolicy = "fail";
    }
    if (!explicit.nonInteractivePermissions) {
      options.nonInteractivePermissions = "fail";
    }
  }
}

export async function readPrompt(options) {
  if (options.file) {
    return null;
  }
  if (options.prompt) {
    return options.prompt;
  }

  if (process.stdin.isTTY) {
    fail("No prompt provided. Pass --prompt <text>, positional text, or pipe stdin.");
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  }
  const prompt = chunks.join("").trim();
  if (!prompt) {
    fail("Prompt from stdin is empty.");
  }
  return prompt;
}

export function resolveAcpxCommand() {
  const probe = spawnSync("acpx", ["--version"], {
    stdio: "ignore",
  });
  if (!probe.error && probe.status === 0) {
    return { command: "acpx", args: [] };
  }

  const npxProbe = spawnSync("npx", ["--version"], {
    stdio: "ignore",
  });
  if (!npxProbe.error && npxProbe.status === 0) {
    return { command: "npx", args: ["-y", "acpx@latest"] };
  }

  fail("Neither `acpx` nor `npx` is available. Install Node.js/npm or install `acpx` first.");
}

export function buildCommonArgs(options, config = {}) {
  const { includeModel = true } = config;
  const args = [];
  if (options.cwd) {
    args.push("--cwd", options.cwd);
  }
  if (options.permissionFlag) {
    args.push(options.permissionFlag);
  }
  if (options.authPolicy) {
    args.push("--auth-policy", options.authPolicy);
  }
  if (options.nonInteractivePermissions) {
    args.push("--non-interactive-permissions", options.nonInteractivePermissions);
  }
  args.push("--format", options.format);
  if (includeModel && options.model) {
    args.push("--model", options.model);
  }
  if (options.allowedTools !== null) {
    args.push("--allowed-tools", options.allowedTools);
  }
  if (options.maxTurns) {
    args.push("--max-turns", options.maxTurns);
  }
  if (options.format === "json") {
    args.push("--json-strict");
  }
  if (options.timeout) {
    args.push("--timeout", options.timeout);
  }
  if (options.ttl) {
    args.push("--ttl", options.ttl);
  }
  if (options.verbose) {
    args.push("--verbose");
  }
  return args;
}

export function buildSessionModelSetArgs(acpxArgs, options) {
  if (options.mode !== "session" || !options.sessionName || !options.model) {
    return null;
  }
  if (options.agent === "claude") {
    return null;
  }

  const args = [...acpxArgs];
  if (options.cwd) {
    args.push("--cwd", options.cwd);
  }
  args.push("--format", "quiet");
  if (options.verbose) {
    args.push("--verbose");
  }
  args.push(
    options.agent,
    "set",
    "--session",
    options.sessionName,
    "model",
    options.model,
  );
  return args;
}

export function buildSessionBootstrapArgs(acpxArgs, options, commonArgs) {
  if (options.mode !== "session" || !options.sessionName) {
    return null;
  }

  const args = [
    ...acpxArgs,
    ...commonArgs,
    options.agent,
    "sessions",
    options.freshSession ? "new" : "ensure",
    "--name",
    options.sessionName,
  ];

  if (options.resumeSession) {
    args.push("--resume-session", options.resumeSession);
  }

  return args;
}

export function buildPromptPayloadArgs(options, prompt) {
  if (options.file) {
    return ["--file", options.file];
  }
  return [prompt];
}

export function emitWrapperWarnings(options) {
  if (options.agent === "claude" && options.mode === "session" && options.model === "opus") {
    if (options.resumeSession) {
      process.stderr.write("[acpx-delegate] Warning: claude session + opus + resume-session is the least reliable Opus-routing path on this machine.\n");
      return;
    }
    if (!options.freshSession) {
      process.stderr.write("[acpx-delegate] Warning: claude session + opus without --fresh-session may reuse an older session and drift away from Opus routing.\n");
    }
  }
  if (options.agent === "claude" && options.mode === "session" && options.model === "sonnet") {
    process.stderr.write("[acpx-delegate] Info: claude session + sonnet will be bootstrapped via a wrapper-managed CLAUDE_CONFIG_DIR default model, not session/set_config_option.\n");
  }
}

export function shouldRetryClaudeSessionPrompt(options, runResult) {
  if (options.agent !== "claude" || options.mode !== "session" || runResult.code !== 0) {
    return false;
  }
  const combinedOutput = `${runResult.stdout}\n${runResult.stderr}`;
  return combinedOutput.includes("agent needs reconnect") && !combinedOutput.includes("[done] end_turn");
}

export function buildClaudeConfigOverride(options) {
  if (options.agent !== "claude" || options.mode !== "session" || !options.model) {
    return null;
  }

  const scope = JSON.stringify({
    cwd: resolve(options.cwd ?? process.cwd()),
    sessionName: options.sessionName ?? "__default__",
    model: options.model,
  });
  const digest = createHash("sha1").update(scope).digest("hex").slice(0, 12);
  const configDir = resolve(
    homedir(),
    ".agora",
    "acpx-delegate",
    "claude-config",
    digest,
  );
  const settingsPath = resolve(configDir, "settings.json");
  return {
    configDir,
    settingsPath,
    settings: {
      model: options.model,
    },
  };
}

export function prepareInvocationEnv(options) {
  const env = { ...process.env };
  const override = buildClaudeConfigOverride(options);
  if (!override) {
    return env;
  }

  mkdirSync(dirname(override.settingsPath), { recursive: true });
  writeFileSync(override.settingsPath, `${JSON.stringify(override.settings, null, 2)}\n`, "utf8");
  env.CLAUDE_CONFIG_DIR = override.configDir;
  return env;
}

export function spawnChecked(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Process terminated by signal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

export function spawnObserved(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["inherit", "pipe", "pipe"],
      env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      stderr += text;
      process.stderr.write(text);
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

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const prompt = await readPrompt(options);
  const acpx = resolveAcpxCommand();
  const invocationEnv = prepareInvocationEnv(options);
  const commonArgs = buildCommonArgs(options, {
    includeModel: options.mode !== "session",
  });

  emitWrapperWarnings(options);

  if (options.mode === "session") {
    const bootstrapArgs = buildSessionBootstrapArgs(acpx.args, options, commonArgs);
    if (bootstrapArgs) {
      const ensureCode = await spawnChecked(acpx.command, bootstrapArgs, invocationEnv);
      if (ensureCode !== 0) {
        process.exit(ensureCode);
      }
    }

    const modelSetArgs = buildSessionModelSetArgs(acpx.args, options);
    if (modelSetArgs) {
      const setCode = await spawnChecked(acpx.command, modelSetArgs, invocationEnv);
      if (setCode !== 0) {
        process.exit(setCode);
      }
    }
  }

  const runArgs = [
    ...acpx.args,
    ...commonArgs,
    options.agent,
  ];

  if (options.mode === "exec") {
    runArgs.push("exec", ...buildPromptPayloadArgs(options, prompt));
  } else {
    if (options.noWait) {
      runArgs.push("--no-wait");
    }
    runArgs.push("-s", options.sessionName, ...buildPromptPayloadArgs(options, prompt));
  }

  const firstRun = await spawnObserved(acpx.command, runArgs, invocationEnv);
  if (shouldRetryClaudeSessionPrompt(options, firstRun)) {
    process.stderr.write("[acpx-delegate] Claude session reported reconnect on the first pass; retrying the prompt once.\n");
    const retryRun = await spawnObserved(acpx.command, runArgs, invocationEnv);
    process.exit(retryRun.code);
  }

  process.exit(firstRun.code);
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
