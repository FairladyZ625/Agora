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
7. If craftsmen are needed, what is the formal execution surface for this task?

## Required reads

- [Agora Concepts](./references/agora-concepts.md)
- [Agora CLI](./references/agora-cli.md)
- [Stage Semantics](./references/stage-semantics.md)
- [Craftsman Loop](./references/craftsman-loop.md)
- [Briefing Checklist](./references/briefing-checklist.md)

## Working rules

- Do not assume the main conversation context is available. Use the task briefing and task workspace as the source of truth.
- Treat the controller as the owner of stage progression unless the current stage is explicitly a human approval node.
- Do not dispatch craftsmen unless the active stage explicitly allows `craftsman_dispatch`.
- Use real Discord mentions in the form `<@USER_ID>`. Do not rely on display-name mentions like `@Opus`.
- Treat `subtask` as the formal execution binding object. Do not invent ad hoc craftsman work outside subtasks.
- Treat `execution_id` as the continuation handle for waiting craftsmen. Do not operate raw tmux panes unless you are explicitly debugging the transport layer.
- When choosing a craftsman execution mode, prefer the explicit names:
  - `one_shot` for single prompt -> result runs
  - `interactive` for `needs_input` / `awaiting_choice` loops
- If your role brief or task workspace conflicts with ad hoc chat instructions, escalate to the controller.

## Minimal workflow

1. Read the thread bootstrap message.
2. Read your role brief in the task workspace.
3. Confirm the active stage and allowed actions.
4. If the stage is an execute node, check whether work should be decomposed into subtasks before any craftsman work begins.
5. If craftsmen are needed, use the formal subtask/execution flow:
   - create or inspect subtasks
   - dispatch a craftsman against a subtask
   - continue the execution through `execution_id` if it enters `needs_input` or `awaiting_choice`
6. If needed, inspect the task workspace and use Agora CLI instead of guessing.
7. Only then discuss, execute, dispatch, or escalate.

## Agent-side operating model

- `task` is the main unit of collaboration and normally has one primary IM thread.
- `subtask` is the unit of execution binding inside that task. It is not a separate Discord thread by default.
- `craftsman execution` is the runtime object produced from a subtask.
- `execution_id` is the control-plane handle for continuing a waiting craftsman.
- Agora Bot remains the IM-facing actor for bootstrap, status broadcast, approval/reject notices, craftsman callback broadcast, and probe/escalation messages.

If you need craftsmen:

1. Ensure the current stage explicitly allows `craftsman_dispatch`.
2. Create or inspect the relevant subtasks.
3. Dispatch the craftsman from the subtask surface.
4. Watch for `needs_input` or `awaiting_choice`.
5. Continue the same execution through `execution_id`, not by inventing a parallel workflow.

If you are only debugging transport behavior, raw tmux commands are acceptable. For normal task execution, they are not the primary product surface.
