# Execution Workflow Standard

## Goal

Keep contributions traceable, reviewable, and validated.

## Caller Surface Rule

Decide the primary caller before you design the feature:

- local agent workflow -> CLI first
- authenticated human approval -> Dashboard
- human IM command -> REST plus plugin bridge

Do not force agent workflows through slash commands just because a human IM bridge also exists.

## Delivery Loop

1. Understand the change and affected surface.
2. Keep the change scoped and architecture-safe.
3. For a non-trivial change, create a public task directory under `Doc/09-PLANNING/TASKS/<YYYY-MM-DD-task-name>/`.
4. Add or update:
   - `task_plan.md`
   - `findings.md`
   - `progress.md`
5. Add tests or update validation coverage.
6. Run the relevant quality gates.
7. Update public docs if contributor-facing behavior changed.
8. Add a delivery summary under `Doc/10-WALKTHROUGH/` when the work benefits from a durable handoff record.
9. Include verification evidence in the PR.

## Planning Shape

For public planning records, follow this minimum shape:

- `task_plan.md`
  - goal
  - phases
  - decisions made
  - errors encountered
  - status
- `findings.md`
  - verified facts
  - risks
  - conclusions / open items
- `progress.md`
  - phase table
  - current focus
  - verification commands
  - change log

## Internal Maintainer Note

Maintainers also keep private planning records in the separate `docs/` repo. External contributors do not need to reproduce that internal process unless explicitly asked.
