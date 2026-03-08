#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "[0/4] shared contracts drift -> node scripts/check-shared-contracts.mjs"
node "$ROOT_DIR/scripts/check-shared-contracts.mjs"

echo "[1/4] agora-ts -> npm run check:strict"
(
  cd "$ROOT_DIR/agora-ts"
  npm run check:strict
)

echo "[2/4] extensions/agora-plugin -> npm run check:strict"
(
  cd "$ROOT_DIR/extensions/agora-plugin"
  npm run check:strict
)

echo "[3/4] dashboard -> npm run check:strict"
(
  cd "$ROOT_DIR/dashboard"
  npm run check:strict
)

echo "All strict TypeScript quality gates passed."
