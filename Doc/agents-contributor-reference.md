# AGENTS Contributor Reference

This document is the public companion to [AGENTS.md](../AGENTS.md).

The root `AGENTS.md` file is written for maintainers and agent workflows inside the full Agora workspace. Some of the deeper references it mentions live in a private `docs/` repository. This page points external contributors to the public mirror of the same ideas.

## Use This When

- you want to understand how maintainers expect contributions to be structured
- `AGENTS.md` sends you to a private `docs/` path you cannot open
- you need the short version of the architecture, workflow, testing, and documentation rules

## Public Reference Map

- [11-REFERENCE/agora-core-decoupling-standard.md](./11-REFERENCE/agora-core-decoupling-standard.md)
  - Core architecture boundary and adapter rules
- [11-REFERENCE/execution-workflow-standard.md](./11-REFERENCE/execution-workflow-standard.md)
  - contribution workflow, caller surface selection, and delivery loop
- [11-REFERENCE/testing-standard.md](./11-REFERENCE/testing-standard.md)
  - testing expectations and scenario coverage
- [11-REFERENCE/engineering-standard.md](./11-REFERENCE/engineering-standard.md)
  - engineering quality gates and change hygiene
- [11-REFERENCE/dashboard-frontend-standard.md](./11-REFERENCE/dashboard-frontend-standard.md)
  - dashboard-specific expectations
- [11-REFERENCE/docs-library-standard.md](./11-REFERENCE/docs-library-standard.md)
  - public vs private docs responsibilities
- [11-REFERENCE/implementation-ssot-governance.md](./11-REFERENCE/implementation-ssot-governance.md)
  - what the private SSoT does, and what external contributors should expect instead
- [11-REFERENCE/walkthrough-standard.md](./11-REFERENCE/walkthrough-standard.md)
  - delivery summary expectations
- [11-REFERENCE/discord-smoke-testing-standard.md](./11-REFERENCE/discord-smoke-testing-standard.md)
  - live Discord validation guidance when maintainers run IM smoke tests

## Public Structure Mirror

If you want to work in the same shape maintainers use internally, start here:

- [README.md](./README.md)
  - public docs root and mirrored structure
- [09-PLANNING/README.md](./09-PLANNING/README.md)
  - where non-trivial contribution planning artifacts go
- [Agora-Implementation-SSoT-Template.md](./Agora-Implementation-SSoT-Template.md)
  - public implementation schedule / control-tower template
- [09-PLANNING/TASKS/2026-03-18-example-feature-delivery/task_plan.md](./09-PLANNING/TASKS/2026-03-18-example-feature-delivery/task_plan.md)
  - example task plan
- [09-PLANNING/TASKS/2026-03-18-example-feature-delivery/findings.md](./09-PLANNING/TASKS/2026-03-18-example-feature-delivery/findings.md)
  - example findings log
- [09-PLANNING/TASKS/2026-03-18-example-feature-delivery/progress.md](./09-PLANNING/TASKS/2026-03-18-example-feature-delivery/progress.md)
  - example progress log
- [10-WALKTHROUGH/2026-03-18-example-feature-delivery.md](./10-WALKTHROUGH/2026-03-18-example-feature-delivery.md)
  - example delivery walkthrough

## Practical Reading Order

If you are new to the repository, read in this order:

1. [../README.md](../README.md)
2. [../CONTRIBUTING.md](../CONTRIBUTING.md)
3. [README.md](./README.md)
4. [11-REFERENCE/agora-core-decoupling-standard.md](./11-REFERENCE/agora-core-decoupling-standard.md)
5. [11-REFERENCE/execution-workflow-standard.md](./11-REFERENCE/execution-workflow-standard.md)
6. [11-REFERENCE/testing-standard.md](./11-REFERENCE/testing-standard.md)

## Scope Note

The files under `Doc/` are a public structure mirror, not a full export of the private internal `docs/` repository. The private repo remains the maintainer source of truth for active planning logs, internal governance records, and detailed implementation history.
