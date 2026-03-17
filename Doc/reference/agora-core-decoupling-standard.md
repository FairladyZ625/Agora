# Agora Core Decoupling Standard

## Goal

Protect Agora Core from coupling to any specific IM, agent runtime, or execution engine.

## Required Model Split

- entry adapters
  - Discord, Feishu, Slack, Dashboard, CLI, REST
- Agora Core / Orchestrator
  - task, context, participant, gate, approval, notification, archive
- runtime and execution adapters
  - ACPX, OpenClaw, and future hosts

## Rules

- `packages/core` may define orchestration semantics, ports, rules, and state machines.
- `packages/core` must not hardcode platform-specific business rules.
- Provider-specific data belongs in adapters, projections, or composition roots.
- `apps/server` and `apps/cli` bind implementations together but do not own Core semantics.

## Design Test

Ask these questions before merging a change:

- If Discord disappears, does the concept still hold?
- If Codex or OpenClaw disappears, does the orchestration model still hold?
- Could another runtime be swapped in by replacing an adapter instead of rewriting Core?

If not, the design is too coupled.
