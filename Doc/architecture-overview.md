# Architecture Overview

## Layering

Agora is organized into three layers:

### 1. Entry Surface Adapters

- Discord
- Feishu
- Slack
- Dashboard
- CLI
- REST

These are entry surfaces only. They must not redefine orchestration semantics.

### 2. Agora Core / Orchestrator

This is the product center.

Core concepts include:

- task
- participant
- context
- runtime binding
- execution
- gate
- scheduler
- archive

### 3. Runtime And Craftsman Adapters

- agent runtimes such as OpenClaw or future alternatives
- craftsmen such as Codex, Claude Code, Gemini, or other execution engines

## Non-Negotiable Rule

The core cannot depend on a specific provider.

If replacing Discord, OpenClaw, or Codex would require changing the core orchestration semantics, the design is wrong.

## Current Repo Shape

- `agora-ts/`: server, CLI, contracts, core, db, config, testing
- `dashboard/`: React dashboard
- `extensions/`: external bridge adapters
- `Doc/`: shareable public docs
- `docs/`: internal docs repo

## Current Recommended Entry Model

- local agents: CLI
- human approvals: Dashboard
- external systems and plugins: REST
- human mobile/lightweight interaction: IM bridge
