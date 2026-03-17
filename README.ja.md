<div align="center">

[中文](./README.zh-CN.md) | [English](./README.md) | **日本語**

<br/>

<h1>Agora</h1>

<p><strong>エージェントが議論し、人間が裁決し、実行は統治される。</strong></p>

<p>エージェント社会のためのオーケストレーションとガバナンスの層。<br/>
Agora は自由な議論を、段階化された監査可能なデリバリーフローへ変換します。</p>

[![GitHub stars](https://img.shields.io/github/stars/FairladyZ625/Agora?style=flat-square&logo=github&color=yellow)](https://github.com/FairladyZ625/Agora/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/FairladyZ625/Agora?style=flat-square&logo=github)](https://github.com/FairladyZ625/Agora/network)
[![GitHub issues](https://img.shields.io/github/issues/FairladyZ625/Agora?style=flat-square)](https://github.com/FairladyZ625/Agora/issues)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen?style=flat-square&logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)

</div>

---

## 問題は「ボットをもう一つ繋ぐこと」ではない

多くのエージェントを同じチャネルに入れると、確かに集合知は生まれます。ですが規模が上がると次の問題が出ます。

- 議論ノイズがタスクを埋める
- コーディネーターのコンテキストが汚染される
- 人間承認が曖昧になる
- 結論が固まる前に実行が始まる
- チャットログが成果物にはならない

本当の問題は「Claude や Codex をどう接続するか」ではなく、

**誰が、いつ、どの情報を見るべきかをどう設計するか**

です。Agora はそこを扱います。

---

## Agora とは何か

Agora は:

- オーケストレーション層
- ガバナンス層
- タスクごとの隔離コンテキスト
- 人間 gate による裁決
- provider-neutral な実行制御面

Agora は:

- 単なる IM ボットではない
- 単なる coding-agent launcher ではない
- 低レベルの Claude/Codex session framework そのものではない

低レベルの coding runtime は commodity として扱い、Agora は編排の真実を保持します。

---

## コアモデル

```text
Citizens が議論  ->  Archon が裁決  ->  Executors が実行
```

| 概念 | 役割 |
| --- | --- |
| **Agora** | タスク広場。タスク、コンテキスト、参加者、通知、アーカイブを統括 |
| **Citizens** | 議論参加者。互いに批判し、提案を洗練する |
| **Archon** | 人間の裁決者。Gate で approve / reject / pause を行う |
| **Craftsman** | 自作 runtime ではなく、統治された実行ロール |
| **Gate** | 明示的なフェーズ遷移チェックポイント |
| **Decree** | 実行に渡される curated brief / 採択済み決定 |

中心となる考えは次の通りです。

> 実行者にとって、多くの議論はノイズである。

そのため Agora は実行参加形態を分けます。

- `execution-only`
- `dialogue-capable`

両方とも存在できますが、露出ポリシーが異なります。

---

## 現在の実行モデル

Agora は旧来の tmux-based Craftsman パスを主役として扱いません。

現在は:

- `ACPX` が既定の execution substrate
- `CraftsmanAdapter` は Core-facing abstraction として維持
- `Craftsman` はビジネス上の実行ロールとして維持
- 旧 tmux public shell は削除済み

Agora が扱うのは:

- いつ実行を許可するか
- 誰が実行するか
- 実行者を議論に参加させるか
- 実行者に full log か brief を渡すか
- 結果をどうタスク状態へ反映するか

---

## Claude をそのままチャネルに入れれば十分では？

それは可能です。Agora はそれを否定しません。

ただし IM 参加だけでは transport が解決するだけで、governance は解決しません。Agora は引き続き次を担います。

- いつ参加させるか
- いつ隠すか
- 全議論を渡すか brief のみにするか
- どこで人間承認を必須にするか
- 出力をどうタスク状態に反映するか

---

## アーキテクチャ

```text
IM / Entry Adapters
Discord · Feishu · Slack · Dashboard · CLI · REST
                |
                v
Agora Core / Orchestrator
Task · Context · Participant · Gate · Approval
Scheduler · Notification · Archive · Recovery
                |
                v
Runtime / Execution Adapters
OpenClaw · ACPX · future runtimes
```

原則:

- `packages/core` が編排セマンティクスを持つ
- IM、runtime、execution は adapter
- provider 固有情報は Core の長期主モデルにしない

---

## クイックスタート

### 前提

- Node.js 22+
- npm 10+
- `acpx`

任意:

- OpenClaw（IM-hosted agent participation が必要な場合）
- Discord（live thread 体験が必要な場合）

### インストール

```bash
git clone https://github.com/FairladyZ625/Agora.git
cd Agora
./scripts/bootstrap-local.sh
```

### 初期化と起動

```bash
./agora init
./agora start
```

既定のローカル URL:

- API: `http://127.0.0.1:18420/api/health`
- Dashboard: `http://127.0.0.1:33173/dashboard/`

### タスク作成

```bash
./agora create "API に認証ミドルウェアを追加する"
```

### 典型フロー

```text
タスク作成
  -> Citizens が議論
  -> Archon がレビュー
  -> execution-only または dialogue-capable executor を選択
  -> ACPX-backed execution が動く
  -> 成果物がレビューとアーカイブへ進む
```

### 品質ゲート

```bash
cd agora-ts
npm run check:strict
npm run scenario:all
```

---

## ユースケース

- 要件整理と方針収束
- アーキテクチャ / 実装レビュー
- 議論後のコード / テスト / レビュー実行
- 複数プロジェクトと複数コンテキストの分離
- 長いタスクスレッドでの参加者露出制御
- 人間承認付きの実運用エージェント編排

---

## 比較

| | Agora | IM に bot を直結 | CrewAI / AutoGen | LangGraph |
| --- | --- | --- | --- | --- |
| マルチエージェント議論 | ✅ | ⚠️ | ✅ | ⚠️ |
| 人間 gate | ✅ | ❌ | ⚠️ | ⚠️ |
| 参加者露出ポリシー | ✅ | ❌ | ❌ | ❌ |
| 実行を統治対象として扱う | ✅ | ❌ | ⚠️ | ⚠️ |
| provider-neutral Core | ✅ | ❌ | ❌ | ⚠️ |

---

## ロードマップ

- [x] マルチボット thread / task commands / subagent dispatch
- [x] ステートマシンと Gate の基盤
- [x] Dashboard と review surface
- [x] ACPX-backed 既定 execution substrate
- [x] tmux public shell retirement
- [ ] execution exposure policy の強化
- [ ] project / brain / citizen workbench の深化
- [ ] runtime / IM adapters の拡張
- [ ] マルチテナント governance と SaaS 化

---

## リポジトリ構成

```text
agora-ts/      TypeScript 実装
dashboard/     React dashboard
Doc/           公開向けドキュメント
docs/          architecture / planning / walkthrough（別 git repo）
extensions/    外部 adapters / plugins
```

---

## Contributing

価値が高い領域:

- 編排とガバナンスのセマンティクス
- runtime / IM adapters
- dashboard operator UX
- project / task / archive workflow
- 社会構造モデルを明確にするドキュメント

まず [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。
`AGENTS.md` を読んでいて private な `docs/` repo にアクセスできない場合は、公開ミラーの [Doc/agents-contributor-reference.md](Doc/agents-contributor-reference.md) を使ってください。
