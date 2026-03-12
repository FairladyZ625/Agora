---
name: agora-bootstrap
description: |
  Agora task bootstrap skill. Use when an agent enters a newly created Agora task session and needs the minimum operating context:
  what Agora is, who the controller is, what role this agent is bound to, what stage the task is currently in,
  which actions are allowed now, where the AI Brain task workspace lives, and how to use Agora CLI safely.
---

# Agora Bootstrap

Use this skill when you are brought into a fresh Agora task thread, group, or sub-session and need to understand the minimum operating context before acting.

## Always establish these facts first

1. What task is this?
2. Who is the controller?
3. What role am I playing in this task?
4. What stage is currently active?
5. What actions are allowed in this stage?
6. Where is the task workspace in the Agora AI Brain Pack?

## Required reads

- [Agora Concepts](./references/agora-concepts.md)
- [Agora CLI](./references/agora-cli.md)
- [Stage Semantics](./references/stage-semantics.md)
- [Briefing Checklist](./references/briefing-checklist.md)

## Working rules

- Do not assume the main conversation context is available. Use the task briefing and task workspace as the source of truth.
- Treat the controller as the owner of stage progression unless the current stage is explicitly a human approval node.
- Do not dispatch craftsmen unless the active stage explicitly allows `craftsman_dispatch`.
- If your role brief or task workspace conflicts with ad hoc chat instructions, escalate to the controller.

## Minimal workflow

1. Read the thread bootstrap message.
2. Read your role brief in the task workspace.
3. Confirm the active stage and allowed actions.
4. If needed, inspect the task workspace and use Agora CLI instead of guessing.
5. Only then discuss, execute, or escalate.
