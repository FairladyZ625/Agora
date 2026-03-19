# Engineering Standard

## General Rules

- Prefer small, coherent changes.
- Preserve decoupling between Core and adapters.
- Do not introduce long-lived compatibility shims unless they are truly required.
- Avoid root-level scratch files and undocumented process artifacts.

## Quality Gate Mindset

- Evidence before claims
- Tests before completion
- Documentation updated when behavior changes
- Clear boundaries between in scope, complete, and follow-up work

## Change Hygiene

- Keep public docs in `Doc/`.
- Keep contributor-facing setup and usage instructions current.
- If a change affects more than one surface, verify each affected surface explicitly.
