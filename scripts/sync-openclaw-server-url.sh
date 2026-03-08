#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

if ! command -v openclaw >/dev/null 2>&1; then
  echo "openclaw CLI not found"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "missing $ENV_FILE"
  echo "copy .env.example to .env first"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [ -z "${AGORA_SERVER_URL:-}" ]; then
  echo "AGORA_SERVER_URL is not set in $ENV_FILE"
  exit 1
fi

openclaw config set plugins.entries.agora.config.serverUrl "$AGORA_SERVER_URL"
echo "Synced OpenClaw Agora plugin serverUrl -> $AGORA_SERVER_URL"
