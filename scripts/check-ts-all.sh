#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "[1/3] agora-ts -> npm run check"
(
  cd "$ROOT_DIR/agora-ts"
  npm run check
)

echo "[2/3] extensions/agora-plugin -> npm test && npm run build"
(
  cd "$ROOT_DIR/extensions/agora-plugin"
  npm test
  npm run build
)

echo "[3/3] dashboard -> npm test && npm run lint && npx tsc -b && npm run build"
(
  cd "$ROOT_DIR/dashboard"
  npm test
  npm run lint
  npx tsc -b
  npm run build
)

echo "All TypeScript quality gates passed."
