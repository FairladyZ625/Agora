#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'EOF'
bootstrap-local.sh

Prepare Agora for local source-based usage on a fresh machine.

What it does:
  1. Verifies Node.js and npm are installed
  2. Copies .env.example -> .env if .env is missing
  3. Installs agora-ts workspace dependencies
  4. Installs dashboard dependencies
  5. Builds the agora-ts workspace so ./agora can use the built CLI

Usage:
  ./scripts/bootstrap-local.sh
  ./scripts/bootstrap-local.sh --help

Next steps:
  ./agora init
  ./agora start
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22+ is required."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required."
  exit 1
fi

if ! command -v tmux >/dev/null 2>&1; then
  echo "Warning: tmux was not found. Craftsman tmux runtime will be unavailable until tmux is installed."
fi

if [ ! -f "$ROOT/.env" ] && [ -f "$ROOT/.env.example" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "Created $ROOT/.env from .env.example"
fi

echo "Installing agora-ts dependencies..."
(cd "$ROOT/agora-ts" && npm install)

echo "Installing dashboard dependencies..."
(cd "$ROOT/dashboard" && npm install)

echo "Building agora-ts workspace..."
(cd "$ROOT/agora-ts" && npm run build)

cat <<'EOF'

Agora local bootstrap is ready.

Run:
  ./agora init
  ./agora start
EOF
