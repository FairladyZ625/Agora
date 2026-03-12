#!/usr/bin/env bash
set -euo pipefail

KB_ROOT="${KB_ROOT:-/Users/lizeyu/Documents/ZeYu-AI-Brain}"
TASK_ID=""
TITLE=""
OWNER="李主席"
OWNER_ID="530383608410800138"
REVIEWER="Codex Main"
PROJECT=""
START_DATE="$(date +%F)"
DUE_DATE=""
PRIORITY="P1"
RISK="M"
STATUS="pending"
PARTICIPANTS=""

usage() {
  cat <<'EOF'
用法:
  create-task-skeleton.sh --task-id TASK-YYYYMMDD-NAME-01 --title "任务标题" [选项]

选项:
  --kb-root PATH            知识库根目录
  --owner NAME              负责人（默认 李主席）
  --owner-id ID             负责人ID
  --reviewer NAME           审核人（默认 Codex Main）
  --project NAME            关联项目
  --start-date YYYY-MM-DD   开始日期（默认今天）
  --due-date YYYY-MM-DD     截止日期
  --priority P0|P1|P2       优先级（默认 P1）
  --risk L|M|H              风险等级（默认 M）
  --status pending|started|in-progress|review|done
  --participants "A,B,C"    参与者
  --help                    显示帮助
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --kb-root) KB_ROOT="$2"; shift 2 ;;
    --task-id) TASK_ID="$2"; shift 2 ;;
    --title) TITLE="$2"; shift 2 ;;
    --owner) OWNER="$2"; shift 2 ;;
    --owner-id) OWNER_ID="$2"; shift 2 ;;
    --reviewer) REVIEWER="$2"; shift 2 ;;
    --project) PROJECT="$2"; shift 2 ;;
    --start-date) START_DATE="$2"; shift 2 ;;
    --due-date) DUE_DATE="$2"; shift 2 ;;
    --priority) PRIORITY="$2"; shift 2 ;;
    --risk) RISK="$2"; shift 2 ;;
    --status) STATUS="$2"; shift 2 ;;
    --participants) PARTICIPANTS="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "未知参数: $1" >&2; usage; exit 2 ;;
  esac
done

[[ -n "$TASK_ID" ]] || { echo "缺少 --task-id" >&2; exit 2; }
[[ -n "$TITLE" ]] || { echo "缺少 --title" >&2; exit 2; }

TASK_DIR="$KB_ROOT/03-ACTIVE-TASKS/$TASK_ID"
mkdir -p "$TASK_DIR"/{02-WORKING,03-PUBLISHED,99-ARCHIVE}

CREATED_AT="$(date '+%F %T')"
CURRENT_VERSION="v1.0"

README_FILE="$TASK_DIR/README.md"
BRIEF_FILE="$TASK_DIR/00-任务简报.md"
CURRENT_FILE="$TASK_DIR/00-CURRENT.md"
REQ_FILE="$TASK_DIR/01-需求原文与约束.md"
MILESTONE_FILE="$TASK_DIR/04-回执与里程碑.md"
RISK_FILE="$TASK_DIR/05-风险与决策记录.md"

if [[ ! -f "$README_FILE" ]]; then
  cat > "$README_FILE" <<EOF
# $TASK_ID｜$TITLE

- 项目：${PROJECT:-待补充}
- 状态：$STATUS
- 创建日期：$START_DATE
- Owner：$OWNER
- Reviewer：$REVIEWER

## 快速入口
- 当前生效：./00-CURRENT.md
- 任务简报：./00-任务简报.md
- 原始需求：./01-需求原文与约束.md
- Working：./02-WORKING/
- Published：./03-PUBLISHED/
- 里程碑：./04-回执与里程碑.md
- 风险决策：./05-风险与决策记录.md
- 历史归档：./99-ARCHIVE/
EOF
fi

if [[ ! -f "$BRIEF_FILE" ]]; then
  cat > "$BRIEF_FILE" <<EOF
# 00-任务简报

- TASK_ID: $TASK_ID
- 标题: $TITLE
- 项目: ${PROJECT:-待补充}
- 状态: $STATUS
- Owner: $OWNER ($OWNER_ID)
- Reviewer: $REVIEWER
- 优先级: $PRIORITY
- 风险评级: $RISK
- 创建时间: $CREATED_AT
- 截止时间: ${DUE_DATE:-待定}

## 目标
- 

## 成功标准（验收口径）
- 

## 当前结论（滚动更新）
- 
EOF
fi

if [[ ! -f "$CURRENT_FILE" ]]; then
  cat > "$CURRENT_FILE" <<EOF
# CURRENT
- **当前版本**: $CURRENT_VERSION
- **生效时间**: $START_DATE
- **截止时间**: ${DUE_DATE:-待定}
- **状态**: 进行中
- **Owner**: $OWNER
- **Reviewer**: $REVIEWER
- **参与者**: ${PARTICIPANTS:-待补充}

## 一句话结论
待补充。

## 核心证据
- 待补充

## 发布产物
- 待补充

## 里程碑
1. **M1**：待补充
2. **M2**：待补充
3. **M3**：待补充

## 验收标准
- [ ] 待补充

## 风险与依赖
- 暂无
EOF
fi

if [[ ! -f "$REQ_FILE" ]]; then
  cat > "$REQ_FILE" <<EOF
# 01-需求原文与约束

## 原文需求
- （粘贴原文）

## 约束条件
- 

## 非目标
- 

## 引用来源
- 08-RAW-CONTEXT/00-PENDING/...（待补充）
EOF
fi

if [[ ! -f "$MILESTONE_FILE" ]]; then
  cat > "$MILESTONE_FILE" <<EOF
# 04-回执与里程碑

## 里程碑
- [ ] pending
- [ ] started
- [ ] in-progress
- [ ] review
- [ ] done

## 回执模板（中间）
- milestone:
- changed_paths:
- commit_hash:
- git_status_short: (必须空)
- blockers:
- ETA:

## 回执模板（final）
- milestone: final
- published_path:
- current_version:
- reviewer:
- commit_hash:
- git_status_short: (必须空)
- before_after_diff:
- archive_done: yes/no

## 回执记录
- $CREATED_AT: 初始化任务目录（脚本自动生成骨架）。
EOF
fi

if [[ ! -f "$RISK_FILE" ]]; then
  cat > "$RISK_FILE" <<EOF
# 05-风险与决策记录

## 风险列表
- 

## H 级硬判定（命中任一即 H）
1. 改数据库结构 / 批量生产数据
2. 改跨 Agent 全局协作规则
3. 不可逆外部动作或高成本自动调用

## 决策记录
- 
EOF
fi

echo "✅ 完整任务骨架创建完成（v2.2）"
echo "TASK_DIR=$TASK_DIR"
echo "FILES:"
printf '%s\n' "- $README_FILE" "- $BRIEF_FILE" "- $CURRENT_FILE" "- $REQ_FILE" "- $MILESTONE_FILE" "- $RISK_FILE"
echo "DIRS:"
printf '%s\n' "- $TASK_DIR/02-WORKING" "- $TASK_DIR/03-PUBLISHED" "- $TASK_DIR/99-ARCHIVE"
