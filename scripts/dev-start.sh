#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# Agora 一键拉起前后端开发环境
# ═══════════════════════════════════════════════════════════
#
# 使用方式:
#   chmod +x scripts/dev-start.sh
#   ./scripts/dev-start.sh
#
# 功能:
#   - 从项目根目录 `.env` 读取统一开发配置
#   - 启动后端 agora-ts Fastify Server
#   - 启动前端 Vite Dev Server
#   - Ctrl+C 同时终止两个进程
#
# 前提:
#   - Node.js / npm 已安装
#   - agora-ts/node_modules 已安装（若未安装会自动执行）
#   - dashboard/node_modules 已安装 (npm install)
# ═══════════════════════════════════════════════════════════

set -euo pipefail

# 获取项目根目录（相对于脚本位置）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m' # No Color

# PID 列表，用于 cleanup
BACKEND_PID=""
FRONTEND_PID=""
BUILD_WATCH_PID=""

cleanup() {
  echo ""
  echo -e "${DIM}正在停止服务...${NC}"
  if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
    echo -e "${DIM}  ✓ 后端已停止${NC}"
  fi
  if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
    wait "$FRONTEND_PID" 2>/dev/null || true
    echo -e "${DIM}  ✓ 前端已停止${NC}"
  fi
  if [ -n "$BUILD_WATCH_PID" ] && kill -0 "$BUILD_WATCH_PID" 2>/dev/null; then
    kill "$BUILD_WATCH_PID" 2>/dev/null || true
    wait "$BUILD_WATCH_PID" 2>/dev/null || true
    echo -e "${DIM}  ✓ TypeScript 构建监视已停止${NC}"
  fi
  echo -e "${GREEN}所有服务已停止。${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM

echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo -e "${CYAN}  Agora 开发环境启动${NC}"
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo ""

# ── 检查依赖 ──────────────────────────────────────
cd "$PROJECT_ROOT"

# 检查 node
if ! command -v node &>/dev/null; then
  echo -e "${RED}✗ 未找到 node，请先安装 Node.js${NC}"
  exit 1
fi

if ! command -v npm &>/dev/null; then
  echo -e "${RED}✗ 未找到 npm，请先安装 npm${NC}"
  exit 1
fi

# ── 读取根目录 .env ──────────────────────────────
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# 检查 agora-ts 依赖
if [ ! -d "$PROJECT_ROOT/agora-ts/node_modules" ]; then
  echo -e "${DIM}agora-ts 依赖未安装，正在执行 npm install...${NC}"
  (cd "$PROJECT_ROOT/agora-ts" && npm install)
fi

# 检查前端依赖
if [ ! -d "$PROJECT_ROOT/dashboard/node_modules" ]; then
  echo -e "${DIM}前端依赖未安装，正在执行 npm install...${NC}"
  (cd "$PROJECT_ROOT/dashboard" && npm install)
fi

# ── 可选参数 ──────────────────────────────────────
BACKEND_PORT="${AGORA_BACKEND_PORT:-18420}"
FRONTEND_PORT="${AGORA_FRONTEND_PORT:-33173}"
DB_PATH="${AGORA_DB_PATH:-$HOME/.agora/agora.db}"
CONFIG_PATH="${AGORA_CONFIG_PATH:-}"
CLEAN_LEGACY_PORTS="${AGORA_CLEAN_LEGACY_PORTS:-1}"
CRAFTSMAN_SERVER_MODE="${AGORA_CRAFTSMAN_SERVER_MODE:-${AGORA_CRAFTSMAN_ADAPTER_MODE:-watched}}"
WATCH_WORKSPACE_BUILD="${AGORA_WATCH_WORKSPACE_BUILD:-1}"

# ── 清理已知旧端口 ───────────────────────────────
if [ "$CLEAN_LEGACY_PORTS" = "1" ] && command -v killport &>/dev/null; then
  for old_port in 5173 5177 8420 8422; do
    if [ "$old_port" != "$BACKEND_PORT" ] && [ "$old_port" != "$FRONTEND_PORT" ]; then
      killport "$old_port" >/dev/null 2>&1 || true
    fi
  done
fi

# ── 端口预检查 ─────────────────────────────────────
if ! (
  cd "$PROJECT_ROOT/agora-ts" &&
  ./node_modules/.bin/tsx packages/config/src/dev-start-check.ts "$BACKEND_PORT" "$FRONTEND_PORT"
); then
  echo -e "${RED}✗ 端口冲突，请先释放占用端口或通过环境变量指定新端口${NC}"
  echo -e "${DIM}  推荐方式: cp .env.example .env 后修改端口，再执行 ./scripts/dev-start.sh${NC}"
  exit 1
fi

# ── 启动后端 ──────────────────────────────────────
echo -e "${GREEN}▶ 预构建 agora-ts workspace${NC}"
(cd "$PROJECT_ROOT/agora-ts" && npm run build)

if [ "$WATCH_WORKSPACE_BUILD" = "1" ]; then
  echo -e "${GREEN}▶ 启动 TypeScript workspace 监视${NC}"
  echo -e "${DIM}  packages/* 变更将持续重编，避免 server 继续吃旧 dist${NC}"
  (
    cd "$PROJECT_ROOT/agora-ts"
    ./node_modules/.bin/tsc -b tsconfig.workspace.build.json --watch --preserveWatchOutput
  ) &
  BUILD_WATCH_PID=$!
fi

echo -e "${GREEN}▶ 启动后端 (agora-ts)${NC}  http://localhost:${BACKEND_PORT}"
echo -e "${DIM}  数据库: ${DB_PATH}${NC}"
echo -e "${DIM}  Craftsman server mode: ${CRAFTSMAN_SERVER_MODE}${NC}"

(
  cd "$PROJECT_ROOT/agora-ts"
  AGORA_BACKEND_PORT="$BACKEND_PORT" \
  AGORA_DB_PATH="$DB_PATH" \
  AGORA_CONFIG_PATH="$CONFIG_PATH" \
  AGORA_CRAFTSMAN_SERVER_MODE="$CRAFTSMAN_SERVER_MODE" \
  npm run dev -w @agora-ts/server
) &
BACKEND_PID=$!

# 等待后端启动
sleep 2
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo -e "${RED}✗ 后端启动失败，请检查日志${NC}"
  exit 1
fi

# ── 启动前端 ──────────────────────────────────────
echo -e "${GREEN}▶ 启动前端${NC}  http://localhost:${FRONTEND_PORT}/dashboard/"
echo -e "${DIM}  API proxy → http://localhost:${BACKEND_PORT}/api${NC}"

(cd "$PROJECT_ROOT/dashboard" && npm run dev -- --strictPort --port "$FRONTEND_PORT") &
FRONTEND_PID=$!

echo ""
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo -e "${CYAN}  开发环境就绪${NC}"
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo ""
if [ -f "$ENV_FILE" ]; then
  echo -e "${DIM}配置文件: $ENV_FILE${NC}"
else
  echo -e "${DIM}未发现 .env，使用脚本默认端口${NC}"
fi
echo -e "  Craftsmen:    server=${CRAFTSMAN_SERVER_MODE} cli=${AGORA_CRAFTSMAN_CLI_MODE:-${AGORA_CRAFTSMAN_ADAPTER_MODE:-tmux}}"
echo -e "  后端 API:    http://localhost:${BACKEND_PORT}/api/health"
echo -e "  前端页面:    http://localhost:${FRONTEND_PORT}/dashboard/"
echo -e "  Dashboard:   http://localhost:${BACKEND_PORT}/dashboard/"
echo -e "              ${DIM}(生产构建后可用)${NC}"
echo ""
echo -e "${DIM}按 Ctrl+C 停止所有服务${NC}"
echo ""

# 持续等待，直到 Ctrl+C 或某进程意外退出
while true; do
  # 检查后端是否还在运行
  if [ -n "$BACKEND_PID" ] && ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo -e "${RED}✗ 后端进程已退出${NC}"
    cleanup
  fi
  sleep 2
done
