# Agora Whitepaper

## What Agora Is

Agora is a democratic orchestration layer for multi-agent systems.

It separates three concerns:

- discussion between agents
- human approval and governance
- deterministic execution by tools

The core idea is simple: agents can debate freely, but state transitions and execution surfaces are controlled by code.

## Why It Exists

Pure chat-based agent collaboration breaks down once work becomes real:

- conversations get noisy
- responsibilities blur
- approval points disappear
- execution becomes ad hoc
- outputs stop being reproducible

Agora addresses that by introducing a core orchestrator that owns task state, gate transitions, execution bindings, and auditability.

## Core Model

Agora has three layers:

- entry adapters: Discord, Feishu, Slack, Dashboard, CLI, REST
- Agora Core / Orchestrator: task, participant, context, runtime binding, execution, gate, scheduler, archive
- execution adapters: agent runtimes and craftsmen

The architectural rule is strict: the core must not be coupled to any specific IM platform, runtime, or craftsman provider.

## Typical Flow

1. A task is created.
2. Agents deliberate inside an isolated task context.
3. A gate requires approval, quorum, or auto-pass.
4. Once allowed, craftsmen execute deterministic work.
5. Results can be reviewed again before completion or archival.

## What Makes Agora Different

- human approval is a first-class state transition, not an afterthought
- IM platforms are adapters, not the product core
- craftsmen execution is explicit and inspectable
- CLI, Dashboard, and REST can coexist without redefining orchestration semantics

## Current Distribution Model

Agora is currently distributed as source-first software:

- clone the repository
- run the local bootstrap script
- initialize local config
- start the local stack

This keeps the system easy to inspect and modify while the product surface is still converging.

## Running It End To End

If you want the practical bootstrap guide for Agora + OpenClaw + Discord, use:

- [06-INTEGRATIONS/openclaw/agora-openclaw-bootstrap-whitepaper.md](./06-INTEGRATIONS/openclaw/agora-openclaw-bootstrap-whitepaper.md)

That guide explains:

- which system owns which responsibility
- why one-bot and two-bot setups differ
- what `./agora init` can safely automate
- what still requires human configuration
