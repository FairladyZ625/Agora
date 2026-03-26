# Agora + OpenClaw + Discord Bootstrap Whitepaper

This guide explains the full local bootstrap path for users who want Agora, OpenClaw, and Discord to work together without guessing which system owns which responsibility.

## Read This First

There are four moving parts:

1. **Agora server**
   - Owns orchestration, task state, human approval, and the dashboard/API.
2. **Agora Discord bot**
   - Owns Agora's IM-facing governance behavior such as thread creation, task notifications, and approval-facing messaging.
3. **OpenClaw host**
   - Owns hosted agent participation and multi-bot runtime behavior.
4. **Agora plugin inside OpenClaw**
   - Connects OpenClaw to the Agora server over HTTP.

If you merge these roles mentally, setup becomes confusing fast.

There is now a fifth optional dependency surface for semantic `project brain` retrieval:

- an embedding API
- a vector database such as Qdrant

If you only want orchestration, dashboard, and IM wiring, you can skip that stack.
If you want `projects brain index/query/bootstrap-context --task` to use hybrid retrieval, the primary path is now to let `./agora init` provision the local stack for you.

## Why Two Bots Exist

In the common Discord deployment, you usually have two bot roles:

- **Agora bot**
  - creates or manages Agora-facing task/thread surfaces
  - reports governed task lifecycle events
  - reflects the orchestration system
- **OpenClaw / 龙虾 bots**
  - represent hosted agents inside Discord
  - follow OpenClaw channel/account policy
  - participate in discussion or execution as configured

Those are different jobs. Agora should not silently rewrite OpenClaw's multi-bot policy, and OpenClaw should not become the source of truth for Agora task governance.

## What Is Automated vs Manual

### Agora can safely automate

When `./agora init` detects OpenClaw and you confirm the action, it can automate:

- local Agora config bootstrap
- local Agora admin bootstrap
- local Agora Discord bot config
- local `agora-plugin` build
- safe `openclaw.json` plugin registration / wiring aligned with the official plugin CLI path:
  - `openclaw plugins install -l ./extensions/agora-plugin`
  - `plugins.load.paths`
  - `plugins.entries.agora.enabled`
  - `plugins.entries.agora.config.serverUrl`
  - `plugins.entries.agora.config.apiToken`
  - path-based `plugins.installs.agora` metadata

`plugins.allow` is a separate trust-tightening choice, not the primary install path itself.

### Agora intentionally does not automate

The following stay manual by design and must be configured by the operator:

- OpenClaw Discord account roster
- Discord bot tokens for OpenClaw-managed accounts
- `allowBots`
- `requireMention`
- guild / channel allowlist policy
- channel-specific `systemPrompt`
- any OpenClaw behavior policy unrelated to loading the Agora plugin

If a human should decide it, the guide documents it instead of hiding it behind side effects.

## Shortest Path

### Mode A: Agora only

Use this if you only want the local API + dashboard + CLI.

```bash
git clone https://github.com/FairladyZ625/Agora.git
cd Agora
./scripts/bootstrap-local.sh
./agora init
./agora start
```

### Mode B: Agora + OpenClaw

Use this if you want hosted agent participation through OpenClaw.

```bash
git clone https://github.com/FairladyZ625/Agora.git
cd Agora
./scripts/bootstrap-local.sh
./agora init
./agora start
openclaw plugins info agora
```

During `./agora init`, accept the optional OpenClaw integration step when prompted.

### Mode C: Agora + OpenClaw + Discord

Use this if you want the full live-thread experience.

You still start with the same commands:

```bash
git clone https://github.com/FairladyZ625/Agora.git
cd Agora
./scripts/bootstrap-local.sh
./agora init
./agora start
```

But before that, collect:

- the Agora Discord bot token
- the Agora default channel ID
- the human approver's Discord user ID if you want Discord-side identity binding
- the OpenClaw-managed bot roster and their tokens

### Current `/task` entry surface

The current Agora OpenClaw plugin exposes `/task` and `/project` as text command bridges.

That means:

- you can create and manage tasks directly in Discord
- the entry is currently text-first, not a picker or modal flow
- if you do not remember the exact syntax, start with `/task`

Useful first commands:

```text
/task
/task create "fix dashboard create flow" coding
/task list active
/task status OC-123
```

Supported task types today:

- `coding`
- `coding_heavy`
- `research`
- `document`
- `quick`
- `brainstorm`

If you want picker-style task creation later, that requires structured interactive result support in the host plugin API; it is not just a hidden toggle in the current Agora plugin.

## Detailed Bootstrap Sequence

### Step 1: Bootstrap Agora source

Run:

```bash
./scripts/bootstrap-local.sh
```

What this does:

- installs `agora-ts` dependencies
- installs `dashboard` dependencies
- creates `.env` from `.env.example` if needed
- builds the TypeScript workspace

What this does not do:

- install OpenClaw
- configure Discord
- wire the Agora plugin into OpenClaw
- install your embedding API credentials

### Step 1.5: Optional hybrid retrieval prerequisites

If you want semantic `project brain` retrieval, prepare one embedding provider credential.
`./agora init` can then probe that provider and install or reuse local Qdrant automatically.

Manual fallback values remain:

```bash
AGORA_DEV_REGRESSION_MODE=false
AGORA_DASHBOARD_LOGIN_USER=
AGORA_DASHBOARD_LOGIN_PASSWORD=
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBEDDING_DIMENSION=
QDRANT_URL=http://127.0.0.1:6333
QDRANT_API_KEY=
```

Operational notes:

- `./agora init` first checks whether `127.0.0.1:6333` already serves a healthy Qdrant.
- If not, it attempts to start `qdrant/qdrant:latest` locally through Docker as `agora-qdrant`.
- `QDRANT_URL` may still point at a custom local process, a container, or another operator-managed endpoint if you do not use the default init path.
- Without these variables, `project brain` still works in raw lexical mode, but semantic query/bootstrap and vector indexing stay unavailable.
- `./scripts/bootstrap-local.sh` creates `.env` from `.env.example`; `./agora init` is now the preferred way to populate the vector section.
- `AGORA_DEV_REGRESSION_MODE` is separate from product bootstrap. Keep it `false` unless you are a source-level developer running the Discord live regression harness and explicitly want agent-side operator proxy behavior in `regression_test` tasks.
- `AGORA_DASHBOARD_LOGIN_USER` / `AGORA_DASHBOARD_LOGIN_PASSWORD` are also developer-only. They let browser audits and dev-regression helpers log into the Dashboard through the repo-root `.env`; they are not part of the normal product path.

### Step 2: Run `./agora init`

This always configures Agora itself first:

- dashboard admin
- Agora database path
- Agora IM provider
- Agora Discord bot token / default channel if Discord is selected

If OpenClaw is detected, `./agora init` then offers an optional integration phase.

If you accept it, Agora will:

- build the local plugin in `extensions/agora-plugin`
- back up `openclaw.json`
- write only the minimum safe plugin registration and Agora server wiring

If you decline it, nothing in OpenClaw is changed.

After the base Agora prompts, `./agora init` also offers an optional hybrid retrieval phase.

If you accept it, Agora will:

- collect `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_EMBEDDING_MODEL`, and optional `OPENAI_EMBEDDING_DIMENSION`
- probe the embedding API with a real embeddings request
- reuse a healthy local Qdrant on `127.0.0.1:6333` when present
- otherwise pull and run `qdrant/qdrant:latest` through Docker
- write the verified vector settings into the repo-root `.env`

If this phase fails, Agora still finishes the base init and tells you to rerun `./agora init` after fixing Docker or the embedding credentials.

### Step 3: Apply manual OpenClaw Discord policy

This is the part that must stay human-readable.

For a first working setup, keep the policy simple:

- `allowBots`: start with `true` or the local equivalent you already use for coordination
- `requireMention`: `true` in shared channels unless a bot-specific channel should be free-speaking
- group policy: use allowlists first, not broad-open guild defaults

For account-based OpenClaw setups, review:

- `channels.discord.accounts`
- per-account channel rules
- per-channel `systemPrompt`

Agora does not write those because they encode your operational bot policy, not Agora plugin wiring.

### Step 4: Start Agora

Run:

```bash
./agora start
```

Check:

- API: `http://127.0.0.1:18420/api/health`
- Dashboard: `http://127.0.0.1:33173/dashboard/`

### Step 4.5: Validate hybrid retrieval if enabled

Run:

```bash
./agora projects brain index rebuild --project <project_id>
./agora projects brain query --task <task_id> --audience craftsman --query "runtime boundary" --mode auto
./agora projects brain bootstrap-context --task <task_id> --audience craftsman
```

Expected outcome:

- index rebuild reports indexed docs/chunks instead of `not_wired`
- task-aware query reports `retrieval_mode=hybrid`
- bootstrap context includes the selected `source_documents`

### Step 5: Validate OpenClaw plugin wiring

Run:

```bash
openclaw plugins info agora
```

Expected outcome:

- OpenClaw sees the `agora` plugin
- the plugin points at your stable repo path, not a temporary worktree
- the plugin points at your local Agora server

If API auth is enabled in Agora, verify the plugin config also contains the matching bearer token.

## `openclaw.json` Changes You Should Expect

The automated setup is intentionally narrow.

The primary 3.22 path creates or updates:

- `plugins.load.paths`
- `plugins.entries.agora.enabled`
- `plugins.entries.agora.config.serverUrl`
- `plugins.entries.agora.config.apiToken`
- `plugins.installs.agora`

Optional hardening may also add:

- `plugins.allow`

It should not modify:

- `channels.discord.accounts`
- `allowBots`
- `requireMention`
- guild/channel allowlists
- bot tokens
- channel prompts

If you see those policy areas change, treat that as a bug.

## Common Failure Modes

### “`./agora init` did not install the plugin”

Check:

- are you in the full Agora source repository?
- does `extensions/agora-plugin/package.json` exist?
- is OpenClaw installed on this machine?
- if you run the manual path, did you use `openclaw plugins install -l ./extensions/agora-plugin` from the stable repo root?

Agora can only automate the local plugin if the plugin source is actually present.

### “OpenClaw exists but Agora skipped auto-wiring”

Likely causes:

- OpenClaw command not found in `PATH`
- local plugin source missing
- you declined the optional integration prompt

### “Discord bots still do the wrong thing after setup”

That is expected if the issue is in OpenClaw behavior policy rather than Agora plugin wiring.

Review:

- `channels.discord.accounts`
- `allowBots`
- `requireMention`
- guild / channel allowlists
- channel prompts

## Recommended Reading Order

- [../../quick-start.md](../../quick-start.md)
- [../../discord-setup.md](../../discord-setup.md)
- [../../openclaw-local-setup.md](../../openclaw-local-setup.md)
