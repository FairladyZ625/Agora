<div align="center">

**中文** | [English](./README.md) | [日本語](./README.ja.md)

<br/>

<h1>Agora</h1>

<p><strong>Agents 讨论，人类裁决，执行保持受治理。</strong></p>

<p>面向 agent society 的编排与治理层。<br/>
Agora 把自由讨论收口成分阶段、可审计、可回放的交付流程。</p>

[![GitHub stars](https://img.shields.io/github/stars/FairladyZ625/Agora?style=flat-square&logo=github&color=yellow)](https://github.com/FairladyZ625/Agora/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/FairladyZ625/Agora?style=flat-square&logo=github)](https://github.com/FairladyZ625/Agora/network)
[![GitHub issues](https://img.shields.io/github/issues/FairladyZ625/Agora?style=flat-square)](https://github.com/FairladyZ625/Agora/issues)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen?style=flat-square&logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)

</div>

---

## 问题不是“再接一个 Bot”

把很多 Agent 拉进一个频道，确实会有集体智慧。但规模一上来，问题马上出现：

- 讨论噪音淹没任务
- 协调者上下文被污染
- 人类审批变成口头承诺
- 执行在结论未收敛前就被触发
- 聊天记录不等于交付

更深的问题不是“怎么再接一个 Claude/Codex”，而是：

**如何构造一个社会结构，让对的人在对的时间看到对的信息？**

Agora 解决的是这个问题。

---

## Agora 是什么

Agora 是：

- 编排层
- 治理层
- 任务广场与上下文隔离层
- 人类 gate 裁决层
- provider-neutral 的执行控制面

Agora 不是：

- 又一个单纯的 IM Bot
- 又一个 coding-agent 启动器
- 又一套自研的低层 Claude/Codex session 框架

现在低层 coding runtime 已经被视为 commodity。Agora 保留的是编排真相源。

---

## 核心模型

```text
Citizens 讨论  ->  Archon 裁决  ->  Executors 交付
```

| 概念 | 含义 |
| --- | --- |
| **Agora** | 任务广场：任务、上下文、参与者、通知、归档 |
| **Citizens** | 讨论参与者：互相质疑、互相完善方案 |
| **Archon** | 人类裁决者：在 Gate 上 approve / reject / pause |
| **Craftsman** | 一种受治理的执行角色，不再表示自研 runtime 框架 |
| **Gate** | 显式阶段门禁 |
| **Decree** | 允许执行时下发的 curated brief / 已采纳决策 |

关键原则：

> 对于执行者来说，很多讨论是噪音。

执行者不一定需要整条讨论记录。很多时候，他们只需要：

- 已收敛的目标
- 已确认的约束
- 当前仓库/任务状态
- 明确的执行权限

所以 Agora 明确区分两种执行形态：

- `execution-only`
- `dialogue-capable`

两者都能存在，但暴露策略不同。

---

## 现在的执行口径

Agora 不再把旧的 tmux-based Craftsman 路径当成默认执行模型。

当前口径是：

- `ACPX` 是默认 execution substrate
- `tmux` 只作为 legacy fallback / debug adapter 保留
- `CraftsmanAdapter` 仍然保留为 Core-facing abstraction
- `Craftsman` 保留为业务语义里的执行角色
- 旧 tmux public shell 已经退出

也就是说，Agora 关注的是：

- 什么时候允许执行
- 谁可以执行
- 执行者要不要加入讨论
- 执行者应该拿到整条讨论还是 curated brief
- 执行结果如何回写任务状态、通知和归档

而不是继续把所有底层 session primitive 都自己维护一遍。

---

## 为什么不直接把 Claude 接进群里？

可以，Agora 不反对。

如果用户自己用 OpenClaw 或别的 host，把 Claude/Codex 接进 Discord/IM，Agora 仍然有价值：

- 什么时候拉进来
- 什么时候隐藏
- 给它整条讨论还是只给 brief
- 哪一步必须人类审批
- 它的输出怎么改变任务状态

直接接进群里解决的是 transport，不是 governance。

---

## 架构

```text
IM / Entry Adapters
Discord · 飞书 · Slack · Dashboard · CLI · REST
                |
                v
Agora Core / Orchestrator
Task · Context · Participant · Gate · Approval
Scheduler · Notification · Archive · Recovery
                |
                v
Runtime / Execution Adapters
Hosted runtimes: OpenClaw · future hosts
Execution substrates: ACPX（默认） · tmux（legacy fallback）
```

核心原则：

- `packages/core` 只负责编排语义
- IM、runtime、execution 都是 adapter
- provider-specific 细节不能反灌成长期 Core 主模型
- 当前 runtime 口径是单核双 adapter：ACPX 是默认路径，tmux 是保留中的 legacy adapter

---

## 快速开始

### 环境要求

- Node.js 22+
- npm 10+
- `acpx`

可选：

- OpenClaw，如果你要做 IM-hosted agent participation
- Discord，如果你要 live thread 体验
- Docker + embedding API，如果你要让 `project brain` 走 hybrid retrieval，而不是纯 lexical 搜索

### 安装

```bash
git clone https://github.com/FairladyZ625/Agora.git
cd Agora
./scripts/bootstrap-local.sh
```

### 初始化并启动

```bash
./agora init
./agora start
```

如果本机检测到 OpenClaw，`./agora init` 现在可以选择性地自动完成本地 Agora 插件构建与 `openclaw.json` 接线。
它只会自动处理安全的插件注册和 Agora server 连接信息。
它**不会**自动改 OpenClaw 的 Discord 行为策略，比如 bot roster、`allowBots`、`requireMention`、guild/channel allowlist。

如果你要启用语义化 `project brain` 检索，`./agora init` 现在会提供一个可选安装阶段，自动完成：

- 收集 embedding API 配置
- 用真实请求探测 embedding API 是否可用
- 如果本机 `127.0.0.1:6333` 已有健康的 Qdrant，则直接复用
- 否则通过 Docker 本地拉起 `qdrant/qdrant:latest`
- 把验证通过后的向量配置写入仓库根目录 `.env`

这是默认产品路径。手改 `.env` 仍然保留为 fallback：

```bash
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBEDDING_DIMENSION=
QDRANT_URL=http://127.0.0.1:6333
QDRANT_API_KEY=
```

配好后，这三条命令会从 raw lexical 路径切到 hybrid retrieval：

```bash
./agora projects brain index rebuild --project <project_id>
./agora projects brain query --task <task_id> --audience craftsman --query "runtime boundary" --mode auto
./agora projects brain bootstrap-context --task <task_id> --audience craftsman
```

完整从零跑通指南见：

- [Doc/06-INTEGRATIONS/openclaw/agora-openclaw-bootstrap-whitepaper.md](./Doc/06-INTEGRATIONS/openclaw/agora-openclaw-bootstrap-whitepaper.md)

### 开发者 Live Regression Mode

Agora 现在提供了一个仅面向开发者的 live regression harness，可直接在真实 Discord task thread 里做回归。
开启后，本机 agent 可以在 `regression_test` 任务中通过 AgoraBot 以 operator proxy 语义推进任务，并沿正常编排链路完成 live smoke / regression。

在仓库根目录 `.env` 中显式开启：

```bash
AGORA_DEV_REGRESSION_MODE=true
AGORA_DASHBOARD_LOGIN_USER=
AGORA_DASHBOARD_LOGIN_PASSWORD=
```

这只用于懂源码、正在迭代 Agora 本身的开发者。
普通产品使用路径应保持关闭。

常用命令：

```bash
cd agora-ts
npm run dev -w @agora-ts/cli -- dashboard session login
npm run smoke:discord:regression
npm run dev -w @agora-ts/cli -- regression live --task-id <task_id> --goal "验证当前 Discord 流程" --message "推进这个任务，并告诉我卡点在哪里。"
```

当 `AGORA_DEV_REGRESSION_MODE=true` 时，`agora dashboard session login` 可以直接读取根 `.env` 里的 `AGORA_DASHBOARD_LOGIN_USER` / `AGORA_DASHBOARD_LOGIN_PASSWORD`。

默认本地地址：

- API：`http://127.0.0.1:18420/api/health`
- Dashboard：`http://127.0.0.1:33173/dashboard/`

### 创建任务

```bash
./agora create "给 API 加上认证中间件"
```

### 典型流程

```text
创建任务
  -> Citizens 讨论
  -> Archon 审阅
  -> 选择 execution-only 或 dialogue-capable 执行者
  -> ACPX-backed execution 运行
  -> 输出进入审阅与归档
```

### 质量门

```bash
cd agora-ts
npm run check:strict
npm run scenario:all
```

---

## 适用场景

- 需求澄清与方案收敛
- 架构评审与实现评审
- 讨论后再执行的代码/测试/review 交付
- 多项目、多任务、多上下文隔离
- 长线程里的参与者暴露控制
- 真实的人在回路 agent 编排

---

## 对比

| | Agora | 只把 Bot 接进 IM | CrewAI / AutoGen | LangGraph |
| --- | --- | --- | --- | --- |
| 多 Agent 讨论 | ✅ | ⚠️ 临时拼装 | ✅ | ⚠️ |
| 人类 Gate | ✅ | ❌ | ⚠️ | ⚠️ |
| 参与者暴露策略 | ✅ | ❌ | ❌ | ❌ |
| 执行作为受治理角色 | ✅ | ❌ | ⚠️ | ⚠️ |
| provider-neutral Core | ✅ | ❌ | ❌ | ⚠️ |

---

## 路线图

- [x] 多 Bot thread / task commands / subagent dispatch
- [x] 状态机与 Gate 底座
- [x] Dashboard 与 review surface
- [x] ACPX-backed 默认执行底座
- [x] tmux public shell retirement
- [ ] execution exposure policy 继续收紧
- [ ] project / brain / citizen workbench 深化
- [ ] 更多 runtime 与 IM adapters
- [ ] 多租户治理与 SaaS 化

---

## 仓库结构

```text
agora-ts/      TypeScript 主实现
dashboard/     React dashboard
Doc/           可公开分享文档
docs/          架构 / planning / walkthrough 文档（独立 git 仓）
extensions/    外部 adapters / plugins
```

---

## 参与贡献

高价值方向：

- 编排与治理语义
- runtime / IM adapters
- dashboard 操作体验
- project / task / archive 工作流
- 更清楚表达社会结构模型的文档

先看 [CONTRIBUTING.md](CONTRIBUTING.md)。
如果你在读 `AGENTS.md`，但没有私有 `docs/` 仓权限，请改看公开镜像 [Doc/agents-contributor-reference.md](Doc/agents-contributor-reference.md)。
