# Agora CLI

Use local `agora` CLI as the primary control surface for agent-side task operations.

Common commands:

```bash
agora status <taskId>
agora task conversation-summary <taskId>
agora archive jobs list
agora archive jobs show <jobId>
agora subtasks list <taskId>
agora subtasks create <taskId> --caller-id <controllerId> --file subtasks.json
agora projects brain bootstrap-context --task <taskId> --audience <role>
agora projects brain query --task <taskId> --audience <role> --query "..." --mode auto
agora projects brain index status --project <projectId>
agora craftsman input-text <executionId> "<text>"
agora craftsman input-keys <executionId> Down Enter
agora craftsman submit-choice <executionId> Down
agora craftsman probe <executionId>
agora craftsman callback <executionId> --status succeeded --payload '{"output":{"summary":"done"}}'
```

Rules:

- Prefer CLI over guessing task state from chat.
- Prefer CLI over human-facing slash commands.
- Prefer task-aware `projects brain` commands over ad hoc rereads of long chat history when you need project context.
- The normal craftsman path is `subtask -> execution -> execution-scoped input`.
- After continuing a waiting execution, sync the latest craftsman state through `agora craftsman probe`.
- Only use `agora craftsman callback` when probe cannot infer the next state automatically.
- Do not run craftsman dispatch outside a craftsman-eligible stage.
- Use raw tmux commands only for transport debugging, not as the default task workflow.

Notes:

- `agora projects brain bootstrap-context` is the fastest way to inspect the current curated task context and the selected `source_documents`.
- `agora projects brain query --task ... --mode auto` is the normal retrieval path when you need more background for the active task and audience.
- `agora projects brain index status` is mainly for operator/debug checks when retrieval appears unavailable.
