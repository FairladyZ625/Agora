# Discord Smoke Testing Standard

## Scope

This applies when maintainers validate live Discord or IM-thread integrations.

## When To Consider It

- thread lifecycle changes
- approval callback changes
- bootstrap or probe behavior changes
- plugin receipt or live status regressions

## Public Contributor Guidance

If you cannot run live Discord smoke tests, say so clearly in the PR and provide the strongest local verification you can. Maintainers can run the live smoke pass in their configured environment.
