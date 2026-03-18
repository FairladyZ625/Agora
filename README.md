<div align="center">

[中文](./README.zh-CN.md) | **English** | [日本語](./README.ja.md)

<br/>

<h1>Agora</h1>

<p><strong>Agents debate. Humans decide. Execution stays governed.</strong></p>

<p>An orchestration and governance layer for agent societies.<br/>
Agora turns free-form multi-agent discussion into staged, auditable delivery.</p>

[![GitHub stars](https://img.shields.io/github/stars/FairladyZ625/Agora?style=flat-square&logo=github&color=yellow)](https://github.com/FairladyZ625/Agora/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/FairladyZ625/Agora?style=flat-square&logo=github)](https://github.com/FairladyZ625/Agora/network)
[![GitHub issues](https://img.shields.io/github/issues/FairladyZ625/Agora?style=flat-square)](https://github.com/FairladyZ625/Agora/issues)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen?style=flat-square&logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)

</div>

---

## The Problem

Putting many agents into one channel does produce better ideas, but it also produces failure modes:

- Discussion noise drowns the task.
- Coordinators get context-polluted.
- Human approval becomes informal and easy to skip.
- Execution starts before decisions are actually settled.
- Chat logs do not equal delivery.

The deeper problem is not "how to connect another bot". It is:

**How do you build a social structure where the right participants see the right information at the right time?**

Agora answers that with explicit orchestration semantics instead of prompt folklore.

---

## What Agora Is

Agora is:

- an orchestration core
- a governance layer
- a task arena with staged participation
- a human-gated decision system
- a provider-neutral execution control plane

Agora is **not**:

- just another IM bot
- just a coding-agent launcher
- just a Claude/Codex/Gemini wrapper
- a runtime that owns the low-level session substrate

The low-level coding runtime is now treated as commodity infrastructure. Agora keeps the orchestration truth.

---

## Core Model

```text
Citizens deliberate  ->  Archon decides  ->  Executors deliver
```

| Concept | Role |
| --- | --- |
| **Agora** | The task arena: isolated context, workflow, participants, notifications |
| **Citizens** | Discussion participants: agents that can debate, critique, and refine proposals |
| **Archon** | Human authority at gates: approves, rejects, pauses, or redirects |
| **Craftsman** | A governed execution role, not a self-owned runtime framework |
| **Gate** | A stage transition checkpoint with explicit policy |
| **Decree** | A curated brief or accepted decision that execution is allowed to act on |

The key idea is simple:

> For executors, much discussion is noise.

Executors do not always need the full debate log. Often they need a curated brief, accepted constraints, and permission to act.

That is why Agora distinguishes:

- `execution-only` participants
- `dialogue-capable` participants

Both can exist in the same task system, but they are governed differently.

---

## How It Works

1. Citizens discuss in an isolated task context.
2. Archon reviews the current conclusion at a gate.
3. Agora decides whether execution may start, who may join, and what brief they receive.
4. Execution runs through a provider-neutral substrate.
5. Results flow back into task state, logs, notifications, and archive.

Discussion stays flexible. Delivery stays controlled.

---

## Execution Model

Agora no longer treats its old tmux-based Craftsman path as the primary execution model.

Current position:

- `ACPX` is the default execution substrate.
- `CraftsmanAdapter` remains a Core-facing abstraction.
- `Craftsman` remains a business role in orchestration.
- The old tmux public shell has been removed.

This means Agora focuses on:

- when execution starts
- who gets to execute
- whether an executor joins the discussion
- what context the executor receives
- how completion flows back into orchestration state

It does **not** need to be the project that owns every low-level Claude/Codex session primitive itself.

---

## Why Not Just Put Claude In The Channel?

You can. Agora does not fight that.

If a user wants to connect Claude, Codex, or another agent host directly into Discord/OpenClaw, that is fine. Agora still has a job:

- decide when that participant joins
- decide when they stay hidden
- decide whether they receive the whole discussion or only a brief
- decide when human review is mandatory
- decide how output changes task state

Direct IM presence solves transport. It does not solve governance.

---

## Architecture

```text
IM / Entry Adapters
Discord · Feishu · Slack · Dashboard · CLI · REST
                |
                v
Agora Core / Orchestrator
Task · Context · Participant · Gate · Approval
Scheduler · Notification · Archive · Recovery
                |
                v
Runtime / Execution Adapters
OpenClaw · ACPX · future runtimes
```

Core rule:

- `packages/core` owns orchestration semantics.
- IM, runtime, and execution systems are adapters.
- Provider-specific details must not become the long-term Core model.

---

## Quickstart

### Prerequisites

- Node.js 22+
- npm 10+
- `acpx`

Optional:

- OpenClaw, if you want IM-hosted agent participation
- Discord, if you want the live thread experience

### Install

```bash
git clone https://github.com/FairladyZ625/Agora.git
cd Agora
./scripts/bootstrap-local.sh
```

### Initialize And Start

```bash
./agora init
./agora start
```

If OpenClaw is detected, `./agora init` can now optionally build and wire the local Agora plugin into `openclaw.json`.
It only automates safe plugin registration and Agora server wiring.
It does **not** rewrite OpenClaw Discord policy such as bot rosters, `allowBots`, `requireMention`, or guild/channel allowlists.

For the end-to-end bootstrap guide, see:

- [Doc/06-INTEGRATIONS/openclaw/agora-openclaw-bootstrap-whitepaper.md](./Doc/06-INTEGRATIONS/openclaw/agora-openclaw-bootstrap-whitepaper.md)

Default local endpoints:

- API: `http://127.0.0.1:18420/api/health`
- Dashboard: `http://127.0.0.1:33173/dashboard/`

### Create A Task

```bash
./agora create "Add authentication middleware to the API"
```

### Typical Flow

```text
Create task
  -> Citizens discuss
  -> Archon reviews
  -> execution-only or dialogue-capable executor is selected
  -> ACPX-backed execution runs
  -> output is reviewed and archived
```

### Quality Gates

```bash
cd agora-ts
npm run check:strict
npm run scenario:all
```

---

## Use Cases

- requirement clarification with competing agent viewpoints
- architecture and implementation review with explicit human gates
- code/test/review delivery after discussion converges
- project and context isolation across multiple agent groups
- selective participant exposure in long-running task threads
- auditable human-in-the-loop orchestration for real work

---

## Comparison

| | Agora | IM bot only | CrewAI / AutoGen | LangGraph |
| --- | --- | --- | --- | --- |
| Multi-agent discussion | ✅ | ⚠️ ad hoc | ✅ | ⚠️ |
| Human gates | ✅ | ❌ | ⚠️ | ⚠️ |
| Participant exposure policy | ✅ | ❌ | ❌ | ❌ |
| Execution as governed role | ✅ | ❌ | ⚠️ | ⚠️ |
| Provider-neutral orchestration core | ✅ | ❌ | ❌ | ⚠️ |

---

## Roadmap

- [x] PoC: multi-bot threads, task commands, subagent dispatch
- [x] State machine and gate foundation
- [x] Dashboard and review surfaces
- [x] ACPX-backed default execution substrate
- [x] tmux public shell retirement
- [ ] execution exposure policy hardening
- [ ] richer project / brain / citizen workbench
- [ ] more runtime and IM adapters
- [ ] multi-tenant governance and SaaS mode

---

## Repository Layout

```text
agora-ts/      TypeScript implementation
dashboard/     React dashboard
Doc/           public docs bundle
docs/          architecture / planning / walkthrough docs (separate git repo)
extensions/    external adapters and plugins
```

---

## Contributing

High-value areas:

- orchestration and governance semantics
- runtime and IM adapters
- dashboard operator experience
- project / task / archive workflows
- docs that clarify the social model

Start with [CONTRIBUTING.md](CONTRIBUTING.md).
If you are reading `AGENTS.md` without access to the private `docs/` repo, use the public mirror in [Doc/agents-contributor-reference.md](Doc/agents-contributor-reference.md).
