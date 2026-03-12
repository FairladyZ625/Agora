# Agora CLI

Use local `agora` CLI as the primary control surface for agent-side task operations.

Common commands:

```bash
agora status <taskId>
agora task conversation-summary <taskId>
agora archive jobs list
agora archive jobs show <jobId>
agora craftsman dispatch <taskId> <subtaskId> --adapter codex
```

Rules:

- Prefer CLI over guessing task state from chat.
- Prefer CLI over human-facing slash commands.
- Do not run craftsman dispatch outside a craftsman-eligible stage.
