# Testing Standard

## Goal

Do not claim completion without verification.

## Minimum Expectations

- Add or update tests for behavior changes.
- Run strict checks for the surfaces you touched.
- Run scenario coverage when orchestration semantics, task actions, or workflow stages change.

## Typical Commands

TypeScript core:

```bash
cd agora-ts
npm run check:strict
```

Scenarios:

```bash
cd agora-ts
npm run scenario:list
npm run scenario -- happy-path --json
npm run scenario:all
```

Dashboard:

```bash
cd dashboard
npm run check:strict
```

Plugin:

```bash
cd extensions/agora-plugin
npm run check:strict
```

## When Live Smoke Matters

If a maintainer changes IM, thread, approval, callback, or probe behavior and a live environment is available, at least one real smoke pass should be considered before calling the work complete.
