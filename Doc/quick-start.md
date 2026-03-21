# Quick Start

## Prerequisites

- Node.js 22+
- npm 10+
- `acpx`

Optional:

- OpenClaw if you want hosted IM participation
- Discord if you want the live thread experience

## Fast Path

```bash
git clone https://github.com/FairladyZ625/Agora.git
cd Agora
./scripts/bootstrap-local.sh
./agora init
./agora start
```

## What These Commands Do

- `./scripts/bootstrap-local.sh`
  - installs `agora-ts` dependencies
  - installs `dashboard` dependencies
  - creates `.env` from `.env.example` if needed
  - builds the TypeScript workspace
- `./agora init`
  - writes local Agora config into `~/.agora/`
  - bootstraps the first dashboard admin
  - prepares the default ACPX-backed execution path
- `./agora start`
  - starts the Fastify backend
  - starts the Vite dashboard dev server

## Default Local URLs

- API: `http://127.0.0.1:18420/api/health`
- Dashboard: `http://127.0.0.1:33173/dashboard/`

## Developer Live Regression Mode

Agora also includes a developer-only live regression harness for real Discord task threads.
Set the repo-root `.env` flag below only if you are iterating on Agora itself and want the local agent to proxy operator actions in `regression_test` tasks:

```bash
AGORA_DEV_REGRESSION_MODE=true
```

Keep this disabled for normal product usage.

Typical commands:

```bash
cd agora-ts
npm run smoke:discord:regression
npm run dev -w @agora-ts/cli -- regression live --task-id <task_id> --goal "validate the Discord orchestration loop" --message "Drive the task forward and report blockers."
```

## First CLI Task

```bash
./agora create "Add authentication middleware to the API"
```

## Operating Model

```text
Create task
  -> Citizens discuss
  -> Archon reviews
  -> execution-only or dialogue-capable executor is selected
  -> ACPX-backed execution runs
  -> output is reviewed and archived
```

## Notes

- Agora is no longer centered on the old tmux Craftsman shell.
- Public execution entrypoints now use provider-neutral runtime surfaces.
- `Craftsman` should be read as a governed execution role, not as a self-owned low-level runtime framework.

## Next Guides

- [discord-setup.md](./discord-setup.md)
- [openclaw-local-setup.md](./openclaw-local-setup.md)
- [architecture-overview.md](./architecture-overview.md)
