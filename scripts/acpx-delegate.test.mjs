import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  buildClaudeSessionScopeKey,
  buildClaudeConfigOverride,
  buildCommonArgs,
  buildPromptPayloadArgs,
  buildSessionBootstrapArgs,
  buildSessionModelSetArgs,
  classifyClaudeSessionPromptState,
  enforceClaudeOpusSessionGuardrail,
  flattenClaudeSessionMessages,
  getClaudeConfigRoot,
  getClaudeSessionManifestPath,
  getRememberedClaudeSessionRouting,
  shouldRetryClaudeSessionPrompt,
  pruneClaudeConfigOverrides,
  parseArgs,
  readClaudeSessionManifest,
  rememberClaudeSessionRouting,
  writeClaudeSessionManifest,
} from "./acpx-delegate.mjs";

test("parseArgs requires agent and defaults to text/approve-all", () => {
  const parsed = parseArgs(["--agent", "codex", "exec", "--prompt", "hello"]);
  assert.equal(parsed.agent, "codex");
  assert.equal(parsed.mode, "exec");
  assert.equal(parsed.format, "text");
  assert.equal(parsed.model, null);
  assert.equal(parsed.permissionFlag, "--approve-all");
  assert.equal(parsed.prompt, "hello");
});

test("parseArgs applies claude-opus-safe profile defaults", () => {
  const parsed = parseArgs(["--profile", "claude-opus-safe", "--prompt", "review this"]);
  assert.equal(parsed.agent, "claude");
  assert.equal(parsed.mode, "exec");
  assert.equal(parsed.model, "opus");
  assert.equal(parsed.permissionFlag, "--approve-all");
  assert.equal(parsed.authPolicy, "fail");
  assert.equal(parsed.nonInteractivePermissions, "fail");
});

test("parseArgs accepts session mode, session name, and model", () => {
  const parsed = parseArgs([
    "--agent",
    "claude",
    "session",
    "--session-name",
    "review-auth",
    "--model",
    "sonnet",
    "check auth",
  ]);
  assert.equal(parsed.agent, "claude");
  assert.equal(parsed.mode, "session");
  assert.equal(parsed.sessionName, "review-auth");
  assert.equal(parsed.model, "sonnet");
  assert.equal(parsed.prompt, "check auth");
});

test("parseArgs applies claude-session-sonnet profile defaults without forcing a session model", () => {
  const parsed = parseArgs([
    "--profile", "claude-session-sonnet",
    "--session-name", "review-auth",
    "--prompt", "follow up",
  ]);
  assert.equal(parsed.agent, "claude");
  assert.equal(parsed.mode, "session");
  assert.equal(parsed.model, "sonnet");
  assert.equal(parsed.sessionName, "review-auth");
});

test("parseArgs applies claude-session-opus-safe profile defaults", () => {
  const parsed = parseArgs([
    "--profile", "claude-session-opus-safe",
    "--session-name", "review-auth",
    "--prompt", "follow up",
  ]);
  assert.equal(parsed.agent, "claude");
  assert.equal(parsed.mode, "session");
  assert.equal(parsed.model, "opus");
  assert.equal(parsed.freshSession, true);
});

test("parseArgs applies review-with-claude-opus recipe defaults", () => {
  const parsed = parseArgs([
    "--recipe", "review-with-claude-opus",
    "--prompt", "review this patch",
  ]);
  assert.equal(parsed.agent, "claude");
  assert.equal(parsed.mode, "exec");
  assert.equal(parsed.model, "opus");
  assert.equal(parsed.authPolicy, "fail");
});

test("parseArgs applies session-start-opus recipe defaults", () => {
  const parsed = parseArgs([
    "--recipe", "session-start-opus",
    "--session-name", "review-auth",
    "--prompt", "continue",
  ]);
  assert.equal(parsed.agent, "claude");
  assert.equal(parsed.mode, "session");
  assert.equal(parsed.model, "opus");
  assert.equal(parsed.freshSession, true);
});

test("parseArgs applies session-continue-sonnet recipe defaults", () => {
  const parsed = parseArgs([
    "--recipe", "session-continue-sonnet",
    "--session-name", "review-auth",
    "--prompt", "continue",
  ]);
  assert.equal(parsed.agent, "claude");
  assert.equal(parsed.mode, "session");
  assert.equal(parsed.model, "sonnet");
  assert.equal(parsed.freshSession, false);
});

test("parseArgs accepts extended ACPX flags", () => {
  const parsed = parseArgs([
    "--agent", "claude",
    "session",
    "--session-name", "review-auth",
    "--fresh-session",
    "--no-wait",
    "--allowed-tools", "read_file,search",
    "--max-turns", "4",
    "--auth-policy", "fail",
    "--non-interactive-permissions", "deny",
    "--file", "/tmp/prompt.txt",
  ]);
  assert.equal(parsed.freshSession, true);
  assert.equal(parsed.noWait, true);
  assert.equal(parsed.allowedTools, "read_file,search");
  assert.equal(parsed.maxTurns, "4");
  assert.equal(parsed.authPolicy, "fail");
  assert.equal(parsed.nonInteractivePermissions, "deny");
  assert.equal(parsed.file, "/tmp/prompt.txt");
});

test("buildCommonArgs enables json strict for json format", () => {
  const args = buildCommonArgs({
    cwd: "/tmp/project",
    permissionFlag: "--approve-reads",
    authPolicy: "skip",
    nonInteractivePermissions: "deny",
    format: "json",
    model: "gpt-5.4",
    allowedTools: "read_file,search",
    maxTurns: "6",
    timeout: "30",
    ttl: "10",
    verbose: false,
  });
  assert.deepEqual(args, [
    "--cwd", "/tmp/project",
    "--approve-reads",
    "--auth-policy", "skip",
    "--non-interactive-permissions", "deny",
    "--format", "json",
    "--model", "gpt-5.4",
    "--allowed-tools", "read_file,search",
    "--max-turns", "6",
    "--json-strict",
    "--timeout", "30",
    "--ttl", "10",
  ]);
});

test("buildCommonArgs can skip model forwarding for session mode", () => {
  const args = buildCommonArgs({
    cwd: "/tmp/project",
    permissionFlag: "--approve-reads",
    authPolicy: null,
    nonInteractivePermissions: null,
    format: "text",
    model: "opus",
    allowedTools: null,
    maxTurns: null,
    timeout: null,
    ttl: null,
    verbose: false,
  }, { includeModel: false });
  assert.deepEqual(args, [
    "--cwd", "/tmp/project",
    "--approve-reads",
    "--format", "text",
  ]);
});

test("buildSessionModelSetArgs still emits model sync for non-Claude named sessions", () => {
  const args = buildSessionModelSetArgs(["-y", "acpx@latest"], {
    agent: "codex",
    mode: "session",
    cwd: "/tmp/project",
    sessionName: "review-auth",
    model: "gpt-5.4",
    verbose: true,
  });
  assert.deepEqual(args, [
    "-y", "acpx@latest",
    "--cwd", "/tmp/project",
    "--format", "quiet",
    "--verbose",
    "codex",
    "set",
    "--session", "review-auth",
    "model", "gpt-5.4",
  ]);
});

test("buildSessionModelSetArgs skips Claude session model forcing entirely", () => {
  assert.equal(buildSessionModelSetArgs([], {
    agent: "claude",
    mode: "session",
    cwd: "/tmp/project",
    sessionName: "review-auth",
    model: "sonnet",
    verbose: false,
  }), null);
  assert.equal(buildSessionModelSetArgs([], {
    agent: "claude",
    mode: "session",
    cwd: "/tmp/project",
    sessionName: "review-auth",
    model: "opus",
    verbose: false,
  }), null);
});

test("buildClaudeConfigOverride creates a stable Claude config scope for session model bootstrapping", () => {
  const override = buildClaudeConfigOverride({
    agent: "claude",
    mode: "session",
    cwd: "/tmp/project",
    sessionName: "review-auth",
    model: "sonnet",
  });
  assert.ok(override);
  assert.equal(override.settings.model, "sonnet");
  assert.match(override.configDir, /\/\.agora\/acpx-delegate\/claude-config\/[0-9a-f]{12}$/);
  assert.equal(buildClaudeConfigOverride({
    agent: "codex",
    mode: "session",
    cwd: "/tmp/project",
    sessionName: "review-auth",
    model: "gpt-5.4",
  }), null);
});

test("getClaudeConfigRoot and manifest path stay under ~/.agora/acpx-delegate", () => {
  const root = getClaudeConfigRoot("/tmp/home");
  const manifest = getClaudeSessionManifestPath("/tmp/home");
  assert.equal(root, "/tmp/home/.agora/acpx-delegate/claude-config");
  assert.equal(manifest, "/tmp/home/.agora/acpx-delegate/claude-session-manifest.json");
});

test("rememberClaudeSessionRouting persists scoped Opus session metadata", () => {
  const home = mkdtempSync(resolve(tmpdir(), "acpx-delegate-home-"));
  try {
    const options = {
      cwd: "/tmp/project",
      sessionName: "review-auth",
      model: "opus",
    };
    rememberClaudeSessionRouting(options, {
      acpxRecordId: "record-1",
      acpSessionId: "session-1",
    }, home);
    const manifest = readClaudeSessionManifest(home);
    const key = buildClaudeSessionScopeKey(options);
    assert.equal(manifest.sessions[key].model, "opus");
    assert.equal(getRememberedClaudeSessionRouting(options, home).acpSessionId, "session-1");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("writeClaudeSessionManifest rewrites malformed state", () => {
  const home = mkdtempSync(resolve(tmpdir(), "acpx-delegate-home-"));
  try {
    writeClaudeSessionManifest({
      version: 1,
      sessions: {
        foo: { model: "sonnet" },
      },
    }, home);
    const manifest = readClaudeSessionManifest(home);
    assert.equal(manifest.sessions.foo.model, "sonnet");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("enforceClaudeOpusSessionGuardrail requires remembered fresh Opus bootstrap", () => {
  assert.throws(() => enforceClaudeOpusSessionGuardrail({
    agent: "claude",
    mode: "session",
    model: "opus",
    freshSession: false,
    resumeSession: null,
  }, null), /must start with --fresh-session/);

  assert.doesNotThrow(() => enforceClaudeOpusSessionGuardrail({
    agent: "claude",
    mode: "session",
    model: "opus",
    freshSession: true,
    resumeSession: null,
  }, null));

  assert.doesNotThrow(() => enforceClaudeOpusSessionGuardrail({
    agent: "claude",
    mode: "session",
    model: "opus",
    freshSession: false,
    resumeSession: null,
  }, { model: "opus" }));
});

test("flattenClaudeSessionMessages and classifyClaudeSessionPromptState inspect structured session state", () => {
  const sessionRecord = {
    messages: [
      {
        User: {
          content: [{ Text: "Reply with exactly ACPX opus session ok. Do not use tools." }],
        },
      },
      {
        Agent: {
          content: [{ Text: "ACPX opus session ok." }],
        },
      },
      {
        User: {
          content: [{ Text: "Reply with exactly ACPX second turn ok. Do not use tools." }],
        },
      },
    ],
  };
  assert.deepEqual(flattenClaudeSessionMessages(sessionRecord), [
    { role: "user", text: "Reply with exactly ACPX opus session ok. Do not use tools." },
    { role: "assistant", text: "ACPX opus session ok." },
    { role: "user", text: "Reply with exactly ACPX second turn ok. Do not use tools." },
  ]);
  assert.equal(
    classifyClaudeSessionPromptState(sessionRecord, "Reply with exactly ACPX second turn ok. Do not use tools."),
    "pending",
  );
  assert.equal(
    classifyClaudeSessionPromptState(sessionRecord, "Reply with exactly ACPX opus session ok. Do not use tools."),
    "answered",
  );
});

test("pruneClaudeConfigOverrides removes stale config dirs and keeps the active one", () => {
  const home = mkdtempSync(resolve(tmpdir(), "acpx-delegate-home-"));
  const root = getClaudeConfigRoot(home);
  const keepDir = resolve(root, "keep");
  const staleDir = resolve(root, "stale");
  const recentDir = resolve(root, "recent");
  try {
    mkdirSync(keepDir, { recursive: true });
    mkdirSync(staleDir, { recursive: true });
    mkdirSync(recentDir, { recursive: true });
    const oldMs = Date.now() - (8 * 24 * 60 * 60 * 1000);
    utimesSync(staleDir, oldMs / 1000, oldMs / 1000);
    pruneClaudeConfigOverrides(root, keepDir, Date.now());
    assert.doesNotThrow(() => statSync(keepDir));
    assert.throws(() => statSync(staleDir));
    assert.doesNotThrow(() => statSync(recentDir));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("buildSessionBootstrapArgs supports ensure, new, and resume-session", () => {
  const ensureArgs = buildSessionBootstrapArgs(["-y", "acpx@latest"], {
    agent: "claude",
    mode: "session",
    sessionName: "review-auth",
    freshSession: false,
    resumeSession: null,
  }, ["--cwd", "/tmp/project", "--approve-all", "--format", "text"]);
  assert.deepEqual(ensureArgs, [
    "-y", "acpx@latest",
    "--cwd", "/tmp/project",
    "--approve-all",
    "--format", "text",
    "claude",
    "sessions",
    "ensure",
    "--name", "review-auth",
  ]);

  const freshArgs = buildSessionBootstrapArgs(["acpx"], {
    agent: "claude",
    mode: "session",
    sessionName: "review-auth",
    freshSession: true,
    resumeSession: null,
  }, []);
  assert.deepEqual(freshArgs, [
    "acpx",
    "claude",
    "sessions",
    "new",
    "--name", "review-auth",
  ]);

  const resumeArgs = buildSessionBootstrapArgs(["acpx"], {
    agent: "claude",
    mode: "session",
    sessionName: "review-auth",
    freshSession: false,
    resumeSession: "session-123",
  }, []);
  assert.deepEqual(resumeArgs, [
    "acpx",
    "claude",
    "sessions",
    "ensure",
    "--name", "review-auth",
    "--resume-session", "session-123",
  ]);
});

test("buildPromptPayloadArgs prefers file passthrough over inline prompt", () => {
  assert.deepEqual(buildPromptPayloadArgs({
    file: "/tmp/prompt.txt",
  }, "ignored"), ["--file", "/tmp/prompt.txt"]);
  assert.deepEqual(buildPromptPayloadArgs({
    file: null,
  }, "hello"), ["hello"]);
});

test("shouldRetryClaudeSessionPrompt retries only on reconnect-only first pass", () => {
  assert.equal(shouldRetryClaudeSessionPrompt({
    agent: "claude",
    mode: "session",
  }, {
    code: 0,
    stdout: "[acpx] session foo · agent needs reconnect",
    stderr: "",
  }, {
    messages: [
      {
        User: {
          content: [{ Text: "review auth" }],
        },
      },
    ],
  }, "review auth"), true);

  assert.equal(shouldRetryClaudeSessionPrompt({
    agent: "claude",
    mode: "session",
  }, {
    code: 0,
    stdout: "ACPX session followup ok\n\n[done] end_turn",
    stderr: "",
  }, {
    messages: [
      {
        User: {
          content: [{ Text: "review auth" }],
        },
      },
      {
        Agent: {
          content: [{ Text: "ACPX session followup ok" }],
        },
      },
    ],
  }, "review auth"), false);

  assert.equal(shouldRetryClaudeSessionPrompt({
    agent: "claude",
    mode: "session",
  }, {
    code: 0,
    stdout: "[acpx] agent needs reconnect",
    stderr: "",
  }, null, "review auth"), false);

  assert.equal(shouldRetryClaudeSessionPrompt({
    agent: "claude",
    mode: "exec",
  }, {
    code: 0,
    stdout: "",
    stderr: "",
  }, {
    messages: [
      {
        User: {
          content: [{ Text: "review auth" }],
        },
      },
    ],
  }, "review auth"), false);
});

test("buildSessionModelSetArgs returns null when model sync is not needed", () => {
  assert.equal(buildSessionModelSetArgs([], {
    agent: "claude",
    mode: "exec",
    cwd: "/tmp/project",
    sessionName: null,
    model: "opus",
    verbose: false,
  }), null);
});

test("buildCommonArgs skips json strict for quiet format", () => {
  const args = buildCommonArgs({
    cwd: null,
    permissionFlag: "--deny-all",
    authPolicy: null,
    nonInteractivePermissions: null,
    format: "quiet",
    model: null,
    allowedTools: null,
    maxTurns: null,
    timeout: null,
    ttl: null,
    verbose: true,
  });
  assert.deepEqual(args, [
    "--deny-all",
    "--format", "quiet",
    "--verbose",
  ]);
});
