#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
DB_PATH="$TMP_DIR/e2e.db"
CFG_PATH="$TMP_DIR/e2e-config.json"
PORT="${AGORA_E2E_PORT:-18420}"
TOKEN="${AGORA_E2E_TOKEN:-e2e-token}"
BASE_URL="http://127.0.0.1:${PORT}"
SERVER_LOG="$TMP_DIR/server.log"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

cat > "$CFG_PATH" <<JSON
{
  "permissions": {
    "archonUsers": ["archon"],
    "allowAgents": {
      "*": { "canCall": [], "canAdvance": true }
    }
  },
  "api_auth": {
    "enabled": true,
    "token": "${TOKEN}"
  }
}
JSON

cd "$ROOT_DIR"
python -m agora.scripts.agora_cli serve \
  --host 127.0.0.1 \
  --port "$PORT" \
  --db-path "$DB_PATH" \
  --config-path "$CFG_PATH" \
  >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 40); do
  if curl -fsS "$BASE_URL/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

if ! curl -fsS "$BASE_URL/api/health" >/dev/null 2>&1; then
  echo "[e2e] server failed to start"
  cat "$SERVER_LOG"
  exit 1
fi

http_code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/tasks")
if [[ "$http_code" != "401" ]]; then
  echo "[e2e] expected 401 without token, got $http_code"
  exit 1
fi

create_payload='{"title":"E2E Auth Task","type":"quick","creator":"archon"}'
create_resp="$(curl -sS \
  -X POST "$BASE_URL/api/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$create_payload")"

python - "$create_resp" <<'PY'
import json
import sys
payload = json.loads(sys.argv[1])
if not payload.get("id", "").startswith("OC-"):
    raise SystemExit("[e2e] create task did not return OC-* id")
PY

list_resp="$(curl -sS \
  "$BASE_URL/api/tasks" \
  -H "Authorization: Bearer $TOKEN")"

python - "$list_resp" <<'PY'
import json
import sys
items = json.loads(sys.argv[1])
if not isinstance(items, list) or len(items) < 1:
    raise SystemExit("[e2e] expected non-empty task list")
PY

echo "[e2e] auth flow passed"
