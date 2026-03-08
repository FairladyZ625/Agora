#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

cd "$PROJECT_ROOT/agora-ts"

if [ ! -d node_modules ]; then
  echo "agora-ts dependencies missing, running npm install..." >&2
  npm install
fi

export AGORA_CRAFTSMAN_CLI_MODE="${AGORA_CRAFTSMAN_CLI_MODE:-tmux}"

npm exec -- tsx apps/cli/src/index.ts craftsman "$@"
