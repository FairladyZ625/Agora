#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "[0/5] shared contracts drift -> node scripts/check-shared-contracts.mjs"
node "$ROOT_DIR/scripts/check-shared-contracts.mjs"

echo "[0.5/5] recurring review guardrails -> node scripts/check-review-guardrails.mjs"
node "$ROOT_DIR/scripts/check-review-guardrails.mjs"

echo "[1/5] agora-ts -> npm run check:strict"
(
  cd "$ROOT_DIR/agora-ts"
  npm run check:strict
)

echo "[2/5] extensions/agora-plugin -> npm run check:strict"
(
  cd "$ROOT_DIR/extensions/agora-plugin"
  npm run check:strict
)

echo "[3/5] dashboard -> npm run check:strict"
(
  cd "$ROOT_DIR/dashboard"
  npm run check:strict
)

echo "All strict TypeScript quality gates passed."
