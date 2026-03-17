# AGENTS Contributor Reference

This document is the public companion to [AGENTS.md](../AGENTS.md).

The root `AGENTS.md` file is written for maintainers and agent workflows inside the full Agora workspace. Some of the deeper references it mentions live in a private `docs/` repository. This page points external contributors to the public mirror of the same ideas.

## Use This When

- you want to understand how maintainers expect contributions to be structured
- `AGENTS.md` sends you to a private `docs/` path you cannot open
- you need the short version of the architecture, workflow, testing, and documentation rules

## Public Reference Map

- [reference/agora-core-decoupling-standard.md](./reference/agora-core-decoupling-standard.md)
  - Core architecture boundary and adapter rules
- [reference/execution-workflow-standard.md](./reference/execution-workflow-standard.md)
  - contribution workflow, caller surface selection, and delivery loop
- [reference/testing-standard.md](./reference/testing-standard.md)
  - testing expectations and scenario coverage
- [reference/engineering-standard.md](./reference/engineering-standard.md)
  - engineering quality gates and change hygiene
- [reference/dashboard-frontend-standard.md](./reference/dashboard-frontend-standard.md)
  - dashboard-specific expectations
- [reference/docs-library-standard.md](./reference/docs-library-standard.md)
  - public vs private docs responsibilities
- [reference/implementation-ssot-governance.md](./reference/implementation-ssot-governance.md)
  - what the private SSoT does, and what external contributors should expect instead
- [reference/walkthrough-standard.md](./reference/walkthrough-standard.md)
  - delivery summary expectations
- [reference/discord-smoke-testing-standard.md](./reference/discord-smoke-testing-standard.md)
  - live Discord validation guidance when maintainers run IM smoke tests

## Practical Reading Order

If you are new to the repository, read in this order:

1. [../README.md](../README.md)
2. [../CONTRIBUTING.md](../CONTRIBUTING.md)
3. [reference/agora-core-decoupling-standard.md](./reference/agora-core-decoupling-standard.md)
4. [reference/execution-workflow-standard.md](./reference/execution-workflow-standard.md)
5. [reference/testing-standard.md](./reference/testing-standard.md)

## Scope Note

The files under `Doc/reference/` are public contributor mirrors, not a full export of the private internal `docs/` repository. The private repo remains the maintainer source of truth for planning logs, internal governance records, and detailed implementation history.
