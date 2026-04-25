# Private to Public Release Sync Standard

Agora maintainers may develop long-running work in the private aggregate repo, then publish it to the public split repositories through a controlled projection.

## Repository Roles

- `Agora_Private`: private aggregate workspace. Code lives at the repo root and docs live under `docs/`.
- `Agora`: public code repo. Receives code, public `Doc/` references, dashboard, `agora-ts`, extensions, and scripts.
- `agora_doc`: public docs repo. Receives private `docs/` content with the `docs/` prefix stripped.

## Hard Rules

- Never push a private aggregate branch directly to a public repo.
- Do not commit `docs/` into the public code repo.
- Do not commit code repo files into the public docs repo.
- Use clean temporary worktrees from the latest public `master`.
- Split mixed work into two PRs: one code PR and one docs PR.
- Validate each public projection independently before opening the PR.
- After public merge, sync public code and docs back into `Agora_Private`.

## Code Projection

Allowed by default:

- `AGENTS.md`
- `Doc/`
- `agora-ts/`
- `dashboard/`
- `extensions/`
- `scripts/`
- public root config

Excluded by default:

- `docs/`
- private-only planning scratch
- local screenshots, caches, temporary files
- secrets and environment files

## Docs Projection

Private docs are mapped into the public docs repo by stripping the `docs/` prefix.

```text
Agora_Private/docs/11-REFERENCE/example.md
-> agora_doc/11-REFERENCE/example.md
```

## Validation

Dashboard releases should include targeted tests, `npm run lint`, `npm run build`, and real full-stack smoke when the change touches authenticated dashboard behavior or backend integration.

For broad frontend changes, prefer:

```bash
cd dashboard
npm run check:strict
```

Docs releases should verify placement, links, indexes, and SSoT / planning / walkthrough updates.
