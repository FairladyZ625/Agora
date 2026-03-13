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

Task workspace numbering:

- top-level canonical files occupy the first slots:
  - `00-bootstrap.md`
  - `00-current.md`
  - `01-task-brief.md`
  - `02-roster.md`
  - `03-stage-state.md`
- task subdirectories therefore continue from `04-...`:
  - `04-context/`
  - `05-agents/`
  - `06-artifacts/`
  - `07-outputs/`

This keeps file and directory ordering in one continuous sequence instead of creating two separate numbering systems.
