<div align="center">

[中文](./README.zh-CN.md) | **English** | [日本語](./README.ja.md)

<br/>

<h1>⚡ Agora</h1>

<p><strong>Agents debate. Humans decide. Machines execute.</strong></p>

<p>A democratic orchestration layer for multi-agent AI systems.<br/>
Turn free-form agent deliberation into reliable, auditable production workflows.</p>

[![GitHub stars](https://img.shields.io/github/stars/FairladyZ625/Agora?style=flat-square&logo=github&color=yellow)](https://github.com/FairladyZ625/Agora/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/FairladyZ625/Agora?style=flat-square&logo=github)](https://github.com/FairladyZ625/Agora/network)
[![GitHub issues](https://img.shields.io/github/issues/FairladyZ625/Agora?style=flat-square)](https://github.com/FairladyZ625/Agora/issues)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen?style=flat-square&logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)

</div>

---

## The Problem

Put a group of AI agents in the same channel and the magic is real — they challenge each other, fill blind spots, and produce better conclusions than any single model. But scale it up and things break fast:

- **Message explosion** — tasks drown in conversation noise
- **Context pollution** — the coordinator gets @-mentioned by everyone, reasoning quality collapses
- **Unpredictable behavior** — "discuss first, then execute" is a suggestion, not a guarantee
- **No convergence** — without a decision point, agents debate forever
- **No real output** — chat layers don't produce code, tests, or reviews

The core tension: free discussion brings creativity, strict control brings order. You usually have to pick one.

**Agora's answer: have both.** Discussion is completely free. Execution is completely deterministic. The state machine handles the switch.

---

## How It Works

```
Citizens deliberate  →  Archon decides  →  Craftsmen execute
  (free debate)          (human review)      (deterministic delivery)
```

| Concept | Role |
|---------|------|
| **Agora** | The task arena — an isolated deliberation space per task (Discord Thread or channel) |
| **Citizens** | Participating agents — mutually visible, mutually critical |
| **Archon** | Human reviewer — makes final calls at Gate checkpoints |
| **Craftsmen** | Execution tools — Claude Code, Codex, Gemini CLI, or any custom CLI |
| **Decree** | The deterministic instruction issued after a Gate passes |
| **Gate** | Phase transition checkpoint — configurable as auto-pass, human approval, or quorum vote |

---

## Key Features

**Deliberation First** — Each task gets an isolated discussion space. Agents see each other and can challenge assumptions, without polluting the global channel.

**Deterministic Orchestration** — Task lifecycle is controlled by a state machine. Create, dispatch, transition, archive — all guaranteed by code, not prompts.

**Archon Review** — Every Gate can require human approval. Discussion conclusions need sign-off before execution starts. Code output needs sign-off before completion. Any phase can be paused or rejected.

**Craftsmen Execution** — After deliberation converges, dispatch execution tools to produce real deliverables: code, tests, reviews.

**Dynamic Collaboration** — Discussion and execution can alternate across multiple rounds. Simple tasks go straight to execution; complex tasks support multi-round deliberation.

**Pluggable Adapters** — IM layer (Discord, Feishu, Slack), runtime layer (OpenClaw, CrewAI), and craftsman layer (Claude Code, Codex, Gemini) are all swappable adapters. Core orchestration logic is platform-agnostic.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│          IM / Channel Adapters               │
│     Discord · Feishu · Slack · Dashboard     │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│           Agora Core / Orchestrator          │
│  Task · Context · Participant · Gate         │
│  State Machine · Scheduler · Archive         │
└──────────┬───────────────────┬──────────────┘
           │                   │
┌──────────▼──────┐   ┌────────▼──────────────┐
│  Agent Runtime  │   │  Craftsman Adapters    │
│  OpenClaw       │   │  Claude Code · Codex   │
│  CrewAI         │   │  Gemini CLI · Custom   │
└─────────────────┘   └───────────────────────┘
```

Core principle: the orchestration semantics live in `packages/core`. Every IM, runtime, and craftsman is just an adapter.

---

## Quickstart

### Prerequisites

- Node.js 22+
- npm 10+
- `acpx` is recommended for the default craftsmen runtime path
- tmux is optional and only kept for the archived legacy debug adapter

### Install From Source

```bash
git clone https://github.com/FairladyZ625/Agora.git
cd agora
./scripts/bootstrap-local.sh
```

### Initialize And Start

```bash
./agora init
./agora start
```

This source-mode path installs dependencies, prepares `.env`, writes local Agora config into `~/.agora/`, and starts the Fastify backend plus Vite dashboard dev server. Default endpoints:

- API: `http://127.0.0.1:18420/api/health`
- Dashboard: `http://127.0.0.1:33173/dashboard/`

If you want the raw underlying command, `./agora start` delegates to `scripts/dev-start.sh`.

### Create Your First Task

```bash
./agora create "Add authentication middleware to the API"
```

### Typical Flow

```
task create "..."           ← creates task, opens Thread
      │
      ▼
Citizens deliberate         ← agents debate freely in Thread
      │
      ▼
Gate 1: Archon Review       ← human reviews conclusions, approve or reject
      │
      ▼
Craftsmen execute           ← Claude Code writes code, Codex runs tests
      │
      ▼
Gate 2: Archon Review       ← human reviews output
      │
      ▼
Done → knowledge sync       ← Writer-Agent archives to knowledge base
```

### Quality Gates

```bash
cd agora-ts
npm run check:strict        # full strict quality gate (default before commit)
npm run scenario:all        # agent scenario harness
```

---

## Use Cases

- **Requirement clarification** — multi-role discussion produces more complete specs than single-model output
- **Complex bug analysis** — agents challenge each other's assumptions about root cause
- **Code + test generation** — deliberate first, then dispatch Craftsmen to execute
- **Cross-model code review** — multiple models reviewing the same PR
- **Full task lifecycle recording** — Writer-Agent syncs everything to knowledge base
- **Upgrading Discord collaboration** from chat to an engineered task system

---

## Comparison

| | Agora | AutoGen / CrewAI | LangGraph | Chat Bots |
|---|---|---|---|---|
| Multi-agent deliberation | ✅ | ✅ | ⚠️ simulated | ❌ |
| Human-in-the-loop gates | ✅ | ⚠️ optional | ⚠️ optional | ❌ |
| Deterministic state machine | ✅ | ❌ | ✅ | ❌ |
| Real code/test delivery | ✅ | ⚠️ | ⚠️ | ❌ |
| Pluggable IM adapters | ✅ | ❌ | ❌ | ❌ |

---

## Roadmap

- [x] **Phase -1** — PoC: multi-bot threads, `/task` commands, subagent dispatch
- [x] **Phase 0** — SQLite + canonical enums, command/permission foundation, OpenClaw adapter
- [x] **Phase 1** — State machine + Gates, Discuss/Execute mode switching, snapshot rollback
- [x] **Phase 1.5** — Craftsmen execution loop: Claude Code / Codex / Gemini CLI
- [x] **Phase 2** — Dashboard visualization, Archon Review Panel, Archive job queue
- [ ] **Phase 3** — More adapters, more governance presets, optional controlled ADR writes
- [ ] **Phase 4** — Multi-tenant task isolation, enterprise governance, SaaS mode

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=FairladyZ625/Agora&type=Date)](https://www.star-history.com/#FairladyZ625/Agora&Date)

---

## Project Structure

```
agora-ts/                    TypeScript implementation (server / cli / packages)
├── apps/server/             Fastify HTTP server
├── apps/cli/                Commander CLI
└── packages/
    ├── core/                Orchestration domain logic + state machine
    ├── contracts/           Shared DTO / schema contracts
    ├── db/                  SQLite migrations + repositories
    ├── config/              Config schema + loader
    └── testing/             Test runtime helpers

dashboard/                   React frontend (Vite + Tailwind + Zustand)
Doc/                         Public docs bundle (whitepaper, quick start, integration guides)
docs/                        Architecture docs (separate git repo)
extensions/                  Plugin adapters (OpenClaw, etc.)
```

---

## Contributing

Contributions welcome. Priority areas:

- **Adapters** — new IM platforms, new agent runtimes
- **Craftsmen** — new execution tool integrations
- **Governance** — governance templates and permission models
- **Dashboard** — visualization and review UX
- **Docs** — example tasks and best practices

Start with an issue, or open a PR directly.

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## Sponsors

If Agora saves you time or helps your team ship better AI workflows, you can support the project here:

- Project: [github.com/FairladyZ625/Agora](https://github.com/FairladyZ625/Agora)
- Issues / collaboration: [github.com/FairladyZ625/Agora/issues](https://github.com/FairladyZ625/Agora/issues)
- Email: `lizeyu990625@gmail.com`
- WeChat: `FairladyZ625`
- Phone: `15258817691`

<details>
<summary>WeChat Pay / Alipay</summary>
<br/>

<table>
<tr>
<td align="center" width="50%">
<strong>WeChat Pay</strong><br/><br/>
<img src="./assets/sponsor/wechat-pay.jpg" alt="WeChat Pay QR for FairladyZ" width="280"/>
</td>
<td align="center" width="50%">
<strong>Alipay</strong><br/><br/>
<img src="./assets/sponsor/alipay-pay.jpg" alt="Alipay QR for FairladyZ" width="280"/>
</td>
</tr>
</table>

</details>

---

## Acknowledgments

- [Edict](https://github.com/cft0808/edict) — the "Three Departments and Six Ministries" architecture showed that governance and free discussion can coexist
- [OpenClaw](https://github.com/openclaw/openclaw) — Discord multi-agent infrastructure (Thread management, ACP protocol, Slash Commands, Hook system) that Agora's first adapter is built on
- Claude Code Agent Teams — validated the "deliberate → divide → aggregate" collaboration pattern

---

## Origin Story

It started with a simple experiment: pull a group of AI agents into the same Discord channel and watch them @-mention each other.

The result was magical. They challenged each other, corrected each other, filled each other's blind spots. Three agents really were smarter than one. I realized multi-agent collaboration wasn't hype — it produced more stable conclusions than any single model.

Then I tried to turn that magic into productivity.

The problems hit fast. 12 agents in one channel, messages exploding, impossible to follow. The coordinator agent got @-mentioned by everyone, context overflowing constantly. The whole flow ran on prompts — "discuss first, then execute" was a suggestion the agents sometimes followed and sometimes ignored. Lots of discussion, no real output.

I was stuck between two bad options: allow free discussion and accept chaos, or enforce strict control and lose collective intelligence.

Then I found [Edict](https://github.com/cft0808/edict) — a multi-agent orchestration project using a "Three Departments and Six Ministries" architecture. It showed me a third path: **you can have both democracy and decision authority.** Free discussion stays free. Critical checkpoints have a decision-maker. Process advancement is guaranteed by code, not prompt prayers.

That insight changed everything. Agora is the result.

**Freedom of ideas. Discipline of execution.**

---

## License

[Apache 2.0](LICENSE)
