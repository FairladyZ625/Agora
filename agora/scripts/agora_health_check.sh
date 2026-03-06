#!/usr/bin/env bash
set -euo pipefail

API_URL="${AGORA_API_URL:-http://127.0.0.1:8420}"
DB_PATH="${AGORA_DB_PATH:-/Users/lizeyu/Projects/Agora/tasks.db}"

pass() { printf "[PASS] %s\n" "$1"; }
fail() { printf "[FAIL] %s\n" "$1"; }

status=0

# 1) API health
if curl -fsS "${API_URL}/api/health" >/dev/null 2>&1; then
  pass "API health reachable (${API_URL}/api/health)"
else
  fail "API health unreachable (${API_URL}/api/health)"
  status=1
fi

# 2) SQLite read/write
if python - <<PY
import sqlite3
from pathlib import Path
p=Path("${DB_PATH}")
conn=sqlite3.connect(p)
conn.execute("create table if not exists _health_probe (id integer primary key, ts text)")
conn.execute("insert into _health_probe (ts) values (datetime('now'))")
conn.execute("delete from _health_probe where id in (select id from _health_probe order by id desc limit 1)")
conn.commit()
conn.close()
PY
then
  pass "SQLite read/write ok (${DB_PATH})"
else
  fail "SQLite read/write failed (${DB_PATH})"
  status=1
fi

# 3) OpenClaw plugin status (optional)
if command -v openclaw >/dev/null 2>&1; then
  if openclaw plugins info agora >/dev/null 2>&1; then
    pass "OpenClaw plugin 'agora' detected"
  else
    fail "OpenClaw plugin 'agora' not detected (run setup-openclaw-plugin)"
    status=1
  fi
else
  fail "openclaw command not found"
  status=1
fi

exit ${status}
