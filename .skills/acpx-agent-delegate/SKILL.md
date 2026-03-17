---
name: acpx-agent-delegate
description: Use when delegating focused coding, review, or repository questions through ACPX in Agora, especially when you need explicit agent selection, safer Claude model routing, named session handling, or Agora-specific wrapper defaults.
---

# ACPX Agent Delegate

## When to use

Use this skill when working in `/Users/lizeyu/Projects/Agora` and you want a thin ACPX-based delegation path for `codex`, `claude`, or `gemini`.

Use it for:

- one-shot coding, review, and analysis prompts
- named ACPX sessions inside the Agora repo
- explicit Claude `opus` / `sonnet` selection
- scripted delegation through the local Agora wrapper

Do not use it for:

- broad multi-agent orchestration
- OpenClaw thread-binding workflows
- tasks that require the delegated agent to join IM discussion directly

In Agora terms, this is an `execution-only` delegation surface.

## What this skill is

This skill is a local Agora wrapper around ACPX, not a replacement for ACPX itself.

Base ACPX semantics should follow the upstream skill at:

- `/Users/lizeyu/Projects/acpx/skills/acpx/SKILL.md`

This skill adds Agora-local conventions:

- fixed wrapper entrypoint
- default full-permission mode
- Claude routing guardrails
- explicit first-turn session strategy
- wrapper-managed `CLAUDE_CONFIG_DIR` bootstrap for Claude session defaults
- structured Claude session inspection after each turn
- one automatic retry when the latest structured Claude session state shows the prompt was not answered yet
- wrapper-tracked Opus session manifests per `(cwd, sessionName)` scope
- local caveats around Claude named sessions

This is now the primary execution skill in Agora.

- use this skill for direct execution/delegation
- do not reach for tmux first
- treat tmux as archived legacy debug transport only

## Command model

The wrapper exposes two modes:

```bash
node /Users/lizeyu/Projects/Agora/scripts/acpx-delegate.mjs \
  --agent <codex|claude|gemini> \
  exec|session \
  [wrapper options] \
  --prompt "..."
```

Wrapper examples:

```bash
node /Users/lizeyu/Projects/Agora/scripts/acpx-delegate.mjs \
  --agent codex \
  exec \
  --cwd /Users/lizeyu/Projects/Agora \
  --prompt "Summarize the failing tests."
```

```bash
node /Users/lizeyu/Projects/Agora/scripts/acpx-delegate.mjs \
  --agent claude \
  session \
  --session-name review-auth \
  --fresh-session \
  --cwd /Users/lizeyu/Projects/Agora \
  --model sonnet \
  --prompt "Review the auth module and list the top 3 risks."
```

## Default behavior

Wrapper defaults on this machine:

- prefers local `acpx`, falls back to `npx -y acpx@latest`
- supports `codex`, `claude`, and `gemini`
- defaults to `--approve-all`
- defaults to `text` output

Permission note:

- In ACPX terms, `--approve-all` is the closest equivalent to native Claude `--dangerously-skip-permissions`
- This wrapper still talks to ACPX, not directly to the native `claude` CLI

Output note:

- `text` is the default because current `acpx` / `claude-agent-acp` combinations may emit noisy warnings around otherwise-successful runs

## Exposed wrapper options

The Agora wrapper now exposes the ACPX controls that matter in practice:

- `--profile <claude-opus-safe|claude-session-sonnet|claude-session-opus-safe>`
- `--fresh-session`
- `--resume-session <id>`
- `--no-wait` for queued persistent prompts
- `--allowed-tools <comma,separated,list>`
- `--max-turns <count>`
- `--auth-policy <skip|fail>`
- `--non-interactive-permissions <deny|fail>`
- `--file <path>`

Use them instead of dropping straight to raw `acpx` unless you need a provider-specific knob that the wrapper still does not expose.

## Fast recipes

If you want the shortest path and do not want to remember profile names, use recipes:

- `--recipe review-with-claude-opus`
- `--recipe plan-with-claude-opus`
- `--recipe session-start-sonnet`
- `--recipe session-continue-sonnet`
- `--recipe session-start-opus`
- `--recipe session-continue-opus`

Examples:

```bash
node /Users/lizeyu/Projects/Agora/scripts/acpx-delegate.mjs \
  --recipe review-with-claude-opus \
  --cwd /Users/lizeyu/Projects/Agora \
  --prompt "Review this patch and list the top 3 risks."
```

```bash
node /Users/lizeyu/Projects/Agora/scripts/acpx-delegate.mjs \
  --recipe session-start-opus \
  --session-name architecture-pass \
  --cwd /Users/lizeyu/Projects/Agora \
  --prompt "Create a focused architecture plan."
```

```bash
node /Users/lizeyu/Projects/Agora/scripts/acpx-delegate.mjs \
  --recipe session-continue-opus \
  --session-name architecture-pass \
  --cwd /Users/lizeyu/Projects/Agora \
  --prompt "Tighten the top 3 risks."
```

## Recommended Claude profiles

### `claude-opus-safe`

Use when you want the safest current Opus path.

Defaults:

- `--agent claude`
- `exec`
- `--model opus`
- `--approve-all`
- `--format text`
- `--auth-policy fail`
- `--non-interactive-permissions fail`

Example:

```bash
node /Users/lizeyu/Projects/Agora/scripts/acpx-delegate.mjs \
  --profile claude-opus-safe \
  --cwd /Users/lizeyu/Projects/Agora \
  --prompt "Analyze the root cause and propose the smallest safe fix."
```

### `claude-session-sonnet`

Use when you want continuity and accept that you are optimizing for stable follow-up turns, not strongest-model proof.

Defaults:

- `--agent claude`
- `session`
- `--approve-all`
- `--format text`
- `--auth-policy fail`
- `--non-interactive-permissions fail`

First turn example:

```bash
node /Users/lizeyu/Projects/Agora/scripts/acpx-delegate.mjs \
  --profile claude-session-sonnet \
  --session-name architecture-pass \
  --fresh-session \
  --cwd /Users/lizeyu/Projects/Agora \
  --prompt "Create a focused architecture review."
```

Follow-up example:

```bash
node /Users/lizeyu/Projects/Agora/scripts/acpx-delegate.mjs \
  --profile claude-session-sonnet \
  --session-name architecture-pass \
  --cwd /Users/lizeyu/Projects/Agora \
  --prompt "Now tighten the top 3 findings."
```

### `claude-session-opus-safe`

Use when you want a long Claude session but still want the first turn bootstrapped as Opus.

Defaults:

- `--agent claude`
- `session`
- `--model opus`
- `--fresh-session`
- `--approve-all`
- `--format text`
- `--auth-policy fail`
- `--non-interactive-permissions fail`

First turn example:

```bash
node /Users/lizeyu/Projects/Agora/scripts/acpx-delegate.mjs \
  --profile claude-session-opus-safe \
  --session-name architecture-opus \
  --cwd /Users/lizeyu/Projects/Agora \
  --prompt "Create an architecture plan."
```

Follow-up example:

```bash
node /Users/lizeyu/Projects/Agora/scripts/acpx-delegate.mjs \
  --agent claude \
  session \
  --session-name architecture-opus \
  --cwd /Users/lizeyu/Projects/Agora \
  --model opus \
  --prompt "Tighten the top 3 risks."
```

## Session behavior

Base ACPX session semantics are the upstream ones:

- session scope is based on `agentCommand + cwd + optional name`
- saved sessions are stored under `~/.acpx/sessions`
- prompt mode attempts reconnect/resume
- dead saved processes are reconnected on later prompts

Agora wrapper behavior adds:

- `session` mode uses `sessions ensure` by default
- `--fresh-session` switches that first step to `sessions new`
- `--resume-session <id>` uses `sessions ensure --resume-session <id>`
- for `claude + session + --model <id>`, the wrapper now bootstraps a wrapper-managed `CLAUDE_CONFIG_DIR` with `settings.json` so the session starts with the intended default model
- the wrapper no longer relies on `session/set_config_option model=...` for Claude session routing
- the wrapper reads structured `acpx` session state after each Claude session turn instead of trusting terminal banners alone
- if the latest structured Claude session state shows the prompt has not been answered yet, the wrapper retries that prompt once automatically
- for Claude Opus named sessions, the wrapper remembers the bootstrapped session record and only allows non-fresh follow-up turns against a wrapper-tracked Opus session
- wrapper-managed Claude config directories are pruned automatically over time

This matters because Claude named sessions can drift:

- a fresh wrapper-tracked Opus session is now usable for follow-up turns on this machine
- untracked old named sessions are still the least reliable path for Opus routing
- `set model opus` on an old session is not proof that the prompt actually ran on Opus
- if you care about deterministic Claude routing, prefer `exec`

## Claude model selection

For Claude through ACPX on this machine, use ACPX alias values directly:

- `--model opus`
- `--model sonnet`
- `--model haiku`
- `--model default`

As of 2026-03-16, the Claude ACP adapter advertises:

- `default`
- `sonnet`
- `opus`
- `haiku`
- `sonnet[1m]`
- `opusplan`

Source of truth for aliases:

- [Anthropic Claude Code model config](https://docs.anthropic.com/en/docs/claude-code/model-config)

Practical guidance:

- prefer `claude + exec + --model opus` when you need the most reliable Opus routing
- prefer `claude-session-opus-safe` for the first Opus long-session turn
- prefer `claude + session + --model opus` only as a follow-up to a wrapper-tracked Opus session
- prefer `claude + session + --fresh-session` for iterative Sonnet work
- do not claim “Claude definitely used Opus” just because a named session exists
- do not claim “Claude definitely used Opus” just because `set model opus` succeeded
- prefer evidence from actual prompt completion, not only session creation

## Agent-specific notes

`codex`

- ACPX forwards `--model` when supported by `codex-acp`
- use raw `acpx codex set thought_level <value>` for Codex-specific reasoning controls

`claude`

- use ACPX aliases such as `opus` and `sonnet`
- `exec + opus` is still the strongest-model path
- wrapper-tracked `fresh-session + opus` is now a usable long-session path on this machine
- do not reuse an arbitrary old named session for Opus unless the wrapper created and tracked it

`gemini`

- ACPX forwards `--model` only when the upstream Gemini ACP surface supports it
- startup can be slow; allow more time before deciding it is hung

## Operational guidance

- For non-trivial Claude work, allow roughly `150-240s`
- For Gemini startup smoke, allow roughly `60-70s`
- Prefer curated prompts over raw IM transcripts
- Include objective, repo/workdir, concrete constraints, and expected output
- For large prompts, prefer `--file <brief-path>` over giant inline shell strings

## Local reference

Primary local files for this skill:

- `/Users/lizeyu/Projects/Agora/scripts/acpx-delegate.mjs`
- `/Users/lizeyu/Projects/Agora/scripts/acpx-claude.mjs`
- `/Users/lizeyu/Projects/Agora/scripts/acpx-delegate.test.mjs`

Related upstream reference:

- `/Users/lizeyu/Projects/acpx/skills/acpx/SKILL.md`
