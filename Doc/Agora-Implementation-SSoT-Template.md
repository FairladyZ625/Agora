# Agora Implementation SSoT Template

Use this file as a public control-tower template when a contribution is large enough to need an implementation schedule, active track list, or cross-link hub.

This is the public counterpart to the private maintainer SSoT style. It should stay concise and point outward to planning, design, and walkthrough documents instead of becoming a giant status dump.

## How To Use

1. Copy this file into the location that makes sense for the change.
2. Keep only the active items in the main table.
3. Link every active item to its planning folder.
4. Move completed groups into an archive summary instead of expanding the main table forever.

## Current Overview

| Track | Status | Summary | Planning | Architecture | Walkthrough | Next Checkpoint |
| --- | --- | --- | --- | --- | --- | --- |
| EXAMPLE-001 | Planned | Add a CLI-first status inspection surface | `Doc/09-PLANNING/TASKS/2026-03-18-example-feature-delivery/` | `Doc/03-ARCHITECTURE/2026-03-18-example-cli-first-entry-surface.md` | `Doc/10-WALKTHROUGH/2026-03-18-example-feature-delivery.md` | Verify caller surface and test scope |

## Rules

- One active line per coherent work item.
- Keep details in linked documents, not in this file.
- Every non-trivial active item should have a planning folder.
- Every completed item should have a walkthrough or equivalent delivery note.
- Do not create parallel status files in the repository root.

## Suggested Status Labels

- `Planned`
- `In Progress`
- `Partially Complete`
- `Verified Complete`
- `Paused`

## Archive Pattern

When a track is finished, remove it from the active table and summarize it in `Doc/09-PLANNING/ROADMAP-ARCHIVE/`.
