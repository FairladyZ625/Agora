# Agora

**Agents debate. Humans decide. Machines execute.**

A democratic orchestration layer for multi-agent systems.

把多智能体的自由讨论变成可靠的生产工作流。讨论继续自由，执行变得可控、可审、可追踪。

---

## Origin Story

一切始于一个简单的实验：把一群 AI Agent 拉进同一个 Discord 频道，看它们互相 @ 对方。

那个画面很神奇。它们会互相质疑、互相纠错、互相补全盲区。三个臭皮匠，真的能顶一个诸葛亮。我第一次意识到，多智能体协作不是噱头，它能产出比任何单一模型更稳的结论。

然后我想把这种魔法变成生产力。

问题来了。12 个 Agent 在一个频道里互相 @，消息爆炸，我根本看不过来。负责协调的主 Agent 被所有人 @，上下文反复溢出。流程全靠 prompt 驱动，行为不可预测——你让它"讨论完再执行"，它有时候听，有时候不听。讨论很热闹，但最终没有人真正去写代码、跑测试、交付成果。

我陷入了一个两难：要么放任自由讨论但接受混乱，要么严格管控但失去集体智慧。

然后我看到了 [Edict](https://github.com/ptonlix/edict)——一个用"三省六部"架构做多智能体编排的开源项目。它让我看到了一种可能性：**你可以同时拥有民主和决策权。** 自由讨论可以保留，但关键节点必须有人拍板，流程推进必须由代码保证而不是 prompt 祈祷。

这个认知改变了一切。

我开始在 Discord 里做任务管理，写了 Skill 让 Agent 能调用 Claude Code 和 Codex。一开始很难用——调用会出错，上下文会丢失，Agent 不知道什么时候该讨论、什么时候该干活。但方向对了。我需要的不是更好的 prompt，而是一个框架：让讨论是讨论，执行是执行，审批是审批，每一步都由确定性的代码来保证。

这就是 Agora。

今天是 Agora 1.0 发布的第一天。它还不完美，但核心理念已经清晰：**Freedom of ideas. Discipline of execution.** 我希望有更多人加入，一起把这件事做好。

---

## What You Get

1. 多 Agent 像广场辩论一样互看互评，输出更稳的方案结论
2. 关键节点由人类 Archon 审阅裁决，责任明确，风险可控
3. 讨论收敛后调度 Craftsmen 执行层，真正写代码、跑测试、做 review，形成可落地交付物

---

## Use Cases

- 需求澄清与方案收敛——多角色讨论比单模型输出更全面
- 复杂 Bug 定位与根因分析——Agent 互相质疑假设
- 代码生成与测试生成——讨论完直接调度 Craftsmen 执行
- 多模型交叉 Code Review 与质量门禁
- 任务全流程记录、复盘归档同步进知识库（经 Writer-Agent）
- 把 Discord 协作从聊天升级为工程化任务系统

---

## The Problem

把一群 Agent 放到同一个频道里，最初很神奇。但 Agent 数量上来之后：

- **消息爆炸**——任务被对话淹没，人类根本看不过来
- **上下文污染**——协调者被所有人 @，推理质量断崖下降
- **行为不可预测**——流程由 prompt 驱动，"讨论完再执行"只是建议不是保证
- **讨论难以收敛**——缺少明确的裁决点，Agent 可以无限辩论
- **执行无法闭环**——聊天层产不出代码、测试、review 这些真实交付物

核心矛盾：自由讨论带来创造力，但也带来混乱。严格管控带来秩序，但也扼杀集体智慧。

Agora 的答案：**两者兼得。** 讨论阶段完全自由，执行阶段完全确定，切换由状态机控制。

---

## Core Model

Agora 把多智能体协作拆成三个层次：

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

核心原则：

- 确定性的事交给代码与状态机
- 创造性的事交给 Agent 的讨论与批评
- 关键节点保持人在回路中

---

## Key Features

**Deliberation First** — 每个任务有隔离的讨论空间，Agent 互相可见、互相批评，避免全频道广播噪声。

**Deterministic Orchestration** — 任务生命周期由状态机控制。创建、派发、转移、归档都由代码保证，不依赖 prompt。

**Archon Review** — 每个 Gate 都可配置为需要人审。讨论结论进入执行前审批，代码产出进入完成前审批，任何阶段都能暂停与打回。

**Craftsmen Execution** — 讨论收敛后，调度执行型工具完成真实交付。代码、测试、review 都进入闭环。

**Dynamic Collaboration** — 讨论与执行可多轮切换。简单任务直达执行，复杂任务支持多轮讨论与多轮执行。

---

## Quickstart

### Prerequisites

- Node.js 22+
- npm 10+
- Discord Bot 运行环境
- 至少一个 Craftsmen 工具（Claude Code、Codex 或 Gemini CLI）

### Install

```bash
cp .env.example .env
cd agora-ts
npm install
npm run check:strict
```

本地开发统一从项目根目录 `.env` 读取：

- `AGORA_BACKEND_PORT`
- `AGORA_FRONTEND_PORT`
- `AGORA_SERVER_URL`
- `VITE_API_BASE_URL`
- `AGORA_CRAFTSMAN_SERVER_MODE`
- `AGORA_CRAFTSMAN_CLI_MODE`

如果 OpenClaw 也要跟着切换到同一后端地址，执行：

```bash
./scripts/sync-openclaw-server-url.sh
```

### Full Workspace Check

```bash
node ./scripts/check-shared-contracts.mjs
./scripts/check-ts-all.sh
```

### Agent Scenario Harness

```bash
cd agora-ts
npm run scenario:list
npm run scenario -- happy-path --json
npm run scenario:all
```

### Craftsman Runtime Entry Points

默认口径已经收口为：
- server: `watched`
- cli: `tmux`

常用入口：

```bash
./scripts/craftsman-runtime.sh tmux up
./scripts/craftsman-runtime.sh tmux doctor
./scripts/craftsman-runtime.sh history <taskId> <subtaskId>
```

### Create a Task

```
/task create "给 API 加上认证中间件"
```

### Typical Flow

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
Craftsmen 执行              ← Claude Code 写代码，Codex 跑测试，Gemini CLI 做 review
  │
  ▼
Gate 2: Archon Review       ← 人类审阅产出
  │
  ▼
Done → 生成知识库同步工单    ← Writer-Agent 完成入库与 git 提交
```

---

## How Agora Differs

**vs AutoGen / CrewAI** — 它们擅长多 Agent 协作对话与角色分工。Agora 在此基础上增加治理层：人审 Gate、确定性状态机、本地 CLI 执行闭环。

**vs LangGraph** — 它擅长可编排的工作流图。Agora 强调真实的讨论空间（不是模拟对话），面向 Discord 等协作平台，支持讨论与执行的动态切换。

**vs Chat Bots** — 它们能聊天，难以交付。Agora 把聊天和执行连接起来，讨论收敛后进入 Craftsmen 执行层，产出真实代码和测试。

---

## When to Use Agora (and When Not To)

Agora 适合你，如果：
- 你需要多模型、多角色、多轮讨论来提升决策质量
- 你希望执行能稳定落地，而不是停留在聊天层
- 你希望关键动作必须经人审后才能推进

Agora 可能不适合你，如果：
- 你只需要单模型工具调用——单 Agent workflow 更轻
- 你不需要人在回路——全自动 pipeline 更合适

---

## Design Goals

- **确定性优先** — 流程控制由代码保证，不依赖 prompt
- **保留集体智慧** — Agent 在讨论阶段互相可见，三个臭皮匠顶一个诸葛亮
- **动态协作模式** — 讨论与执行可多轮切换
- **人在回路** — Archon 在关键节点审批裁决
- **Craftsmen 调度** — 讨论完了真的去写代码
- **可配置治理** — 预设模板覆盖常见场景，支持自定义
- **可视化面板** — Dashboard 实时展示任务状态、Agent 活动、Gate 审批
- **框架无关** — Adapter 架构，适配多平台多生态

## Implementation SSoT

Agora 当前的实施口径、实现计审、状态矩阵和待开发优先级，统一维护在：

- [docs/Agora-实施排期.md](/Users/lizeyu/Projects/Agora/docs/Agora-实施排期.md)

使用规则：

- 想知道“现在做到哪里了”，看这一个文件
- 想知道“下一波应该做什么”，看这一个文件
- 做完任何非平凡开发后，先更新这一个文件，再更新任务过程文档和 walkthrough

`docs/00-RAW-PRDS/` 继续保存原始需求和历史方案，但不再单独承担当前实施状态的唯一口径。

## Runtime Status

当前默认运行口径：

- 后端：`agora-ts/apps/server`
- CLI：`agora-ts/apps/cli`
- 前端：`dashboard`

旧 Python 版本已迁入 `archive/agora-python-legacy/`，保留为 legacy 参考实现，不再作为默认开发目标。

---

## Roadmap

**Phase -1** — 技术验证 PoC · 多 Bot Thread · `/task` 命令注册 · subagent Thread 派发

**Phase 0** — SQLite + canonical enums · 命令/权限底座 · OpenClaw Adapter

**Phase 1** — 状态机与 Gate · Discuss/Execute 模式切换 · 快照回滚

**Phase 1.5** — Craftsmen 执行闭环 · Claude Code / Codex / Gemini CLI 集成

**Phase 2** — Dashboard 可视化 · Archon Review Panel · Archive Jobs 队列

**Phase 3** — 更多 Adapter · 更多治理预设 · 可选受控直写 ADR

---

## Project Structure

```
agora-ts/                       TypeScript 主实现（server / cli / packages）
dashboard/                      React 前端
archive/agora-python-legacy/    Python legacy 参考实现
```

---

## Acknowledgments

感谢 [Edict](https://github.com/ptonlix/edict) 的"三省六部"架构带来的启发。它让我看到治理与秩序可以与自由讨论共存，推动 Agora 从一个好奇的实验走向工程化的生产力系统。

感谢 [OpenClaw](https://github.com/nicepkg/openclaw) 提供的 Discord 多智能体基础设施——Thread 管理、ACP 协议、Slash Command、Hook 系统——Agora 的第一个 Adapter 就建立在它之上。

感谢 Claude Code Agent Teams 的并行处理与结果聚合模式，它验证了"讨论→分工→汇总"这一协作范式的可行性。

---

## Contributing

欢迎贡献。优先方向：

- **Adapter** — 新平台与新生态接入
- **Craftsmen** — 新执行工具适配
- **Governance** — 治理模板与权限模型
- **Dashboard** — 可视化与审阅体验
- **Docs** — 示例任务与最佳实践

建议从 issue 开始，或直接提交 PR。

---

## License

Apache 2.0 (pending)
