<div align="center">

[中文](./README.zh-CN.md) | [English](./README.md) | **日本語**

<br/>

<h1>⚡ Agora</h1>

<p><strong>エージェントが議論し、人間が決定し、マシンが実行する。</strong></p>

<p>マルチエージェントAIシステムのための民主的オーケストレーション層。<br/>
自由な議論を、信頼性が高く監査可能な本番ワークフローへ変換します。</p>

[![GitHub stars](https://img.shields.io/github/stars/FairladyZ625/Agora?style=flat-square&logo=github&color=yellow)](https://github.com/FairladyZ625/Agora/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/FairladyZ625/Agora?style=flat-square&logo=github)](https://github.com/FairladyZ625/Agora/network)
[![GitHub issues](https://img.shields.io/github/issues/FairladyZ625/Agora?style=flat-square)](https://github.com/FairladyZ625/Agora/issues)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen?style=flat-square&logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)

</div>

---

## 誕生の背景

すべては一つのシンプルな実験から始まりました。複数のAIエージェントを同じDiscordチャンネルに集め、互いに@メンションし合う様子を観察したのです。

その光景は魔法のようでした。エージェントたちは互いに疑問を呈し、誤りを指摘し、盲点を補い合いました。三人寄れば文殊の知恵——複数のエージェントが協力することで、単一モデルよりも安定した結論を導き出せることを初めて実感しました。

そして、この魔法を生産性に変えようとしました。

問題はすぐに現れました。12のエージェントが一つのチャンネルで互いに@メンションし合い、メッセージが爆発的に増加。コーディネーターエージェントは全員から@メンションされ、コンテキストが繰り返しオーバーフロー。フロー全体がプロンプトに依存し、「議論してから実行する」という指示は時に守られ、時に無視されました。議論は活発でも、最終的に誰もコードを書かず、テストを実行せず、成果物を届けませんでした。

ジレンマに陥りました。自由な議論を許せば混乱を受け入れることになり、厳格な管理をすれば集合知を失うことになる。

そこで [Edict](https://github.com/cft0808/edict) を発見しました——「三省六部」アーキテクチャでマルチエージェントオーケストレーションを実現するオープンソースプロジェクトです。これが一つの可能性を示してくれました：**民主主義と決定権を同時に持つことができる。** 自由な議論は保持しつつ、重要なポイントでは誰かが決断を下し、プロセスの推進はプロンプトへの祈りではなくコードで保証される。

これがAgoraです。**Freedom of ideas. Discipline of execution.**

---

## 問題の本質

複数のエージェントを同じチャンネルに置くと、最初は魔法のようです。しかしエージェント数が増えると：

- **メッセージ爆発** — タスクが会話に埋もれ、人間には追いきれない
- **コンテキスト汚染** — コーディネーターが全員から@メンションされ、推論品質が急落
- **予測不能な動作** — フローはプロンプト依存で、「議論してから実行」は保証ではなく提案
- **議論の収束困難** — 明確な裁決ポイントがなく、エージェントは無限に議論できる
- **実行のクローズドループなし** — チャット層からコード・テスト・レビューという実際の成果物は生まれない

核心的な矛盾：自由な議論は創造性をもたらすが、混乱も招く。厳格な管理は秩序をもたらすが、集合知を殺す。

**Agoraの答え：両方を手に入れる。** 議論フェーズは完全に自由。実行フェーズは完全に確定的。切り替えはステートマシンが制御します。

---

## 仕組み

```
Citizens が議論  →  Archon が決定  →  Craftsmen が実行
  (自由な討論)       (人間によるレビュー)   (確定的な成果物)
```

| 概念 | 役割 |
|------|------|
| **Agora** | タスクアリーナ — タスクごとの隔離された議論空間（Discordスレッドまたはチャンネル） |
| **Citizens** | 参加エージェント — 互いに可視で、互いに批判的 |
| **Archon** | 人間レビュアー — Gateチェックポイントで最終決定を下す |
| **Craftsmen** | 実行ツール — Claude Code、Codex、Gemini CLI、またはカスタムCLI |
| **Decree** | Gate通過後に発行される確定的な指示 |
| **Gate** | フェーズ遷移チェックポイント — 自動通過、人間承認、クォーラム投票として設定可能 |

---

## 主な特徴

**議論優先** — 各タスクは隔離された議論空間を持ちます。エージェントは互いを見て仮定に疑問を呈することができ、グローバルチャンネルのノイズを汚染しません。

**確定的オーケストレーション** — タスクのライフサイクルはステートマシンで制御されます。作成・ディスパッチ・遷移・アーカイブはすべてコードで保証され、プロンプトに依存しません。

**Archonレビュー** — すべてのGateは人間の承認を必要とするよう設定できます。議論の結論は実行前に承認が必要。コード出力は完了前に承認が必要。どのフェーズでも一時停止や差し戻しが可能です。

**Craftsmen実行** — 議論が収束した後、実行ツールをディスパッチして実際の成果物を生産します：コード、テスト、レビュー。

**動的コラボレーション** — 議論と実行は複数ラウンドにわたって交互に行えます。シンプルなタスクは直接実行へ。複雑なタスクは多ラウンドの議論をサポート。

**プラガブルアダプター** — IMレイヤー（Discord、Feishu、Slack）、ランタイムレイヤー（OpenClaw、CrewAI）、Craftsmanレイヤー（Claude Code、Codex、Gemini）はすべて交換可能なアダプターです。コアオーケストレーションロジックはプラットフォームに依存しません。

---

## アーキテクチャ

```
┌─────────────────────────────────────────────┐
│          IM / Channel Adapters               │
│   Discord · Feishu · Slack · Dashboard       │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│           Agora Core / Orchestrator          │
│  Task · Context · Participant · Gate         │
│  ステートマシン · Scheduler · Archive        │
└──────────┬───────────────────┬──────────────┘
           │                   │
┌──────────▼──────┐   ┌────────▼──────────────┐
│  Agent Runtime  │   │  Craftsman Adapters    │
│  OpenClaw       │   │  Claude Code · Codex   │
│  CrewAI         │   │  Gemini CLI · カスタム │
└─────────────────┘   └───────────────────────┘
```

コア原則：オーケストレーションのセマンティクスは `packages/core` にのみ存在します。すべてのIM、ランタイム、Craftsmanはアダプターに過ぎません。

---

## クイックスタート

### 前提条件

- Node.js 22+
- npm 10+
- tmux（craftsmen tmuxランタイムを使用する場合）

### インストール

```bash
git clone https://github.com/FairladyZ625/Agora.git
cd agora
cp .env.example .env
cd agora-ts && npm install
cd ../dashboard && npm install
```

### 開発スタック起動

```bash
./docs/02-PRODUCT/scripts/dev-start.sh
```

デフォルトエンドポイント：

- API: `http://127.0.0.1:18420/api/health`
- Dashboard: `http://127.0.0.1:33173/dashboard/`

### 最初のタスクを作成

```bash
cd agora-ts
npm run dev -w @agora-ts/cli -- create "APIに認証ミドルウェアを追加する"
```

### 典型的なフロー

```
task create "..."           ← タスク作成、スレッドを自動開設
      │
      ▼
Citizens が議論             ← エージェントがスレッド内で自由に討論
      │
      ▼
Gate 1: Archon Review       ← 人間が結論をレビュー、承認または差し戻し
      │
      ▼
Craftsmen が実行            ← Claude Codeがコードを書き、Codexがテストを実行
      │
      ▼
Gate 2: Archon Review       ← 人間が成果物をレビュー
      │
      ▼
完了 → ナレッジベース同期    ← Writer-Agentがアーカイブとgitコミットを完了
```

### 品質ゲート

```bash
cd agora-ts
npm run check:strict        # 厳格品質ゲート（デフォルトのコミット基準）
npm run scenario:all        # エージェントシナリオ回帰テスト
```

---

## ユースケース

- **要件の明確化と方針収束** — 多役割の議論は単一モデルの出力より包括的
- **複雑なバグの特定と根本原因分析** — エージェントが互いの仮定に疑問を呈する
- **コード・テスト生成** — 議論後、直接Craftsmenをディスパッチして実行
- **クロスモデルコードレビュー** — 複数のモデルが同じPRを同時にレビュー
- **タスク全ライフサイクルの記録** — Writer-Agentがナレッジベースに同期
- **Discordコラボレーションをチャットからエンジニアリングタスクシステムへ**

---

## 比較

| | Agora | AutoGen / CrewAI | LangGraph | チャットボット |
|---|---|---|---|---|
| マルチエージェント議論 | ✅ | ✅ | ⚠️ シミュレート | ❌ |
| 人間参加型ゲート | ✅ | ⚠️ オプション | ⚠️ オプション | ❌ |
| 確定的ステートマシン | ✅ | ❌ | ✅ | ❌ |
| 実際のコード/テスト成果物 | ✅ | ⚠️ | ⚠️ | ❌ |
| プラガブルIMアダプター | ✅ | ❌ | ❌ | ❌ |

---

## ロードマップ

- [x] **Phase -1** — PoC：マルチボットスレッド、`/task`コマンド、サブエージェントディスパッチ
- [x] **Phase 0** — SQLite + canonical enums、コマンド/権限基盤、OpenClawアダプター
- [x] **Phase 1** — ステートマシン + Gate、Discuss/Executeモード切替、スナップショットロールバック
- [x] **Phase 1.5** — Craftsmen実行ループ：Claude Code / Codex / Gemini CLI
- [x] **Phase 2** — Dashboardビジュアライゼーション、Archon Review Panel、Archiveキュー
- [ ] **Phase 3** — より多くのアダプター、ガバナンスプリセット、オプションのADR直接書き込み
- [ ] **Phase 4** — マルチテナントタスク分離、エンタープライズガバナンス、SaaSモード

---

## プロジェクト構造

```
agora-ts/                    TypeScript実装（server / cli / packages）
├── apps/server/             Fastify HTTPサーバー
├── apps/cli/                Commander CLI
└── packages/
    ├── core/                オーケストレーションドメインロジック + ステートマシン
    ├── contracts/           共有DTO / schemaコントラクト
    ├── db/                  SQLiteマイグレーション + リポジトリ
    ├── config/              設定スキーマ + ローダー
    └── testing/             テストランタイムヘルパー

dashboard/                   Reactフロントエンド（Vite + Tailwind + Zustand）
archive/agora-python-legacy/ Pythonレガシー参照実装
docs/                        アーキテクチャドキュメント（独立gitリポジトリ）
extensions/                  プラグインアダプター（OpenClawなど）
```

---

## コントリビューション

コントリビューションを歓迎します。優先分野：

- **アダプター** — 新しいIMプラットフォーム、新しいエージェントランタイム
- **Craftsmen** — 新しい実行ツールの統合
- **ガバナンス** — ガバナンステンプレートと権限モデル
- **Dashboard** — ビジュアライゼーションとレビューUX
- **ドキュメント** — タスク例とベストプラクティス

issueから始めるか、直接PRを開いてください。

---

## スポンサー

Agoraが役に立った場合は、プロジェクトの継続開発を支援していただけると助かります。

- Project: [github.com/FairladyZ625/Agora](https://github.com/FairladyZ625/Agora)
- Issues / contact: [github.com/FairladyZ625/Agora/issues](https://github.com/FairladyZ625/Agora/issues)
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

## 謝辞

- [Edict](https://github.com/cft0808/edict) — 「三省六部」アーキテクチャからのインスピレーション。ガバナンスと自由な議論が共存できることを示してくれました
- [OpenClaw](https://github.com/openclaw/openclaw) — Discordマルチエージェントインフラ（スレッド管理、ACPプロトコル、スラッシュコマンド、フックシステム）を提供。Agoraの最初のアダプターはこの上に構築されています
- Claude Code Agent Teams — 「議論→分担→集約」というコラボレーションパターンの実現可能性を検証

---

## ライセンス

[Apache 2.0](LICENSE)
