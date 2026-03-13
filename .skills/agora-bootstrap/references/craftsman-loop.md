# Craftsman Loop

Agora treats craftsmen as execution engines controlled by the task thread, not as independent discussion participants.

## Formal loop

1. Enter an execution-capable stage.
2. Create one or more `subtasks`.
3. Dispatch a craftsman against a specific subtask.
4. Track the resulting `execution`.
5. If the execution requests more input, continue it through the same `execution_id`.
6. After the craftsman continues, sync the latest state through the formal execution probe surface.
7. If probe cannot infer the next state, fall back to the formal callback surface.
8. Let Agora Server and Agora Bot mirror the callback and status back into the task thread.

## Core objects

- `task`: the main collaborative object and the source thread/workspace owner.
- `subtask`: the execution binding object for a specific unit of work inside a stage.
- `execution`: the craftsman runtime object bound to a subtask.
- `execution_id`: the continuation handle when an execution pauses for input or choice.

## What not to do

- Do not open a new Discord thread for every subtask by default.
- Do not dispatch craftsmen directly from free-form chat without a subtask binding.
- Do not continue a waiting craftsman by guessing a tmux pane name if the product surface already gives you an `execution_id`.

## Continuation model

When a craftsman callback reports:

- `needs_input`
- `awaiting_choice`

you should continue it through the execution-scoped control plane. Prefer:

```bash
agora craftsman input-text <executionId> "<text>"
agora craftsman input-keys <executionId> Down Enter
agora craftsman submit-choice <executionId> Down
```

After the execution continues, sync the resulting state through the same `execution_id`:

```bash
agora craftsman probe <executionId>
```

If probe still cannot determine the next state cleanly, fall back to an explicit callback:

```bash
agora craftsman callback <executionId> --status succeeded --payload '{"output":{"summary":"done"}}'
agora craftsman callback <executionId> --status failed --error "describe the failure"
```

If the craftsman still needs another round of input after probing, continue the same execution again:

- `agora craftsman input-text <executionId> "<text>"`
- `agora craftsman input-keys <executionId> Down Enter`
- `agora craftsman submit-choice <executionId> Down`

This keeps the loop aligned with Agora's data model and lets the execution be traced back to:

- the subtask
- the task
- the active stage
- the main thread
- the task workspace
