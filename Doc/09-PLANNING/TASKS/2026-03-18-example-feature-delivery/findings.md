## Verified Facts

- The primary caller for the example capability is a local agent workflow.
- Agent-first capabilities should expose CLI before slash-command-only entry points.
- Non-trivial contributions benefit from separate plan, findings, and progress documents.

## Risks

- Putting orchestration behavior in plugin code would duplicate logic and weaken Core boundaries.
- Keeping all status in a single README makes review and handoff harder.

## Conclusions / Open Items

- Use CLI first, then add bridges only if a human-facing workflow is truly needed.
- Keep the implementation schedule short and move details into planning and walkthrough documents.
