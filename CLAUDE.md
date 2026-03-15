
# Agora 项目约定

## 架构最高原则（最高优先级，强制）

- **一切架构设计以“解耦、可插拔、可替换”为最高优先级原则。**
- **绝对禁止把核心编排语义耦合到任何具体 IM、任何具体 Agent Runtime、任何具体 Craftsman 实现里。**
- **Agora 的唯一核心主语义是 `Agora Core / Orchestrator`；上层 IM、下层 Runtime/Craftsmen 全部只是 adapter。**
- 所有新能力必须先问：
  - 这是不是 `Agora Core` 的职责？
  - 如果移除 Discord / OpenClaw / Codex，这个语义是否仍成立？
  - 如果未来替换为 Feishu / CrewAI / NanoClaw / Claude Code，这一层是否可以不改 Core 而仅替换 adapter？
- 如果答案是否定，则该设计不合格，必须重构。

### Agora 三层架构口径（强制）

- 上层：IM / Channel / Entry adapters
  - Discord
  - Feishu
  - Slack
  - Dashboard
  - CLI / REST
- 中层：`Agora Core / Orchestrator`
  - Task / Context / Participant / RuntimeBinding / Execution / Event / Notification
  - State machine / Gate / Scheduler / Recovery / Archive
- 下层：
  - Agent Runtime / Host adapters
    - OpenClaw
    - CrewAI
    - NanoClaw
    - 未来其他 Runtime
  - Craftsman / Execution Engine adapters
    - Codex
    - Claude Code
    - Gemini
    - 未来其他执行器

### 开发硬约束

- `packages/core` 只能表达核心语义、抽象端口、状态机与规则，不能写死平台名业务规则。
- 任何具体平台接入必须作为独立 adapter / integration 包实现。
- 任何 provider-specific 数据只能作为 adapter 状态或投影，不能成为长期 Core 主模型。
- `apps/server` 与 `apps/cli` 是 composition root，负责绑定 adapter，不负责承载核心业务语义。
- 当前与未来所有 adapter 开发，必须遵循：
  - `docs/11-REFERENCE/agora-core-decoupling-standard.md`
  - `docs/03-ARCHITECTURE/2026-03-09-agora-core-orchestration-rebaseline.md`

### 人类审批与 Agent 自动化边界（强制）

- Dashboard 是**人类操作入口**，CLI / REST 是**Agent 与自动化入口**；两者职责必须明确分离。
- 任何“必须由人类确认”的动作，当前口径只允许通过 Dashboard 登录态触发；禁止用前端自由传入的 `reviewer_id` / `approver_id` 伪造人工身份。
- Core 只消费统一 actor / permission 语义，不直接判断“是不是人类”；“这是登录的人类”这一事实必须由 Dashboard / session adapter 提供。
- Agent 默认不通过 Dashboard 执行任务编排；Agent 侧主入口是 CLI，其次是 REST API。
- 除“必须人类确认”的能力外，所有新增任务动作、运行态操作、运维动作、作者工具接口，都必须同步提供 CLI 入口，确保 Agent 可自动化调用。
- 新增 REST API、task action、runtime operation、authoring capability 时，必须同时评估并补齐：
  - 对应 CLI command
  - 对应 CLI tests
  - 必要的 scenario / harness 覆盖
- 轻量多用户账号体系可以落在 SQLite，但这只解决“谁能登录 / 谁能审批”；当前阶段**不默认引入任务隔离**，未来若做企业级多租户/多人员任务域隔离，必须作为独立能力设计与实施。

### Entry Surface Matrix（强制）

- **Agent -> CLI**
  - 适用对象：本机运行的 controller / citizen / craftsman manager agent
  - 默认职责：task orchestration、template/graph authoring、role/binding 查询与修改、运维与 scenario 回归
  - 原因：Agent 已有本机 shell，不应绕行 IM slash command 或人类桥接层
- **Human -> Dashboard**
  - 适用对象：必须确认的人类审批、需要真实登录态的人类操作
  - 默认职责：approve / reject / archon review / 未来更严格的人类确认动作
- **Human -> Slash Command（IM）**
  - 适用对象：不在电脑前的人类、移动端用户、轻量状态查询与手动触发
  - 默认职责：只读查询、轻量 task create、非高风险 task action、thread/context 辅助动作
  - 前提：必须由 REST/server facade 承接，不能要求人类直接依赖本机 CLI
- **REST -> Service / Integration Facade**
  - 默认职责：给 Dashboard、plugin、外部系统、人类 IM bridge 提供统一服务入口
  - 禁止把 REST 误当成“Agent 必须经过的主入口”；本机 agent 仍优先直接调用 CLI

### Slash Command 补齐规则（强制）

- 新增 capability 时，必须先判断调用者：
  - 如果主要调用者是本机 agent：先补 CLI
  - 如果需要给人类在 IM 中使用：再补 REST + plugin/slash bridge
- 当前建议的 slash command 能力分层：
  - 只读 slash：`status/list/show/render/validate`
  - 轻量执行 slash：`create/advance/unblock/pause/resume/cleanup`
  - 人类确认动作：仍以 Dashboard 登录态为准；如需 IM 入口，必须通过 server 识别真实人类身份，不能伪造 `reviewer_id/approver_id`
- plugin 的默认职责是：
  - 人类 slash command bridge
  - live status / conversation / receipt 回投
  - 轻量查询与人类触发的 task action
- plugin **不是**本机 agent 的主控制面；禁止为了让 agent 调用 Agora，而把核心编排逻辑复制进 plugin。

## 项目概述

Agora 是一个多 Agent 民主编排框架。当前默认实现口径已经切向 `agora-ts/`，采用 SQLite + TypeScript/Node.js；旧 Python 实现已不再保留在主仓库中。

## 目录结构

```
agora-ts/           # TypeScript 主实现（默认开发目标）
├── apps/
│   ├── server/     # Fastify HTTP Server
│   └── cli/        # Commander CLI
├── packages/
│   ├── contracts/  # 共享 DTO / schema
│   ├── core/       # 状态机、TaskService、Gate/Permission、Dashboard query
│   ├── db/         # SQLite migration + repositories
│   ├── config/     # 配置 schema / loader
│   └── testing/    # 测试 runtime / helpers

dashboard/          # 前端 Dashboard（React + TypeScript + Vite）
├── src/
│   ├── components/ # ui/ (基础) + features/ (业务) + layouts/ (布局)
│   ├── stores/     # Zustand 状态管理
│   ├── lib/        # API Client + 工具函数
│   ├── types/      # TypeScript 类型定义
│   └── pages/      # 页面组件
└── dist/           # 生产构建产物（agora-ts server 静态挂载 /dashboard/）

Doc/                # 主仓库内可公开分享的文档包（白皮书/教程/架构概览）
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
- **Agora TS 默认实施单一视图（SSoT）固定为**：`docs/Agora-实施排期-Agora-TS.md`
  - 该文件统一维护：`agora-ts/` 的实现计划、实现计审、实现状态矩阵、待开发清单、当前优先级
  - 所有 TS 新 wave 开始前必须先读该文件
  - 所有 TS 非平凡开发完成后必须先更新该文件，再更新对应任务过程文档与 walkthrough
  - `docs/Agora-实施排期.md` 仅保留为 legacy / 现网参考口径
  - 禁止额外创建并行的“总表型计划 / 状态矩阵 / 进度总览”文档

## 文档规范引用（强制）

- 规范文件：
  - `docs/11-REFERENCE/docs-library-standard.md`
  - `docs/11-REFERENCE/engineering-standard.md`
  - `docs/11-REFERENCE/agora-core-decoupling-standard.md`
  - `docs/11-REFERENCE/testing-standard.md`
  - `docs/11-REFERENCE/execution-workflow-standard.md`
  - `docs/11-REFERENCE/walkthrough-standard.md`
  - `docs/11-REFERENCE/dashboard-frontend-standard.md`(**Dashboard 前端开发权威规范**)
- 适用范围：所有 Agent、所有文档类型（计划/发现/进度/用户文档/集成文档/walkthrough）
- 执行要求：
  - 写文档前先读该规范；
  - 文档目录、命名、模板结构必须符合规范；
  - 评审文档时按规范中的“文档评审清单”逐项检查。
  - **涉及架构、adapter、runtime、IM、craftsman 的开发前，必须先读 `agora-core-decoupling-standard.md`。**
  - **任何新增集成必须先定义 Core port，再实现 adapter；禁止先写 provider-specific 逻辑再倒推抽象。**
  - 开发执行必须遵循 `planning-with-files + ralph-loop` 持续收敛流程。
  - **前端开发必须先读 `dashboard-frontend-standard.md`**，遵循技术栈、设计基调和检查清单。
  - **Dashboard 前端新增约束**：所有尺寸治理必须同步更新 `dashboard/scripts/check-visual-governance.mjs`；新增尺寸 token、布局原语或组件尺寸 API 时，必须同步更新 `dashboard-frontend-standard.md`。

## 技术栈

### 后端（默认）

- TypeScript 5.x + Node.js 22+
- SQLite（WAL 模式）
- Commander（CLI 框架）
- Fastify（HTTP Server，默认端口由根目录 `.env` 管理）
- Vitest（测试框架）
- Zod（contracts / config schema）

### 后端（legacy 参考）

- Python 3.11+
- SQLite（WAL 模式 + 乐观锁）
- typer（CLI 框架）
- FastAPI + uvicorn
- pytest

### 前端（Dashboard）

- Vite 7.x + React 19.x + TypeScript 5.x（strict mode）
- Tailwind CSS 4.x（样式 + CSS 变量主题）
- Zustand 5.x（状态管理）
- React Router 7.x + Lucide React（图标）
- 设计基调：**白昼中枢式高信息密度系统界面**，强调 OS / console / command authority / telemetry 语法，**禁止紫色**
- Light / Dark / System 三态主题
- 详细规范：`docs/11-REFERENCE/dashboard-frontend-standard.md`
- Dashboard 前端强制治理规则：
  - 颜色、字号、间距、圆角、宽度、断点全部先定义 token，再允许消费
  - 禁止在 `.tsx/.ts` 中使用 Tailwind arbitrary value
  - 禁止基础组件暴露自由尺寸字符串/数字 API
  - 禁止页面私有定义局部容器宽度与 split 比例
  - 移动端必须按独立布局规则设计，不接受“桌面堆叠即适配”
  - 登录后的主工作台（AppShell、TopNav、Sidebar、workbench、detail sheet、toolbar、footer）必须先收敛共享移动端原语，再做页面级适配；禁止只在页面末端堆 `responsive.css` 补丁
  - `375px` 宽度下不得出现主页面级横向滚动；若存在列表/看板等高密度模块，必须提供单列、分段或 drawer/detail 的移动降级路径
  - Top bar、导航抽屉、filter popover、detail sheet、底部 action 区必须定义移动端单手操作和安全留白规则，不能直接沿用桌面命令条/双栏/右侧明细假设
  - 新增或修改移动端布局原语、尺寸 token、sheet/popover/pane 宽度规则时，必须同步更新 `dashboard/scripts/check-visual-governance.mjs` 与 `docs/11-REFERENCE/dashboard-frontend-standard.md`
  - Dashboard 页面在真实登录态下的移动端 Playwright 审计是强制项；至少覆盖 `375x812` 视口，并纳入浏览器兼容性审计脚本
  - 真实 API 对接必须先定义 `types/api.ts` DTO，再通过 mapper 转成 `types/task.ts` ViewModel
  - 页面和布局组件禁止直接消费后端 DTO
  - 运行时禁止 silent mock fallback；请求失败必须显示真实错误
  - 新增接口接入前必须先写 mapper/store 测试，再写页面接线
  - Vite `/api` 代理与本地联调默认从根目录 `.env` 的 `VITE_API_BASE_URL` 读取
  - 玻璃只能作为 authority / focus / overlay 增强层，不能重新退回“材质主导”视觉
  - 动态必须表达真实系统状态、信号或流转，不允许装饰性动画主导

### 开发环境一键启动

```bash
cp .env.example .env
./scripts/dev-start.sh
```

### 本地数据库路径治理（强制）

- **Agora TS 的统一运行时数据库默认路径固定为**：`~/.agora/agora.db`
- 该口径必须在以下位置保持一致：
  - `agora-ts/packages/config/src/index.ts` 中的 `defaultAgoraDbPath()`
  - 根目录 `.env` / `.env.example` 的 `AGORA_DB_PATH`
  - `docs/02-PRODUCT/scripts/dev-start.sh`
  - `agora-ts/packages/config/agora.example.json`
- **禁止把项目工作区内的 `tasks.db` 当作生产/默认数据库路径。**
- 项目目录下出现的 `tasks.db`、`runtime.db`、`test.db` 等文件名，当前默认只允许出现在：
  - test fixtures
  - tmp runtime
  - legacy / raw docs 示例
- 任何新增 runtime entrypoint、CLI bootstrap、server bootstrap、dev script、示例配置，如果默认仍指向 repo-local `tasks.db`，视为实现回退，必须修正。
- 数据表 schema/migration 的变更仍然发生在 **同一个统一 SQLite 数据库** 中；当前不再采用“项目侧单独一份数据库”的口径。
- 如需覆盖默认路径，必须显式通过：
  - `db_path`
  - `AGORA_DB_PATH`
    进行配置，而不是隐式回退到当前工作目录。

### 全仓 TypeScript 质量门

```bash
./scripts/check-ts-all.sh
```

默认启动目标已切换为：

- 后端：`agora-ts/apps/server`
- 前端：`dashboard`
- 本地开发端口与 server URL：项目根目录 `.env`

仅在需要对照 legacy 行为时才启动 Python 版本。

---

## 开发工作流（必须遵守）

### 0. 默认自主执行（强制）

- 默认假设：Agent 应持续推进当前实施排期，不因常规确认而停下。
- 只在以下情况允许中断等待人类：
  - 存在真实外部阻塞，例如凭证缺失、第三方服务不可达、权限不足
  - 发现高风险歧义，继续执行很可能造成错误数据、错误配置或不可逆副作用
  - 遇到明确要求人类决策的产品分叉点，且仓库内无法从现有 SSoT 推断
- 除上述情况外，Agent 必须：
  - 默认读取 `docs/Agora-实施排期-Agora-TS.md` 当前优先级；仅在维护 legacy 时参考 `docs/Agora-实施排期.md`
  - 自主创建新的 planning 任务目录
  - 按 `planning-with-files + TDD` 循环执行
  - 每一波完成后更新实施总表、planning、walkthrough
  - 跑满对应质量门，再继续下一波
- 默认优先级顺序：
  - 架构解耦与可插拔
  - 真实可用性
  - 测试与类型安全
  - 状态机/运行态收敛
  - UI/运维可观测性
- 禁止因为“没有新想法”而停下；应回到实施排期、walkthrough 和测试空洞继续收敛。

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

1. 写测试文件（优先 `agora-ts/**/src/*.test.ts`）
2. 运行测试确认失败（`npm test -- <test-file>`）
3. 写实现代码（优先 `agora-ts/apps/*` 或 `agora-ts/packages/*`）
4. 运行测试确认通过
5. 提交代码

**新增强制约束（Agent 自用测试工具维护）**:

- `agora-ts` 新增任务主链路、task action、authoring API、workflow 语义时，除了补单测/集成测试，还必须同步评估并更新 Agent 自用测试工具层。
- 这里的“测试工具层”包括：
  - `@agora-ts/testing` 中的 runtime / scenario primitives
  - 未来的 harness CLI / scenario scripts
  - root 级或子项目级 smoke / regression scripts
- 原则：如果一个新功能会被 Agent 反复通过 bash/CLI 调用验证，就不应只靠手工拼命令或临时脚本；应沉淀成可复用命令。
- 目标：让 Agent 后续能直接通过固定命令完成创建任务、推进、审批、驳回、quorum、cleanup 等典型流程回归。
- 每次相关能力扩展后，必须在本次 `task_plan.md` / `progress.md` 中记录：
  - 哪些现有测试工具已覆盖
  - 哪些 harness 命令或 scenario 需要补
  - 本轮是否已完成同步更新

**测试命令**:

```bash
# 运行 agora-ts 全量测试
cd agora-ts && npm test

# 运行指定测试文件
cd agora-ts && npm test -- packages/core/src/task-service.test.ts

# 类型与构建检查
cd agora-ts && npm run lint
cd agora-ts && npm run typecheck
cd agora-ts && npm run build

# agora-ts 统一质量门
cd agora-ts && npm run check

# agora-ts 严格质量门（默认提交口径）
cd agora-ts && npm run check:strict

# Agent 自用场景测试工具
cd agora-ts && npm run scenario:list
cd agora-ts && npm run scenario -- happy-path --json
cd agora-ts && npm run scenario:all

# 全仓统一质量门
node ./scripts/check-shared-contracts.mjs
./scripts/check-ts-all.sh
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
- 修改 `docs/11-REFERENCE/agora-core-decoupling-standard.md` — adapter / decoupling 规范
- 修改相关设计文档

---

## 编码规范

### 架构与 Adapter 开发规范（强制）

- 新增任何 IM / Runtime / Craftsman 集成时，必须优先判断其 adapter 分类：
  - IM adapter
  - runtime adapter
  - craftsman adapter
- 必须先在 Core/contracts 层定义抽象 port、DTO、event、receipt，再写 provider implementation。
- 禁止在 `packages/core` 中直接依赖 Discord/OpenClaw/Feishu SDK 或写死其业务规则。
- 禁止新增 provider-specific 主字段作为长期核心模型；短期兼容字段必须有迁移计划。
- 新 adapter 应优先作为独立包或独立 integration 目录开发，避免把平台细节散落进 Core。
- 新 adapter 必须提供：
  - unit tests
  - composition wiring tests
  - scenario / harness coverage
  - 故障、幂等、回执与重试说明
- 如需接 Discord/飞书等 IM：
  - 应开发对应 IM adapter 包
  - Core 只消费统一 provisioning / messaging port
- 如需接 OpenClaw/CrewAI/NanoClaw 等 runtime：
  - 应开发对应 runtime adapter 包
  - Core 只消费统一 inventory / presence / runtime binding / event ingestion port
- 如需接 Codex/Claude/Gemini 等 craftsman：
  - 应开发对应 craftsman adapter 包
  - Core 只消费统一 execution dispatch / callback / waiting-input contract

### Python 状态说明

- 主仓库当前不再保留 Python legacy 实现。
- 若未来需要恢复历史 Python 分支，只能作为独立历史维护事项处理，不能影响当前 TS 默认口径。

### 测试规范

TypeScript 默认规范：

- 测试文件命名：`src/*.test.ts`
- 使用 Vitest
- 临时 SQLite runtime 优先复用 `@agora-ts/testing`
- 新增 DTO / config / contract 时优先补 schema-level tests
- 后端提交前至少跑 `cd agora-ts && npm run check:strict`
- shared contracts 变更必须补 drift guard 或 contracts-level tests
- 涉及 plugin / dashboard 时，必须补跑对应子项目质量门
- 新增会被 Agent 高频调用的任务链路时，必须同步维护 Agent 自用 scenario / harness 脚本，不能让测试入口长期停留在手工命令拼装状态
- 优先复用：
  - `cd agora-ts && npm run scenario:list`
  - `cd agora-ts && npm run scenario -- <scenario> --json`
  - `cd agora-ts && npm run scenario:all`

### Git 提交规范

- 提交人：ZeyuLi
- 前缀：`feat/fix/refactor/docs/test`
- 信息聚焦变更本身，不提 AI
- 每个独立功能完成后立即提交
- 多线程并行开发默认规则：每完成一轮后，Agent 必须优先提交自己本轮的改动；禁止把他人的现有改动、未确认改动或生成产物一并提交。
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

- `docs/Agora-实施排期-Agora-TS.md` 是 `agora-ts/` 默认实施口径与唯一填写入口
- `docs/Agora-实施排期.md` 保留为 legacy / 现网参考口径
- 架构变更必须更新 `00-RAW-PRDS/01-architecture.md`
- 实施进度必须更新 `00-RAW-PRDS/07-implementation-plan.md`
- 每周结束必须写 Walkthrough 文档
- 所有文档提交到 docs 仓库，不提交到主仓库
- 所有过程记录必须位于 `docs/09-PLANNING/TASKS/<YYYY-MM-DD-任务名>/` 任务目录

---

## 设计文档参考

### 核心设计文档

- 实施总表（TS 默认）：`docs/Agora-实施排期-Agora-TS.md`（**`agora-ts/` 当前实现状态、开发顺序、实现计审唯一入口**）
- legacy / 现网参考：`docs/Agora-实施排期.md`
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
- OpenClaw Plugin ↔ `agora-ts` 通过 HTTP API 桥接（TypeScript Fastify Server）

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
