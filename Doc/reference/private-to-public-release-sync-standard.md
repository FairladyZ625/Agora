# Private to Public Release Sync Standard

Agora maintainers may develop private work in `Agora_Private`, then publish only the approved public surface into the public code repository.

## Repository Roles

- `Agora_Private`: private monorepo. Code lives at the repo root and internal docs live under `docs/`.
- `Agora`: public code repo. Receives code, public `Doc/` references, dashboard, `agora-ts`, extensions, scripts, and contributor-facing files.
- `agora_doc`: private legacy/archive docs repo. It is not required for ordinary public code releases.

## Hard Rules

- Never push a private branch directly to a public repo.
- Do not commit private `docs/` into the public code repo.
- Treat the public repo as a projection target, not as the private source of truth.
- Use clean temporary worktrees from the latest public target branch.
- Prefer fine-grained public commits over one large release-batch commit.
- Public commit hashes do not need to match private commit hashes.
- Public commits should include:

```text
Private-Commit: <private-sha>
Private-Source-Branch: <private-branch>
```

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
- private planning, findings, walkthroughs, and internal architecture notes
- local screenshots, caches, temporary files
- secrets and environment files

## Docs Policy

Internal docs stay in `Agora_Private/docs/` by default.

Only short contributor-facing references should be mirrored into `Doc/reference/`. A separate docs-repo projection is optional and private; it is used only when maintainers explicitly want selected docs archived there.

## Validation

Dashboard releases should include targeted tests, `npm run lint`, `npm run build`, and real full-stack smoke when the change touches authenticated dashboard behavior or backend integration.

For broad frontend changes, prefer:

```bash
cd dashboard
npm run check:strict
```
