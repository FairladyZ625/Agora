---
name: create-nomos
description: Use when defining or packaging a custom Agora Nomos/Harness Pack through an interview-driven flow, especially when a user wants to create a shareable project-harness asset instead of only using the built-in default.
---

# Create Nomos

Use this skill when the user wants to author a new Nomos/Harness Pack for Agora.

The output is a **shareable pack directory**, not ad hoc notes and not a project-local hack.

## What this skill is for

- defining a new Nomos through structured interview
- turning project methodology into a reusable pack
- generating a valid pack skeleton with manifest, constitution, prompts, lifecycle, and references

Do not use this skill for:

- installing an existing Nomos
- filling project-specific content into an already-installed project state
- editing repo-root `AGENTS.md` only

## Required references

- [Pack Schema](./references/pack-schema.md)
- [Interview Fields](./references/interview-fields.md)
- [Output Skeleton](./references/output-skeleton.md)

## Bundled assets

- `assets/pack-template/`

Use the bundled template as the starting skeleton when the user wants a concrete pack output quickly. Customize it after the interview; do not ship the raw template unchanged.

## Preferred generation path

When Agora CLI is available, prefer generating the pack through:

```bash
agora nomos scaffold --id <pack-id> --name "<pack name>" --description "<purpose>" --output-dir <target-dir>
```

Then refine the generated files instead of hand-copying every file from scratch.

## Core rule

Treat the work as **bone + fill**:

- the Nomos pack provides structure, defaults, prompts, and methodology
- the project later fills content into its own global project state

Do not collapse those two layers.

## Workflow

1. Identify the target use case.
2. Interview for pack-level methodology, not project-specific facts.
3. Freeze the pack contract:
   - constitution defaults
   - docs harness defaults
   - lifecycle modules
   - governance / doctor rules
   - bootstrap prompts
4. Generate the pack directory skeleton.
   - Prefer `agora nomos scaffold ...` when CLI is available.
   - Otherwise start from `assets/pack-template/`.
5. Write the minimum required files so the pack is installable and inspectable.

## Output requirements

Your output pack must include:

- `profile.toml`
- `README.md`
- `constitution/`
- `docs/templates/` or `docs/reference/` defaults
- `lifecycle/`
- `prompts/bootstrap/`

Add `prompts/closeout/`, `prompts/doctor/`, `scripts/`, or `skills/` only when the pack truly needs them.

## Quality bar

- The pack must be reusable across more than one project.
- Do not copy a single project's private docs verbatim into the pack.
- Keep repo-root `AGENTS.md` as a shim concern; do not turn the pack into a giant prompt file.
- Prefer a smaller, coherent pack over an oversized pseudo-platform.
