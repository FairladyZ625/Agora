# Agora AI Brain Pack

This directory is the standardized task workspace pack for Agora.

Principles:

- Agora DB task ids remain the canonical runtime truth.
- Brain Pack task workspaces are structured projections bound to the same task id.
- Role docs, bootstrap assets, and task-local working files live here so agents can read them without relying on parent-session context.

Planned top-level usage:

- `skills/` for repo-local onboarding and retrieval skills
- `roles/` for canonical role docs used as briefing sources
- `tasks/<task-id>/` for task-specific materialized workspaces
- `templates/` for task/bootstrap/role brief templates
- `indexes/` for lightweight navigation
