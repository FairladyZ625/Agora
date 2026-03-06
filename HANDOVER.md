# Agora Week 2 交接文档

**日期**: 2026-03-06
**完成进度**: Wave 1-2 完成 (5/8 任务)
**待执行**: Wave 3-5 (3 任务 + 集成测试)

---

## 已完成工作 (Wave 1-2)

### Wave 1: 核心模块 (T1, T2, T3)

| 任务 | 模块 | 测试 | Commit |
|------|------|------|--------|
| T1 | GateKeeper (6 种 Gate) | 18 passed | 2108838 |
| T2 | Permission 权限矩阵 | 14 passed | 2c32407 |
| T3 | ProgressSync 三层活动流 | 9 passed | 7ad8e6c |

**产出文件**:
- `agora/core/gate_keeper.py` — 完整 Gate 系统 (command, archon_review, all_subtasks_done, approval, auto_timeout, quorum)
- `agora/core/permission.py` — allowAgents 权限矩阵 + 三路认证
- `agora/core/progress_sync.py` — flow/progress/system 三层活动日志

### Wave 2: 集成与文档 (T4, T5)

| 任务 | 内容 | 测试 | Commit |
|------|------|------|--------|
| T4 | ModeController + CLI 扩展 | 20 passed | 0e3115c |
| T5 | 架构文档更新 + Walkthrough | N/A | 3b458f5 (docs repo) |

**T4 产出**:
- `agora/core/mode_controller.py` — discuss/execute 模式切换
- `agora/core/task_mgr.py` — 重构集成 GateKeeper/Permission/ProgressSync，新增 11 个方法
- `agora/scripts/agora_cli.py` — 新增 11 个命令: approve, reject, archon-approve, archon-reject, confirm, subtask-done, force-advance, unblock, pause, resume, cancel

**T5 产出** (docs repo):
- `docs/walkthrough/README.md` — 索引
- `docs/walkthrough/week1-core-skeleton.md` — Week 1 总结
- `docs/walkthrough/week2-adapter-integration.md` — Week 2 总结
- `docs/01-PLANS/01-architecture.md` — 更新适配层为 HTTP 桥接方案
- `docs/01-PLANS/07-implementation-plan.md` — 标记 Phase 0 完成

**测试状态**: 全部 61 个测试通过
```bash
cd /Users/lizeyu/Projects/Agora
python -m pytest agora/tests/test_core/ -v
# ============================== 61 passed in 0.27s ==============================
```

---

## 待执行任务 (Wave 3-5)

### Wave 3: HTTP Server (T6)

**任务**: 实现 Agora HTTP Server (FastAPI)，暴露 REST API 供 OpenClaw 插件调用

**依赖**: T4 已完成 ✅

**产出文件**:
- `agora/server/__init__.py`
- `agora/server/app.py` — FastAPI application factory
- `agora/server/routes.py` — REST API 路由 (16+ 端点)
- `agora/tests/test_server/test_routes.py` — HTTP API 测试
- `pyproject.toml` — 添加 fastapi, uvicorn 依赖
- `agora/scripts/agora_cli.py` — 添加 `serve` 命令

**REST API 端点** (参考 `docs/plans/2026-03-06-week2-adapter-integration.md` Task 6):
- `POST /api/tasks` — 创建任务
- `GET /api/tasks` — 列出任务
- `GET /api/tasks/{id}` — 获取任务
- `GET /api/tasks/{id}/status` — 任务状态详情
- `POST /api/tasks/{id}/advance` — 推进
- `POST /api/tasks/{id}/approve` — 审批通过
- `POST /api/tasks/{id}/reject` — 审批打回
- `POST /api/tasks/{id}/archon-approve` — Archon 审批
- `POST /api/tasks/{id}/archon-reject` — Archon 驳回
- `POST /api/tasks/{id}/confirm` — Quorum 投票
- `POST /api/tasks/{id}/subtask-done` — 子任务完成
- `POST /api/tasks/{id}/force-advance` — 强制推进
- `POST /api/tasks/{id}/pause` — 暂停
- `POST /api/tasks/{id}/resume` — 恢复
- `POST /api/tasks/{id}/cancel` — 取消
- `POST /api/tasks/{id}/unblock` — 解除阻塞
- `POST /api/tasks/cleanup` — 清理 orphaned
- `GET /api/health` — 健康检查

**实现步骤**:
1. 更新 `pyproject.toml` 添加依赖
2. 写测试 `test_routes.py` (参考计划文档中的完整测试代码)
3. 实现 `app.py` 和 `routes.py` (参考计划文档中的完整实现代码)
4. 运行测试确认通过: `pytest agora/tests/test_server/ -v`
5. 添加 CLI `serve` 命令
6. 提交: `git commit -m "feat: implement Agora HTTP Server with FastAPI REST API"`

**验证**:
```bash
# 启动服务器
python -m agora.scripts.agora_cli serve

# 测试 API
curl http://127.0.0.1:8420/api/health
curl -X POST http://127.0.0.1:8420/api/tasks -H "Content-Type: application/json" -d '{"title":"测试","type":"quick"}'
```

---

### Wave 4: OpenClaw Plugin (T7)

**任务**: 实现 OpenClaw Agora Plugin (TypeScript)，通过 HTTP 桥接调用 Agora Server

**依赖**: T6 (HTTP Server) 必须先完成

**产出文件**:
- `extensions/agora-plugin/package.json`
- `extensions/agora-plugin/tsconfig.json`
- `extensions/agora-plugin/openclaw.plugin.json` — 插件配置
- `extensions/agora-plugin/src/index.ts` — 插件入口
- `extensions/agora-plugin/src/commands.ts` — /task 命令注册
- `extensions/agora-plugin/src/bridge.ts` — HTTP 桥接层

**实现步骤**:
1. 创建插件项目结构
2. 实现 HTTP Bridge (`bridge.ts`) — 封装所有 REST API 调用
3. 实现命令注册 (`commands.ts`) — 注册 `/task` 命令，路由到 bridge
4. 实现插件入口 (`index.ts`) — 初始化 bridge + 注册命令
5. 构建: `cd extensions/agora-plugin && npm install && npm run build`
6. 配置 OpenClaw: 在 `openclaw.json` 中添加插件配置
7. 提交: `git commit -m "feat: implement OpenClaw Agora plugin with /task commands via HTTP bridge"`

**详细实现代码**: 参考 `docs/plans/2026-03-06-week2-adapter-integration.md` Task 7

**验证**:
1. 启动 Agora Server: `agora serve`
2. 启动 OpenClaw (插件自动加载)
3. 在 Discord 中测试: `/task create coding "测试任务"`

---

### Wave 5: 集成测试 + Review (T8)

**任务**: 端到端集成测试 + 代码审查 + 最终提交

**依赖**: T7 (OpenClaw Plugin) 必须先完成

**验证清单**:
1. ✅ `agora serve` 启动 HTTP Server
2. ✅ `agora create --type coding "测试任务"` → OC-001 创建成功
3. ✅ `agora archon-approve OC-001` → archon_review Gate 通过
4. ✅ `agora advance OC-001` → discuss → develop
5. ✅ `agora subtask-done OC-001 dev-api --output "完成"` → 子任务完成
6. ✅ `agora advance OC-001` → develop → review (all_subtasks_done Gate)
7. ✅ `agora approve OC-001` → approval Gate 通过
8. ✅ `agora advance OC-001` → 任务完成
9. ✅ `agora list --state done` → 显示已完成任务
10. ✅ `agora status OC-001` → flow_log 完整记录
11. ✅ HTTP API: `curl http://127.0.0.1:8420/api/tasks` → JSON 响应
12. ✅ 所有 pytest 通过: `python -m pytest agora/tests/ -v`

**代码审查重点**:
- 模块间接口一致性
- 错误处理覆盖
- flow_log 记录完整性
- HTTP API 安全性

**最终提交**:
```bash
git add -A
git commit -m "feat: Week 2 — GateKeeper, Permission, ProgressSync, HTTP Server, OpenClaw Plugin"
```

---

## 技术栈与工具

**Python 环境**:
- Python 3.11+
- SQLite (WAL 模式)
- typer (CLI)
- pytest (测试)
- FastAPI + uvicorn (HTTP Server)

**TypeScript 环境** (OpenClaw Plugin):
- Node.js 18+
- TypeScript 5+
- OpenClaw Plugin SDK

**测试命令**:
```bash
# 运行所有测试
python -m pytest agora/tests/ -v

# 运行特定模块测试
python -m pytest agora/tests/test_core/test_gate_keeper.py -v
python -m pytest agora/tests/test_server/ -v

# 测试覆盖率
python -m pytest agora/tests/ --cov=agora --cov-report=html
```

---

## 关键设计决策

1. **OpenClaw 集成方式**: 通过 Plugin SDK 实现，不修改 OpenClaw 源码
2. **Python ↔ TypeScript 通信**: HTTP API 桥接 (FastAPI Server)
3. **GateKeeper 独立**: 从 StateMachine 中独立为专门模块
4. **所有 Agent 使用 Sonnet 4.6**: 协调器使用 Opus
5. **TDD 流程**: 先写测试，再实现，确保测试通过后提交

---

## 参考文档

**设计文档** (docs repo):
- `docs/01-PLANS/01-architecture.md` — 系统架构
- `docs/01-PLANS/02-task-lifecycle.md` — 任务生命周期
- `docs/01-PLANS/06-commands-api.md` — 命令 API 定义
- `docs/plans/2026-03-06-week2-adapter-integration.md` — Week 2 实现计划 (完整代码)

**Walkthrough**:
- `docs/walkthrough/week1-core-skeleton.md` — Week 1 总结
- `docs/walkthrough/week2-adapter-integration.md` — Week 2 总结

**项目约定**:
- `/Users/lizeyu/Projects/Agora/CLAUDE.md` — 项目级约定
- `/Users/lizeyu/CLAUDE.md` — 全局行为规范

---

## Git 状态

**主仓库** (`/Users/lizeyu/Projects/Agora`):
```bash
git log --oneline -5
# 0e3115c feat: integrate GateKeeper/Permission/ProgressSync, add ModeController and extend CLI
# 2108838 feat: implement GateKeeper with all 6 gate types and command routing
# 7ad8e6c feat: implement ProgressSync three-layer activity logging
# 2c32407 feat: implement Permission manager with allowAgents matrix and auth
# 5d4ef78 fix: remove duplicate plan file, plan lives in docs repo
```

**文档仓库** (`/Users/lizeyu/Projects/Agora/docs`):
```bash
cd docs && git log --oneline -3
# 3b458f5 docs: add walkthrough docs and update architecture for Week 2
# e725101 docs: add Week 2 implementation plan
# d05053a docs: initial commit with Agora documentation and session summary
```

---

## 联系方式

如有问题，参考：
- 实现计划: `docs/plans/2026-03-06-week2-adapter-integration.md` (包含所有任务的完整测试和实现代码)
- 设计文档: `docs/01-PLANS/` 目录
- Walkthrough: `docs/walkthrough/` 目录

**下一步**: 执行 Wave 3 (T6: HTTP Server)
