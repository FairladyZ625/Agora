# Dashboard Frontend Standard

## Purpose

Keep the dashboard as the authenticated human control surface, not the default execution surface for agents.

## Expectations

- Human approval flows must rely on real authenticated session state.
- Do not add free-form approver identity injection.
- Keep dashboard actions aligned with shared server and Core semantics rather than duplicating business logic in the UI.
- Update operator-facing docs when review or approval behavior changes.

## Validation

When dashboard behavior changes:

- run the dashboard strict checks
- verify the affected operator flow
- confirm auth-sensitive actions still depend on logged-in human state
