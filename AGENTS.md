
# Agora 项目约定

## 项目概述

Agora 是一个多 Agent 民主编排框架，基于 SQLite + Python 实现。

## 目录结构

```
agora/
├── core/           # 编排层核心（enums, db, task_mgr, state_machine, gate_keeper, permission, progress_sync）
├── adapters/       # 适配层（base + openclaw）
├── craftsmen/      # 工匠层（CLI 调度）
├── server/         # HTTP Server (FastAPI)
├── templates/      # 任务模板 + 治理预设 JSON
├── scripts/        # CLI 工具（agora_cli.py）
├── tests/          # 测试
└── config/         # 配置示例

dashboard/          # 前端 Dashboard（React + TypeScript + Vite）
├── src/
│   ├── components/ # ui/ (基础) + features/ (业务) + layouts/ (布局)
│   ├── stores/     # Zustand 状态管理
│   ├── lib/        # API Client + 工具函数
│   ├── types/      # TypeScript 类型定义
│   └── pages/      # 页面组件
└── dist/           # 生产构建产物（FastAPI 静态挂载 /dashboard/）

docs/               # 独立 Git 仓库（设计文档 + Walkthrough）
├── 00-RAW-PRDS/       # 历史架构/需求原始文档（过渡保留）
├── 01-GOVERNANCE/     # 治理规范
├── 02-PRODUCT/        # 产品文档与用户指南
├── 03-ARCHITECTURE/   # 架构索引与设计文档
├── 04-DEVELOPMENT/    # 开发规范与实施指南
├── 05-TEST-QA/        # 测试策略与验收模板
├── 06-INTEGRATIONS/   # 外部系统集成
├── 07-OPERATIONS/     # 运维与 runbook
├── 08-SECURITY/       # 安全与合规
├── 09-PLANNING/TASKS/ # 任务工作区（每次任务独立目录）
│   └── <YYYY-MM-DD-任务名>/
├── 10-WALKTHROUGH/    # 交接复盘索引
└── 11-REFERENCE/      # 文档库规范与参考
```

## 文档落盘强制规则（新增，最高优先级）

- **所有过程记录文件严禁放在项目根目录**（包括 `task_plan.md` / `findings.md` / `progress.md` / `notes.md`）。
- 所有非平凡任务的过程文件必须放在：
  - `docs/09-PLANNING/TASKS/<YYYY-MM-DD-任务名>/task_plan.md`
  - `docs/09-PLANNING/TASKS/<YYYY-MM-DD-任务名>/findings.md`
  - `docs/09-PLANNING/TASKS/<YYYY-MM-DD-任务名>/progress.md`
- `docs/` 是独立 Git 仓库，文档只在 `docs` 仓库提交维护；**不要把 docs 文档提交到主仓库**。
- 每个新任务必须创建独立文件夹，不可与历史任务共用同一组过程文件。
- 所有文档写作与使用必须遵循：`docs/11-REFERENCE/docs-library-standard.md`（强制规范）。
- **Agora 项目唯一实施单一视图（SSoT）固定为**：`docs/Agora-实施排期.md`
  - 该文件统一维护：实现计划、实现计审、实现状态矩阵、待开发清单、当前优先级
  - 所有新 wave 开始前必须先读该文件
  - 所有非平凡开发完成后必须先更新该文件，再更新对应任务过程文档与 walkthrough
  - 禁止额外创建并行的“总表型计划 / 状态矩阵 / 进度总览”文档

## 文档规范引用（强制）

- 规范文件：
  - `docs/11-REFERENCE/docs-library-standard.md`
  - `docs/11-REFERENCE/engineering-standard.md`
  - `docs/11-REFERENCE/testing-standard.md`
  - `docs/11-REFERENCE/execution-workflow-standard.md`
  - `docs/11-REFERENCE/walkthrough-standard.md`
  - `docs/11-REFERENCE/dashboard-frontend-standard.md`(**Dashboard 前端开发权威规范**)
- 适用范围：所有 Agent、所有文档类型（计划/发现/进度/用户文档/集成文档/walkthrough）
- 执行要求：
  - 写文档前先读该规范；
  - 文档目录、命名、模板结构必须符合规范；
  - 评审文档时按规范中的“文档评审清单”逐项检查。
  - 开发执行必须遵循 `planning-with-files + ralph-loop` 持续收敛流程。
  - **前端开发必须先读 `dashboard-frontend-standard.md`**，遵循技术栈、设计基调和检查清单。
  - **Dashboard 前端新增约束**：所有尺寸治理必须同步更新 `dashboard/scripts/check-visual-governance.mjs`；新增尺寸 token、布局原语或组件尺寸 API 时，必须同步更新 `dashboard-frontend-standard.md`。

## 技术栈

### 后端

- Python 3.11+
- SQLite（WAL 模式 + 乐观锁）
- typer（CLI 框架）
- FastAPI + uvicorn（HTTP Server，端口 8420）
- pytest（测试框架）
- enum.Enum + str mixin

### 前端（Dashboard）

- Vite 7.x + React 19.x + TypeScript 5.x（strict mode）
- Tailwind CSS 4.x（样式 + CSS 变量主题）
- Zustand 5.x（状态管理）
- React Router 7.x + Lucide React（图标）
- 设计基调：**沉稳克制高信息密度**，参考 Linear/Raycast，**禁止紫色**
- Light / Dark / System 三态主题
- 详细规范：`docs/11-REFERENCE/dashboard-frontend-standard.md`
- Dashboard 前端强制治理规则：
  - 颜色、字号、间距、圆角、宽度、断点全部先定义 token，再允许消费
  - 禁止在 `.tsx/.ts` 中使用 Tailwind arbitrary value
  - 禁止基础组件暴露自由尺寸字符串/数字 API
  - 禁止页面私有定义局部容器宽度与 split 比例
  - 移动端必须按独立布局规则设计，不接受“桌面堆叠即适配”
  - 真实 API 对接必须先定义 `types/api.ts` DTO，再通过 mapper 转成 `types/task.ts` ViewModel
  - 页面和布局组件禁止直接消费后端 DTO
  - 运行时禁止 silent mock fallback；请求失败必须显示真实错误
  - 新增接口接入前必须先写 mapper/store 测试，再写页面接线
  - Vite `/api` 代理与本地联调默认端口固定为 `8420`

### 开发环境一键启动

```bash
./docs/02-PRODUCT/scripts/dev-start.sh
```

---

## 开发工作流（必须遵守）

### 1. 使用 planning-with-files Skill

**所有非平凡任务必须使用 `planning-with-files` skill**，创建三个核心文件：

- `docs/09-PLANNING/TASKS/<YYYY-MM-DD-任务名>/task_plan.md` — 任务计划和阶段追踪
- `docs/09-PLANNING/TASKS/<YYYY-MM-DD-任务名>/findings.md` — 研究发现和知识积累
- `docs/09-PLANNING/TASKS/<YYYY-MM-DD-任务名>/progress.md` — 执行日志和进度记录

**调用方式**:

```
Skill(skill="planning-with-files")
```

**关键规则**:

- 每个阶段开始前读取 `task_plan.md`，完成后更新状态
- 每 2 次搜索/浏览操作后立即保存发现到 `findings.md`
- 所有错误必须记录到 `task_plan.md` 的 "Errors Encountered" 表格
- 3 次失败后升级给用户
- 禁止在仓库根目录创建过程记录文件

### 2. 测试驱动开发 (TDD)

**所有代码实现必须遵循 TDD 流程**:

1. 写测试文件（`agora/tests/test_core/test_xxx.py`）
2. 运行测试确认失败（`pytest agora/tests/test_core/test_xxx.py -v`）
3. 写实现代码（`agora/core/xxx.py`）
4. 运行测试确认通过
5. 提交代码

**测试命令**:

```bash
# 运行所有测试
python -m pytest agora/tests/ -v

# 运行特定模块测试
python -m pytest agora/tests/test_core/test_gate_keeper.py -v

# 测试覆盖率
python -m pytest agora/tests/ --cov=agora --cov-report=html
```

### 3. 使用 feature-dev Skill

**复杂功能开发必须使用 `feature-dev` skill**，遵循以下阶段：

1. **Discovery** — 理解需求
2. **Codebase Exploration** — 启动 code-explorer agents 并行探索
3. **Clarifying Questions** — 填补需求空白
4. **Architecture Design** — 启动 code-architect agents 设计方案
5. **Implementation** — 执行实现
6. **Quality Review** — 启动 code-reviewer agents 审查
7. **Summary** — 总结交付

**调用方式**:

```
Skill(skill="feature-dev")
```

### 4. Walkthrough 文档

**每个开发周期结束后必须写 Walkthrough 文档**，记录到 `docs/10-WALKTHROUGH/` 目录，并严格遵循：

- `docs/11-REFERENCE/walkthrough-standard.md`
- 每次任务完成必须新增或更新对应 walkthrough，并同步更新 `docs/10-WALKTHROUGH/README.md` 索引。

- 开发过程总结
- 架构决策记录
- 关键问题和解决方案
- 测试结果和验证方法

**格式参考**:

- `docs/10-WALKTHROUGH/week1-core-skeleton.md`
- `docs/10-WALKTHROUGH/week2-adapter-integration.md`

### 5. 架构变更同步

**所有架构变更必须同步更新原有计划文档**，保持代码和文档一致性：

- 修改 `docs/00-RAW-PRDS/01-architecture.md` — 架构变更
- 修改 `docs/00-RAW-PRDS/07-implementation-plan.md` — 实施进度
- 修改相关设计文档

---

## 编码规范

### Python 代码规范

- 枚举使用 `class XxxState(str, Enum)` 模式（EscalationLevel 除外，使用 `int, Enum`）
- 所有枚举值必须与 `docs/00-RAW-PRDS/ENUMS.md` 完全一致
- JSON 字段用 TEXT 存储在 SQLite 中
- 所有写操作使用事务（BEGIN → 操作 → COMMIT）
- 乐观锁：UPDATE 时校验 version 字段
- 使用 type hints（`from typing import Optional, dict, list`）
- Docstring 使用简洁的单行或多行格式

### 测试规范

- 测试文件命名：`test_<module>.py`
- 使用 pytest fixtures 管理测试数据
- 每个测试类对应一个功能点（如 `TestCommandGate`）
- 测试方法命名：`test_<scenario>_<expected_result>`
- 使用 `tmp_path` fixture 创建临时数据库

### Git 提交规范

- 提交人：ZeyuLi
- 前缀：`feat/fix/refactor/docs/test`
- 信息聚焦变更本身，不提 AI
- 每个独立功能完成后立即提交
- Commit message 格式：`<type>: <description>`
  - 示例：`feat: implement GateKeeper with all 6 gate types and command routing`

---

## 文档仓库（独立 Git 仓库）

**重要**: `docs/` 目录是独立的 Git 仓库，与主仓库分离管理。

### 提交到 docs 仓库

```bash
cd docs
git add <files>
git commit -m "docs: <description>"
git push
```

### 文档结构

```
docs/
├── 00-RAW-PRDS/        # 历史文档（过渡保留）
├── 01-GOVERNANCE/
├── 02-PRODUCT/
├── 03-ARCHITECTURE/
├── 04-DEVELOPMENT/
├── 05-TEST-QA/
├── 06-INTEGRATIONS/
├── 07-OPERATIONS/
├── 08-SECURITY/
├── 09-PLANNING/TASKS/  # 任务过程文件（每次任务独立目录）
│   └── <YYYY-MM-DD-任务名>/
├── 10-WALKTHROUGH/     # 交接/复盘
└── 11-REFERENCE/       # 文档库规范与模板
```

### 文档更新规则

- `docs/Agora-实施排期.md` 是 Agora 项目的当前实施口径与唯一填写入口
- 架构变更必须更新 `00-RAW-PRDS/01-architecture.md`
- 实施进度必须更新 `00-RAW-PRDS/07-implementation-plan.md`
- 每周结束必须写 Walkthrough 文档
- 所有文档提交到 docs 仓库，不提交到主仓库
- 所有过程记录必须位于 `docs/09-PLANNING/TASKS/<YYYY-MM-DD-任务名>/` 任务目录

---

## 设计文档参考

### 核心设计文档

- 实施总表：`docs/Agora-实施排期.md`（**当前实现状态、开发顺序、实现计审唯一入口**）
- 架构：`docs/00-RAW-PRDS/01-architecture.md`
- 生命周期：`docs/00-RAW-PRDS/02-task-lifecycle.md`
- 枚举定义：`docs/00-RAW-PRDS/ENUMS.md`
- 命令 API：`docs/00-RAW-PRDS/06-commands-api.md`
- 实施计划：`docs/00-RAW-PRDS/07-implementation-plan.md`

### 实现计划

- Week 2 计划：`docs/09-PLANNING/TASKS/2026-03-06-week2-adapter-integration/plan.md`（包含完整测试和实现代码）

### Walkthrough

- Week 1 总结：`docs/10-WALKTHROUGH/week1-core-skeleton.md`
- Week 2 总结：`docs/10-WALKTHROUGH/week2-adapter-integration.md`

---

## OpenClaw 集成

### 环境路径

- 配置目录：`/Users/lizeyu/.openclaw/`
- 源码目录：`/Users/lizeyu/Projects/openclaw/`
- Agora 设计文档副本：`/Users/lizeyu/.openclaw/docs/09-PLANNING/TASKS/agora/`

### 集成方式

- **不修改 OpenClaw 源码**
- 通过 Plugin SDK 实现插件（`extensions/agora-plugin/`）
- Python ↔ TypeScript 通过 HTTP API 桥接（FastAPI Server）

---

## Agent Teams 编排

### 使用场景

- 复杂多模块任务（3+ 模块）
- 需要并行开发的独立任务
- 需要多角色协作的任务

### 编排规范

- 所有 teammate 使用 Sonnet 4.6 模型
- 协调器使用 Opus 模型
- 使用 TaskList 管理依赖关系
- 每个 Wave 完成后 Review 再启动下一 Wave

### 参考

- Agent Teams 手册：`agent-teams-playbook` skill
- Week 2 实施案例：5 个 Wave，8 个任务，61 个测试
