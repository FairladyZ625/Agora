
# Agora 项目约定

## 1. Core Constitution

- 一切架构设计以“解耦、可插拔、可替换”为最高优先级原则。
- 绝对禁止把核心编排语义耦合到任何具体 IM、任何具体 Agent Runtime、任何具体 Craftsman 实现里。
- Agora 的唯一核心主语义是 `Agora Core / Orchestrator`；上层 IM、下层 Runtime/Craftsmen 全部只是 adapter。
- 所有新能力必须先问：
  - 这是不是 `Agora Core` 的职责？
  - 如果移除 Discord / OpenClaw / Codex，这个语义是否仍成立？
  - 如果未来替换为 Feishu / CrewAI / NanoClaw / Claude Code，这一层是否可以不改 Core 而仅替换 adapter？
- 如果答案是否定，则设计不合格，必须重构。

### 三层口径

- 上层：IM / Channel / Entry adapters
  - Discord / Feishu / Slack / Dashboard / CLI / REST
- 中层：`Agora Core / Orchestrator`
  - Task / Context / Participant / RuntimeBinding / Execution / Event / Notification
  - State machine / Gate / Scheduler / Recovery / Archive
- 下层：
  - Agent Runtime / Host adapters
  - Craftsman / Execution Engine adapters

### 硬约束

- `packages/core` 只能表达核心语义、抽象端口、状态机与规则，不能写死平台名业务规则。
- 任何具体平台接入必须作为独立 adapter / integration 包实现。
- provider-specific 数据只能作为 adapter 状态或投影，不能成为长期 Core 主模型。
- `apps/server` 与 `apps/cli` 是 composition root，负责绑定 adapter，不负责承载核心业务语义。

## 1.5 First-Principles / Proposal Discipline

- 任何需求分析、方案设计、代码实现都必须先用第一性原理思考。
- 不允许默认假设提出需求的人已经完全想清楚目标、动机、约束与验收口径。
- 必须从原始需求和问题本身出发拆解语义；如果动机、目标或边界不清晰，应先停下来澄清，再继续设计或实现。
- 当需要给出修改方案或重构方案时，必须同时满足以下约束：
  - 不允许给出兼容性、补丁性、兜底性方案，除非用户明确要求保留兼容。
  - 不允许过度设计；必须选择满足需求且不违反上位原则的最短实现路径。
  - 不允许自行扩展到用户未要求的方案范围，不得擅自加入降级路径、旁路机制或额外业务分支。
  - 必须保证方案逻辑自洽，并经过完整主链路推演与验证。

## 2. Entry Surface Rules

- Dashboard 是人类操作入口；CLI / REST 是 Agent 与自动化入口。
- 任何必须由人类确认的动作，当前只允许通过 Dashboard 登录态触发；禁止自由传入 `reviewer_id` / `approver_id` 伪造人工身份。
- Core 只消费统一 actor / permission 语义，不直接判断“是不是人类”；“登录的人类”这一事实必须由 Dashboard / session adapter 提供。
- Agent 默认不通过 Dashboard 执行任务编排；Agent 主入口是 CLI，其次是 REST。
- 除必须人类确认的能力外，所有新增任务动作、运行态操作、运维动作、作者工具接口，都必须同步提供 CLI 入口。

### 调用者矩阵

- `Agent -> CLI`
  - task orchestration、template/graph authoring、role/binding 查询与修改、运维与 scenario 回归
- `Human -> Dashboard`
  - approve / reject / archon review / 其他必须真实登录态的人类动作
- `Human -> Slash Command`
  - 只读查询、轻量 create、轻量 task action
- `REST -> Service / Integration Facade`
  - 给 Dashboard、plugin、外部系统和人类 IM bridge 提供统一入口

### Slash / Plugin 规则

- 若主要调用者是本机 agent：先补 CLI。
- 若需要给人类在 IM 中使用：再补 REST + plugin/slash bridge。
- plugin 的默认职责是：
  - 人类 slash command bridge
  - live status / conversation / receipt 回投
  - 轻量查询与人类触发的 task action
- plugin 不是本机 agent 的主控制面；禁止把核心编排逻辑复制进 plugin。

## 3. Mandatory Planning Loop

- 所有非平凡任务必须在 `docs/09-PLANNING/TASKS/<YYYY-MM-DD-任务名>/` 建立独立任务目录。
- 每个任务目录至少包含：
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 禁止在项目根目录放过程文件：
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
  - `notes.md`
- 每个阶段前读取 `task_plan.md`，每个阶段后更新状态。
- 研究发现写入 `findings.md`，验证结果写入 `progress.md`。

### SSoT 规则

- `docs/Agora-实施排期-Agora-TS.md` 是 `agora-ts/` 的实施单一入口。
- 开始任何 TS 非平凡任务前，先读该文件。
- 完成后必须回写：
  - SSoT
  - 对应 planning
  - walkthrough
- SSoT 与 planning 必须双向绑定。

## 4. Mandatory Completion Loop

- 代码实现默认遵循 TDD：先测，后实现，再回归。
- 新增主链路、task action、authoring API、workflow 语义时，除了单测/集成测试，还必须评估并更新：
  - `@agora-ts/testing`
  - scenario primitives
  - harness CLI / scenario scripts
  - smoke / regression scripts
- 涉及 IM / thread / bootstrap / approval / callback / probe 的改动，若本地 Discord/OpenClaw 已配置可用，必须追加至少一轮真实 Discord 冒烟。
- 不能未验证就声称完成。

### 完成后必须回写

- `docs/Agora-实施排期-Agora-TS.md`
- `docs/09-PLANNING/TASKS/<task>/`
- `docs/10-WALKTHROUGH/`

## 5. Task-Type Reading Matrix

- 对外部贡献者说明：

  - 若你没有私有 `docs/` 仓访问权限，先读根目录 `CONTRIBUTING.md`
  - 再读公开镜像 `Doc/agents-contributor-reference.md`
  - 下列私有 `docs/` 路径仍是维护者内部权威入口；公开参考以 `Doc/reference/` 为准
- 架构 / adapter / runtime / IM / craftsman 相关任务：

  - 先读 [docs/11-REFERENCE/agora-core-decoupling-standard.md](/Users/lizeyu/Projects/Agora/docs/11-REFERENCE/agora-core-decoupling-standard.md)
  - 再读 [docs/03-ARCHITECTURE/2026-03-09-agora-core-orchestration-rebaseline.md](/Users/lizeyu/Projects/Agora/docs/03-ARCHITECTURE/2026-03-09-agora-core-orchestration-rebaseline.md)
- 文档治理 / planning / walkthrough / SSoT 相关任务：

  - 先读 [docs/11-REFERENCE/docs-library-standard.md](/Users/lizeyu/Projects/Agora/docs/11-REFERENCE/docs-library-standard.md)
  - 再读 [docs/11-REFERENCE/implementation-ssot-governance.md](/Users/lizeyu/Projects/Agora/docs/11-REFERENCE/implementation-ssot-governance.md)
- 开发执行 / 回写流程：

  - 先读 [docs/11-REFERENCE/execution-workflow-standard.md](/Users/lizeyu/Projects/Agora/docs/11-REFERENCE/execution-workflow-standard.md)
- 测试 / scenario / 冒烟：

  - 先读 [docs/11-REFERENCE/testing-standard.md](/Users/lizeyu/Projects/Agora/docs/11-REFERENCE/testing-standard.md)
  - Discord 冒烟再读 [docs/11-REFERENCE/discord-smoke-testing-standard.md](/Users/lizeyu/Projects/Agora/docs/11-REFERENCE/discord-smoke-testing-standard.md)
  - plugin / OpenClaw / native slash 真人入口排障再读 [docs/11-REFERENCE/plugin-debugging-lessons.md](/Users/lizeyu/Projects/Agora/docs/11-REFERENCE/plugin-debugging-lessons.md)
  - 若任务本身是在治理 regression / smoke / QA 进度，再读 [docs/11-REFERENCE/regression-ssot-governance.md](/Users/lizeyu/Projects/Agora/docs/11-REFERENCE/regression-ssot-governance.md)
- Dashboard / 前端任务：

  - 先读 [docs/11-REFERENCE/dashboard-frontend-standard.md](/Users/lizeyu/Projects/Agora/docs/11-REFERENCE/dashboard-frontend-standard.md)
- 交付总结 / 复盘：

  - 先读 [docs/11-REFERENCE/walkthrough-standard.md](/Users/lizeyu/Projects/Agora/docs/11-REFERENCE/walkthrough-standard.md)
- 其他工程质量门与通用工程规则：

  - 先读 [docs/11-REFERENCE/engineering-standard.md](/Users/lizeyu/Projects/Agora/docs/11-REFERENCE/engineering-standard.md)

## 6. Repo Map

- `agora-ts/`
  - 默认后端实现
- `dashboard/`
  - 前端 Dashboard
- `extensions/agora-plugin/`
  - plugin / bridge
- `docs/`
  - 独立文档仓库

## 7. Runtime Defaults

- 当前默认实现口径是 `agora-ts/`，旧 Python 只作 legacy 参考。
- 默认运行时数据库路径是 `~/.agora/agora.db`。
- `project brain` hybrid retrieval 现在依赖两类外部运行时：
  - embedding provider：`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_EMBEDDING_MODEL`、`OPENAI_EMBEDDING_DIMENSION`
  - vector index：`QDRANT_URL`、可选 `QDRANT_API_KEY`
- 默认产品路径是 `./agora init` 的可选 hybrid retrieval setup：
  - 收集 embedding 配置
  - probe embedding API
  - 复用或通过 Docker 拉起本机 `Qdrant`
  - 成功后写入仓库根目录 `.env`
- 这些变量仍从仓库根目录 `.env` 注入；若你修改这条能力线，必须同步更新 `.env.example`、README 与 public whitepaper。
- 当前仍处于高频重构阶段，默认优先级：
  - 先把模型做对
  - 再考虑兼容
- 除非用户明确要求保留兼容，否则不要为旧开发数据、旧字段名、旧本地 SQLite 状态保留长期兼容层。

## 8. Docs / Git Notes

- `docs/` 是独立 Git 仓库；docs 变更只在 docs 仓提交。
- 文档与代码一样要求收敛：不要新增平行总表、平行进度总览、平行状态矩阵。
- root `AGENTS.md` 只保留入口协议；详细规则统一下沉到 `docs/11-REFERENCE/`。
