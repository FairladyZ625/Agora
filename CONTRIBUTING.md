# Contributing to Agora

Thank you for contributing.

Agora is not "just another bot integration". The project centers on orchestration semantics, human gates, and provider-neutral execution control. Good contributions preserve that boundary.

## Start Here

- Read [README.md](./README.md) for the public project overview.
- Read [AGENTS.md](./AGENTS.md) for the repository operating rules used by agents and maintainers.
- Read [Doc/agents-contributor-reference.md](./Doc/agents-contributor-reference.md) for the public mirror of the most important internal standards referenced by `AGENTS.md`.

## Contribution Priorities

High-value contributions usually fall into one of these areas:

- orchestration and governance semantics
- runtime and IM adapters
- dashboard operator workflows
- project, task, review, and archive workflows
- public documentation that explains the model clearly

## Non-Negotiable Architecture Rules

Before you design or change anything, check these questions:

- Is this really `Agora Core` responsibility?
- Would the concept still make sense if Discord, OpenClaw, or Codex disappeared?
- Could we swap Feishu, Slack, CrewAI, Claude Code, or another runtime without changing Core semantics?

If the answer is no, the design is too coupled.

Core expectations:

- `packages/core` expresses orchestration semantics, ports, state machines, and rules.
- IM, runtime, and execution implementations belong in adapters and integrations.
- Provider-specific data must not become the long-term Core model.
- `apps/server` and `apps/cli` are composition roots, not homes for Core business semantics.

## Public Docs vs Private Docs

This repository intentionally exposes two documentation surfaces:

- `Doc/`
  - Public, shareable contributor and onboarding docs.
- `docs/`
  - A separate private repository for planning logs, walkthroughs, internal governance details, and deeper implementation records.

If you are an external contributor, use the public docs in this repository. Do not block on access to the private `docs/` repo.

## Typical Contribution Flow

1. Open an issue or start from an existing issue if the change is non-trivial.
2. Confirm the caller surface and boundary:
   - agent-first capability -> CLI first
   - human approval -> Dashboard authenticated flow
   - IM slash command -> REST plus plugin bridge
3. Make the smallest coherent change that keeps Core decoupled.
4. Add or update tests before claiming completion.
5. Update public docs when behavior, setup, or contributor expectations change.
6. Open a pull request with verification evidence.

## Development Expectations

- Prefer TypeScript changes under `agora-ts/` unless you are intentionally working on another surface.
- Preserve the separation between:
  - IM / entry adapters
  - Agora Core / Orchestrator
  - runtime / execution adapters
- Do not reintroduce provider-specific assumptions into shared models.
- Do not put internal planning scratch files in the repository root.

## Testing Expectations

Run the strict checks that match your change scope.

Full TypeScript quality gate:

```bash
cd agora-ts
npm run check:strict
```

Scenario coverage when orchestration behavior changes:

```bash
cd agora-ts
npm run scenario:list
npm run scenario -- happy-path --json
npm run scenario:all
```

If your change affects dashboard behavior:

```bash
cd dashboard
npm run check:strict
```

If your change affects the plugin or external adapter surface:

```bash
cd extensions/agora-plugin
npm run check:strict
```

## Documentation Expectations

Please update docs when you change:

- setup steps
- CLI behavior
- task lifecycle behavior
- review or approval expectations
- public architecture explanations

Use these locations:

- public-facing contributor or onboarding material -> `Doc/`
- code-specific docs in the active codebase -> keep them near the relevant package when appropriate
- private planning, walkthrough, or internal governance records -> maintainers will handle those in the private `docs/` repo

## Pull Request Checklist

- The change keeps Core semantics decoupled from specific providers.
- The caller surface choice is intentional and documented in the PR.
- Tests or validation commands were run.
- Public docs were updated if contributor-facing behavior changed.
- The PR description includes what changed, why, and how it was verified.

## Questions

If `AGENTS.md` points to a private internal doc you cannot access, use the public mirror here instead:

- [Doc/agents-contributor-reference.md](./Doc/agents-contributor-reference.md)
- [Doc/reference/README.md](./Doc/reference/README.md)
