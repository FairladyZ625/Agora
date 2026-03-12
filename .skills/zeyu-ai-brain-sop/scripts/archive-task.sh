#!/usr/bin/env bash
set -euo pipefail

KB_ROOT="${KB_ROOT:-/Users/lizeyu/Documents/ZeYu-AI-Brain}"
TASK_ID=""
REASON="任务完成"
REQUIRE_PUBLISHED="1"

usage() {
  cat <<'EOF'
用法:
  archive-task.sh --task-id TASK-xxx [--reason "归档原因"] [--kb-root PATH] [--no-require-published]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --kb-root) KB_ROOT="$2"; shift 2 ;;
    --task-id) TASK_ID="$2"; shift 2 ;;
    --reason) REASON="$2"; shift 2 ;;
    --no-require-published) REQUIRE_PUBLISHED="0"; shift 1 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "未知参数: $1" >&2; usage; exit 2 ;;
  esac
done

[[ -n "$TASK_ID" ]] || { echo "缺少 --task-id" >&2; exit 2; }

ACTIVE_DIR="$KB_ROOT/03-ACTIVE-TASKS/$TASK_ID"
ARCHIVE_DIR="$KB_ROOT/09-ARCHIVE/$TASK_ID"
CURRENT_FILE="$ACTIVE_DIR/00-CURRENT.md"
MILESTONE_FILE="$ACTIVE_DIR/04-回执与里程碑.md"
PUBLISHED_DIR="$ACTIVE_DIR/03-PUBLISHED"

[[ -d "$ACTIVE_DIR" ]] || { echo "未找到任务目录: $ACTIVE_DIR" >&2; exit 1; }
[[ ! -e "$ARCHIVE_DIR" ]] || { echo "归档目录已存在: $ARCHIVE_DIR" >&2; exit 1; }

if [[ "$REQUIRE_PUBLISHED" == "1" ]]; then
  if [[ ! -d "$PUBLISHED_DIR" ]]; then
    echo "缺少发布目录: $PUBLISHED_DIR" >&2
    exit 1
  fi
fi

# 先做结构化状态更新
if [[ -f "$CURRENT_FILE" ]]; then
  "$(dirname "$0")/update-task-status.sh" --kb-root "$KB_ROOT" --task-id "$TASK_ID" --status "已完成" --progress "100%" --summary "$REASON"
fi

# 记录 final 回执
if [[ -f "$MILESTONE_FILE" ]]; then
  {
    echo "- milestone: final"
    echo "- published_path: $PUBLISHED_DIR"
    echo "- current_version: v-final"
    echo "- reviewer: 待补充"
    echo "- commit_hash: 待补充"
    echo "- git_status_short: (必须空)"
    echo "- before_after_diff: $REASON"
    echo "- archive_done: yes"
  } >> "$MILESTONE_FILE"
fi

mkdir -p "$KB_ROOT/09-ARCHIVE"
mv "$ACTIVE_DIR" "$ARCHIVE_DIR"

cat > "$ARCHIVE_DIR/ARCHIVE-META.md" <<EOF
# Archive Meta
- task_id: $TASK_ID
- archived_at: $(date '+%F %T')
- reason: $REASON
- archived_by: $(whoami)
- require_published: $REQUIRE_PUBLISHED
EOF

echo "✅ 任务已归档"
echo "ARCHIVE_DIR=$ARCHIVE_DIR"
