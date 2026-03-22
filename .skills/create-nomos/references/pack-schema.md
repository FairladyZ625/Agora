# Pack Schema

Use this reference when authoring the output structure for a new Nomos pack.

## Minimum contract

```text
my-nomos/
  profile.toml
  README.md
  constitution/
  docs/
  lifecycle/
  prompts/
```

## `profile.toml`

Minimum fields:

- `id`
- `name`
- `version`
- `description`
- `constitution.entry`
- `docs.root`
- `docs.skeleton.create_if_missing`
- `lifecycle.modules`
- `install.write_targets`
- `doctor.checks`

## Design constraints

- The pack describes **how to install and run a harness**, not a single project's facts.
- The pack may ship defaults, but those defaults must still be shareable.
- Project-specific content should be filled later into project state, not hard-coded into the pack.
