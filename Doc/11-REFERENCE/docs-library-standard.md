# Docs Library Standard

## Purpose

Explain how the public `Doc/` tree mirrors the private `docs/` structure without exposing internal task history.

## Public Structure

`Doc/` now mirrors the same high-level slots maintainers use internally:

- `00-RAW-PRDS/`
- `01-GOVERNANCE/`
- `02-PRODUCT/`
- `03-ARCHITECTURE/`
- `04-DEVELOPMENT/`
- `05-TEST-QA/`
- `06-INTEGRATIONS/`
- `07-OPERATIONS/`
- `08-SECURITY/`
- `09-PLANNING/`
- `10-WALKTHROUGH/`
- `11-REFERENCE/`

## What External Contributors Should Put Here

Use `Doc/` for public, contribution-safe materials such as:

- onboarding guides
- tutorials
- quick starts
- contributor references
- architecture notes safe to share publicly
- planning templates and public planning examples
- walkthroughs that explain a finished contribution

For non-trivial contribution records, use:

- `Doc/09-PLANNING/TASKS/<YYYY-MM-DD-task-name>/`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- `Doc/10-WALKTHROUGH/`
  - final delivery summaries
- `Doc/Agora-Implementation-SSoT-Template.md`
  - public implementation schedule / control-tower template

## What Stays Private

The separate private `docs/` repository remains the maintainer home for:

- active internal planning logs
- internal walkthroughs
- governance details with private context
- implementation history and audit records
- deeper architecture records that are not part of the public bundle

## Rule of Thumb

If an external contributor needs it to understand the project, structure a non-trivial change, or submit a PR, put a public version in `Doc/`.

If the document contains internal operating detail, maintainer-only history, or private review context, keep it in the private `docs/` repo.
