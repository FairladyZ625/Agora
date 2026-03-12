#!/usr/bin/env bash
set -euo pipefail

KB_ROOT="${KB_ROOT:-/Users/lizeyu/Documents/ZeYu-AI-Brain}"
TASK_ID=""
STATUS=""
PROGRESS=""
SUMMARY=""
NEXT_STEP=""
BLOCKER=""
REVIEWER=""
ETA=""

usage() {
  cat <<'EOF'
用法:
  update-task-status.sh --task-id TASK-xxx --status "进行中|等待反馈|已完成|暂停|取消" [选项]

选项:
  --kb-root PATH
  --progress "50%"
  --summary "本次进展"
  --next-step "下一步"
  --blocker "阻塞项"
  --reviewer "审核人"
  --eta "YYYY-MM-DD"
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --kb-root) KB_ROOT="$2"; shift 2 ;;
    --task-id) TASK_ID="$2"; shift 2 ;;
    --status) STATUS="$2"; shift 2 ;;
    --progress) PROGRESS="$2"; shift 2 ;;
    --summary) SUMMARY="$2"; shift 2 ;;
    --next-step) NEXT_STEP="$2"; shift 2 ;;
    --blocker) BLOCKER="$2"; shift 2 ;;
    --reviewer) REVIEWER="$2"; shift 2 ;;
    --eta) ETA="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "未知参数: $1" >&2; usage; exit 2 ;;
  esac
done

[[ -n "$TASK_ID" ]] || { echo "缺少 --task-id" >&2; exit 2; }
[[ -n "$STATUS" ]] || { echo "缺少 --status" >&2; exit 2; }

TASK_DIR="$KB_ROOT/03-ACTIVE-TASKS/$TASK_ID"
CURRENT_FILE="$TASK_DIR/00-CURRENT.md"
MILESTONE_FILE="$TASK_DIR/04-回执与里程碑.md"

[[ -f "$CURRENT_FILE" ]] || { echo "未找到文件: $CURRENT_FILE" >&2; exit 1; }

NOW="$(date '+%F %T')"

# 结构化替换 CURRENT 头部字段（兼容 v2.2 骨架）
python3 - "$CURRENT_FILE" "$STATUS" "$PROGRESS" "$ETA" "$REVIEWER" <<'PY'
import re,sys
p,status,progress,eta,reviewer=sys.argv[1:6]
text=open(p,'r',encoding='utf-8').read()

def repl(pattern, val):
    global text
    if val:
        text = re.sub(pattern, val, text, count=1, flags=re.M)

status_map={
    'pending':'待开始','started':'进行中','in-progress':'进行中','review':'评审中','done':'已完成',
    '进行中':'进行中','等待反馈':'等待反馈','已完成':'已完成','暂停':'暂停','取消':'取消'
}
cn_status=status_map.get(status,status)
repl(r'^- \*\*状态\*\*: .*$', f'- **状态**: {cn_status}')
if progress:
    repl(r'^- \*\*当前版本\*\*: (.*)$', r'- **当前版本**: \1')
    # 插入或替换完成度行
    if re.search(r'^- \*\*完成度\*\*: .*$', text, flags=re.M):
        repl(r'^- \*\*完成度\*\*: .*$', f'- **完成度**: {progress}')
    else:
        text=text.replace('- **状态**: '+cn_status, '- **状态**: '+cn_status+'\n- **完成度**: '+progress)
if eta:
    repl(r'^- \*\*截止时间\*\*: .*$', f'- **截止时间**: {eta}')
if reviewer:
    repl(r'^- \*\*Reviewer\*\*: .*$', f'- **Reviewer**: {reviewer}')
open(p,'w',encoding='utf-8').write(text)
PY

if [[ -n "$SUMMARY" ]]; then
  {
    echo ""
    echo "## 进展更新（$NOW）"
    echo "- $SUMMARY"
  } >> "$CURRENT_FILE"
fi

if [[ -n "$NEXT_STEP" ]]; then
  {
    echo ""
    echo "## 下一步（$NOW）"
    echo "- [ ] $NEXT_STEP"
  } >> "$CURRENT_FILE"
fi

if [[ -n "$BLOCKER" ]]; then
  {
    echo ""
    echo "## 风险与依赖（$NOW）"
    echo "- $BLOCKER"
  } >> "$CURRENT_FILE"
fi

if [[ -f "$MILESTONE_FILE" ]]; then
  {
    echo "- $NOW: status=$STATUS progress=${PROGRESS:-NA} eta=${ETA:-NA} summary=${SUMMARY:-NA}"
  } >> "$MILESTONE_FILE"
fi

echo "✅ 状态已更新: $TASK_ID -> $STATUS"
echo "FILE=$CURRENT_FILE"
[[ -f "$MILESTONE_FILE" ]] && echo "MILESTONE_LOGGED=$MILESTONE_FILE"
