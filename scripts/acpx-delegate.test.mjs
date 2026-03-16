import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCommonArgs,
  buildPromptPayloadArgs,
  buildSessionBootstrapArgs,
  buildSessionModelSetArgs,
  parseArgs,
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
  assert.equal(parsed.model, null);
  assert.equal(parsed.sessionName, "review-auth");
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

test("buildSessionModelSetArgs emits internal model sync command for named sessions", () => {
  const args = buildSessionModelSetArgs(["-y", "acpx@latest"], {
    agent: "claude",
    mode: "session",
    cwd: "/tmp/project",
    sessionName: "review-auth",
    model: "opus",
    verbose: true,
  });
  assert.deepEqual(args, [
    "-y", "acpx@latest",
    "--cwd", "/tmp/project",
    "--format", "quiet",
    "--verbose",
    "claude",
    "set",
    "--session", "review-auth",
    "model", "opus",
  ]);
});

test("buildSessionModelSetArgs skips fragile Claude session model aliases", () => {
  assert.equal(buildSessionModelSetArgs([], {
    agent: "claude",
    mode: "session",
    cwd: "/tmp/project",
    sessionName: "review-auth",
    model: "sonnet",
    verbose: false,
  }), null);
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
