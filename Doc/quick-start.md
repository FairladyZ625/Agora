# Quick Start

## Prerequisites

- Node.js 22+
- npm 10+
- tmux if you want the craftsmen tmux runtime

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
  - lets you choose Discord or no IM provider
  - bootstraps the first dashboard admin
- `./agora start`
  - starts the Fastify backend
  - starts the Vite dashboard dev server

## Default Local URLs

- API: `http://127.0.0.1:18420/api/health`
- Dashboard: `http://127.0.0.1:33173/dashboard/`

## First CLI Task

```bash
./agora create "Add authentication middleware to the API"
```

## Next Guides

- [discord-setup.md](./discord-setup.md)
- [openclaw-local-setup.md](./openclaw-local-setup.md)
- [architecture-overview.md](./architecture-overview.md)
