#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

npm run build --workspace @agora-ts/config --workspace @agora-ts/db --workspace @agora-ts/core --workspace @agora-ts/adapters-discord --workspace @agora-ts/adapters-openclaw --workspace @agora-ts/cli

cd "$ROOT/apps/cli"
npm link

echo "Global agora CLI now points to: $ROOT/apps/cli/dist/index.js"
