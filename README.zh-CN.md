<div align="center">

**中文** | [English](./README.md) | [日本語](./README.ja.md)

<br/>

<h1>⚡ Agora</h1>

<p><strong>Agents debate. Humans decide. Machines execute.</strong></p>

<p>面向多智能体系统的民主编排层。<br/>
把自由讨论变成可靠、可审、可追踪的生产工作流。</p>

[![GitHub stars](https://img.shields.io/github/stars/FairladyZ625/Agora?style=flat-square&logo=github&color=yellow)](https://github.com/FairladyZ625/Agora/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/FairladyZ625/Agora?style=flat-square&logo=github)](https://github.com/FairladyZ625/Agora/network)
[![GitHub issues](https://img.shields.io/github/issues/FairladyZ625/Agora?style=flat-square)](https://github.com/FairladyZ625/Agora/issues)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen?style=flat-square&logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)

</div>

---

## 起源

一切始于一个简单的实验：把一群 AI Agent 拉进同一个 Discord 频道，看它们互相 @ 对方。

那个画面很神奇。它们会互相质疑、互相纠错、互相补全盲区。三个臭皮匠，真的能顶一个诸葛亮。我第一次意识到，多智能体协作不是噱头，它能产出比任何单一模型更稳的结论。

然后我想把这种魔法变成生产力。

问题来了。12 个 Agent 在一个频道里互相 @，消息爆炸，我根本看不过来。负责协调的主 Agent 被所有人 @，上下文反复溢出。流程全靠 prompt 驱动，行为不可预测——你让它"讨论完再执行"，它有时候听，有时候不听。讨论很热闹，但最终没有人真正去写代码、跑测试、交付成果。

我陷入了一个两难：要么放任自由讨论但接受混乱，要么严格管控但失去集体智慧。

然后我看到了 [Edict](https://github.com/cft0808/edict)——一个用"三省六部"架构做多智能体编排的开源项目。它让我看到了一种可能性：**你可以同时拥有民主和决策权。** 自由讨论可以保留，但关键节点必须有人拍板，流程推进必须由代码保证而不是 prompt 祈祷。

这就是 Agora。**Freedom of ideas. Discipline of execution.**

---

## 问题所在

把一群 Agent 放到同一个频道里，最初很神奇。但 Agent 数量上来之后：

- **消息爆炸** — 任务被对话淹没，人类根本看不过来
- **上下文污染** — 协调者被所有人 @，推理质量断崖下降
- **行为不可预测** — 流程由 prompt 驱动，"讨论完再执行"只是建议不是保证
- **讨论难以收敛** — 缺少明确的裁决点，Agent 可以无限辩论
- **执行无法闭环** — 聊天层产不出代码、测试、review 这些真实交付物

核心矛盾：自由讨论带来创造力，但也带来混乱。严格管控带来秩序，但也扼杀集体智慧。

**Agora 的答案：两者兼得。** 讨论阶段完全自由，执行阶段完全确定，切换由状态机控制。

---

## 工作原理

```
Citizens 讨论  →  Archon 裁决  →  Craftsmen 执行
 (自由辩论)       (人类审批)       (确定性交付)
```

| 概念 | 含义 |
|------|------|
| **Agora** | 任务广场——每个任务的隔离讨论空间（Discord Thread 或独立频道） |
| **Citizens** | 参与讨论的 Agents，互相可见、互相批评 |
| **Archon** | 人类审阅者，在 Gate 节点做最终裁决 |
| **Craftsmen** | 执行层工具——Claude Code、Codex、Gemini CLI 或自定义 CLI |
| **Decree** | 通过 Gate 后的确定性指令，由代码保证执行 |
| **Gate** | 阶段转换的门禁，可配置为自动通过、人工审批、投票表决等 |

---

## 核心特性

**讨论优先** — 每个任务有隔离的讨论空间，Agent 互相可见、互相批评，避免全频道广播噪声。

**确定性编排** — 任务生命周期由状态机控制。创建、派发、转移、归档都由代码保证，不依赖 prompt。

**Archon 审批** — 每个 Gate 都可配置为需要人审。讨论结论进入执行前审批，代码产出进入完成前审批，任何阶段都能暂停与打回。

**Craftsmen 执行** — 讨论收敛后，调度执行型工具完成真实交付。代码、测试、review 都进入闭环。

**动态协作** — 讨论与执行可多轮切换。简单任务直达执行，复杂任务支持多轮讨论与多轮执行。

**可插拔 Adapter** — IM 层（Discord、飞书、Slack）、Runtime 层（OpenClaw、CrewAI）、Craftsman 层（Claude Code、Codex、Gemini）全部是可替换的 adapter，Core 编排逻辑与平台无关。

---

## 架构

```
┌─────────────────────────────────────────────┐
│          IM / Channel Adapters               │
│     Discord · 飞书 · Slack · Dashboard       │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│           Agora Core / Orchestrator          │
│  Task · Context · Participant · Gate         │
│  状态机 · Scheduler · Archive               │
└──────────┬───────────────────┬──────────────┘
           │                   │
┌──────────▼──────┐   ┌────────▼──────────────┐
│  Agent Runtime  │   │  Craftsman Adapters    │
│  OpenClaw       │   │  Claude Code · Codex   │
│  CrewAI         │   │  Gemini CLI · 自定义   │
└─────────────────┘   └───────────────────────┘
```

核心原则：编排语义只存在于 `packages/core`。每一个 IM、Runtime、Craftsman 都只是 adapter。

---

## 快速开始

### 环境要求

- Node.js 22+
- npm 10+
- tmux（若要使用 craftsmen tmux runtime）

### 安装

```bash
git clone https://github.com/FairladyZ625/Agora.git
cd agora
cp .env.example .env
cd agora-ts && npm install
cd ../dashboard && npm install
```

### 启动开发环境

```bash
./docs/02-PRODUCT/scripts/dev-start.sh
```

默认地址：

- API：`http://127.0.0.1:18420/api/health`
- Dashboard：`http://127.0.0.1:33173/dashboard/`

### 创建第一个任务

```bash
cd agora-ts
npm run dev -w @agora-ts/cli -- create "给 API 加上认证中间件"
```

### 典型流程

```
/task create "..."          ← 创建任务，自动开 Thread
      │
      ▼
Citizens 讨论方案            ← Agents 在 Thread 内自由辩论
      │
      ▼
Gate 1: Archon Review       ← 人类审阅讨论结论，approve 或 reject
      │
      ▼
Craftsmen 执行              ← Claude Code 写代码，Codex 跑测试
      │
      ▼
Gate 2: Archon Review       ← 人类审阅产出
      │
      ▼
Done → 知识库同步            ← Writer-Agent 完成入库与 git 提交
```

### 质量门

```bash
cd agora-ts
npm run check:strict        # 严格质量门（默认提交口径）
npm run scenario:all        # Agent 场景回归测试
```

---

## 适用场景

- **需求澄清与方案收敛** — 多角色讨论比单模型输出更全面
- **复杂 Bug 定位与根因分析** — Agent 互相质疑假设
- **代码生成与测试生成** — 讨论完直接调度 Craftsmen 执行
- **多模型交叉 Code Review** — 多个模型同时审阅同一 PR
- **任务全流程记录与复盘** — Writer-Agent 同步进知识库
- **把 Discord 协作从聊天升级为工程化任务系统**

---

## 与同类项目对比

| | Agora | AutoGen / CrewAI | LangGraph | Chat Bots |
|---|---|---|---|---|
| 多 Agent 真实讨论 | ✅ | ✅ | ⚠️ 模拟对话 | ❌ |
| 人在回路 Gate | ✅ | ⚠️ 可选 | ⚠️ 可选 | ❌ |
| 确定性状态机 | ✅ | ❌ | ✅ | ❌ |
| 真实代码/测试交付 | ✅ | ⚠️ | ⚠️ | ❌ |
| 可插拔 IM Adapter | ✅ | ❌ | ❌ | ❌ |

---

## 路线图

- [x] **Phase -1** — PoC：多 Bot Thread、`/task` 命令、subagent 派发
- [x] **Phase 0** — SQLite + canonical enums、命令/权限底座、OpenClaw Adapter
- [x] **Phase 1** — 状态机与 Gate、Discuss/Execute 模式切换、快照回滚
- [x] **Phase 1.5** — Craftsmen 执行闭环：Claude Code / Codex / Gemini CLI
- [x] **Phase 2** — Dashboard 可视化、Archon Review Panel、Archive 队列
- [ ] **Phase 3** — 更多 Adapter、更多治理预设、可选受控直写 ADR
- [ ] **Phase 4** — 多租户任务隔离、企业级治理、SaaS 模式

---

## Star 趋势

[![Star History Chart](https://api.star-history.com/svg?repos=FairladyZ625/Agora&type=Date)](https://www.star-history.com/#FairladyZ625/Agora&Date)

---

## 项目结构

```
agora-ts/                    TypeScript 主实现（server / cli / packages）
├── apps/server/             Fastify HTTP Server
├── apps/cli/                Commander CLI
└── packages/
    ├── core/                编排领域逻辑 + 状态机
    ├── contracts/           共享 DTO / schema contracts
    ├── db/                  SQLite migration + repositories
    ├── config/              配置 schema + loader
    └── testing/             测试 runtime helpers

dashboard/                   React 前端（Vite + Tailwind + Zustand）
archive/agora-python-legacy/ Python legacy 参考实现
docs/                        架构文档（独立 git 仓库）
extensions/                  插件 adapter（OpenClaw 等）
```

---

## 参与贡献

欢迎贡献。优先方向：

- **Adapter** — 新平台与新生态接入
- **Craftsmen** — 新执行工具适配
- **Governance** — 治理模板与权限模型
- **Dashboard** — 可视化与审阅体验
- **Docs** — 示例任务与最佳实践

建议从 issue 开始，或直接提交 PR。

---

## 赞助支持

如果 Agora 帮你节省了时间，或者让团队交付出更好的 AI 工作流，欢迎支持项目持续开发。

- 项目地址：[github.com/FairladyZ625/Agora](https://github.com/FairladyZ625/Agora)
- 问题反馈 / 合作联系：[github.com/FairladyZ625/Agora/issues](https://github.com/FairladyZ625/Agora/issues)
- 邮箱：`lizeyu990625@gmail.com`
- 微信：`FairladyZ625`
- 电话：`15258817691`

<details>
<summary>微信支付 / 支付宝</summary>
<br/>

<table>
<tr>
<td align="center" width="50%">
<strong>微信支付</strong><br/><br/>
<img src="./assets/sponsor/wechat-pay.jpg" alt="FairladyZ 微信赞赏码" width="280"/>
</td>
<td align="center" width="50%">
<strong>支付宝</strong><br/><br/>
<img src="./assets/sponsor/alipay-pay.jpg" alt="FairladyZ 支付宝赞赏码" width="280"/>
</td>
</tr>
</table>

</details>

---

## 致谢

- [Edict](https://github.com/cft0808/edict) — "三省六部"架构带来的启发，让我看到治理与自由讨论可以共存
- [OpenClaw](https://github.com/openclaw/openclaw) — 提供 Discord 多智能体基础设施（Thread 管理、ACP 协议、Slash Command、Hook 系统），Agora 的第一个 Adapter 建立在它之上
- Claude Code Agent Teams — 验证了"讨论→分工→汇总"协作范式的可行性

---

## License

[Apache 2.0](LICENSE)
