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
3. Add tests or update validation coverage.
4. Run the relevant quality gates.
5. Update public docs if contributor-facing behavior changed.
6. Include verification evidence in the PR.

## Internal Maintainer Note

Maintainers also keep private planning records in the separate `docs/` repo. External contributors do not need to reproduce that internal process unless explicitly asked.
