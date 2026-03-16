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
- local caveats around Claude named sessions

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

- `--profile <claude-opus-safe|claude-session-sonnet>`
- `--fresh-session`
- `--resume-session <id>`
- `--no-wait` for queued persistent prompts
- `--allowed-tools <comma,separated,list>`
- `--max-turns <count>`
- `--auth-policy <skip|fail>`
- `--non-interactive-permissions <deny|fail>`
- `--file <path>`

Use them instead of dropping straight to raw `acpx` unless you need a provider-specific knob that the wrapper still does not expose.

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
- for `claude + session + --model <id>`, the wrapper runs `acpx <agent> set --session <name> model <id>` before sending the prompt
- exception: `claude + session + --model sonnet|default` does **not** force `set model`, because that path is currently unstable in this environment

This matters because Claude named sessions can drift:

- old named sessions are the least reliable path for Opus routing
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
- prefer `claude + session + --fresh-session` for iterative work
- do not claim “Claude definitely used Opus” just because a named session exists
- do not claim “Claude definitely used Opus” just because `set model opus` succeeded
- prefer evidence from actual prompt completion, not only session creation

## Agent-specific notes

`codex`

- ACPX forwards `--model` when supported by `codex-acp`
- use raw `acpx codex set thought_level <value>` for Codex-specific reasoning controls

`claude`

- use ACPX aliases such as `opus` and `sonnet`
- named sessions are currently the least stable path in this environment for Opus proof

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
