# Example Architecture Note: CLI-First Entry Surface

## Goal

Show the shape of a public architecture note for a non-trivial contribution.

## Problem

Contributors often add human-facing entry points first because they are visible, even when the primary caller is a local agent workflow.

## Decision

For an agent-first capability, define the shared service behavior and CLI surface first. Add REST or plugin bridges only when a real human-facing entry point is also required.

## Why

- It preserves the caller matrix defined in `AGENTS.md`.
- It avoids duplicating orchestration logic in plugins.
- It keeps Core semantics independent from any specific IM.

## Public Links

- Planning: [../09-PLANNING/TASKS/2026-03-18-example-feature-delivery/task_plan.md](../09-PLANNING/TASKS/2026-03-18-example-feature-delivery/task_plan.md)
- Walkthrough: [../10-WALKTHROUGH/2026-03-18-example-feature-delivery.md](../10-WALKTHROUGH/2026-03-18-example-feature-delivery.md)
