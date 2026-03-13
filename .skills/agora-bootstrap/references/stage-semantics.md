# Stage Semantics

Agora stages should be interpreted through execution semantics, not only names.

Execution kinds:

- `citizen_discuss`
- `citizen_execute`
- `craftsman_dispatch`
- `human_approval`

Implications:

- `citizen_discuss`: discuss, question, decompose, align.
- `citizen_execute`: perform non-craftsman execution work.
- `craftsman_dispatch`: controller or allowed actor may create execution-bound subtasks and dispatch craftsmen through Agora CLI.
- `human_approval`: wait for human confirmation; do not self-advance.

Additional control-plane rule:

- `craftsman_dispatch` does not mean the thread is now "owned by craftsmen". It means the current citizen/controller loop may call craftsmen as execution engines and continue them through `execution_id` if they need more input.
