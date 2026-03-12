---
name: zeyu-ai-brain-sop
version: "1.3"
description: |
  ZeYu AI Brain 知识库标准操作规程（SOP）- 所有 Agent 操作知识库的唯一权威指南。
  包含：知识库结构说明、任务生命周期 SOP、文档更新规范、检索规则、巡检标准。
  
  **强制使用场景**：
  - 创建、更新、归档任务时
  - 操作知识库任何目录时
  - 记录决策、沉淀经验时
  - 更新项目、团队、排期、看板时
  - 执行知识库巡检时
  
  **核心原则**：单一真相源（SSoT）- 所有知识库操作规范只在此 skill 中定义，禁止在各 Agent workspace 中维护独立 SOP。
tags:
  - knowledge-base
  - sop
  - task-lifecycle
  - governance
  - review
applies_to:
  - All OpenClaw Agents
  - Writer-Agent
  - Review-Manager
  - Chronicle-Agent
  - Codex Main
maintainer: 李泽宇
updated: 2026-03-05 (workspace delivery workflow patch)
---

# ZeYu AI Brain 知识库 SOP

**单一真相源（SSoT）- 所有 Agent 操作知识库的唯一权威指南**

## 核心原则

1. **SSoT 原则**：所有知识库操作规范只在此 skill 中定义
2. **强制阅读**：任何 Agent 操作知识库前必须先读此 skill
3. **禁止散落**：禁止在各 Agent workspace 中维护独立 SOP
4. **统一巡检**：Review Manager 按此 skill 的标准巡检
5. **持续改进**：发现问题只修改此 skill，自动同步到所有 Agent
6. **脚本优先**：创建/更新/归档任务必须优先调用脚本，禁止手写骨架与手改状态块

---

## 脚本优先（v1.1 新增，强制）

### 目录

- `scripts/create-task-skeleton.sh`
- `scripts/update-task-status.sh`
- `scripts/archive-task.sh`

### 强制规则

1. **创建任务**：先跑 `create-task-skeleton.sh`，再补充业务内容。
2. **更新状态**：先跑 `update-task-status.sh` 更新 AUTO 状态块，再写进展。
3. **归档任务**：先跑 `archive-task.sh`，再补充关联文档和看板同步。
4. 如果脚本失败，必须在回执附错误日志；禁止直接绕过脚本手改。

### 使用示例

```bash
# 1) 创建任务骨架
scripts/create-task-skeleton.sh \
  --task-id TASK-20260304-AI-CODE-REVIEW-RESEARCH-01 \
  --title "AI 代码审核与质量保证研究" \
  --owner "李主席" \
  --owner-id "530383608410800138" \
  --due-date "2026-06-30" \
  --project "MbseCopilot"

# 2) 更新状态
scripts/update-task-status.sh \
  --task-id TASK-20260304-AI-CODE-REVIEW-RESEARCH-01 \
  --status "进行中" \
  --progress "30%" \
  --summary "完成 RFC v0.2 修订"

# 3) 归档任务
scripts/archive-task.sh \
  --task-id TASK-20260304-AI-CODE-REVIEW-RESEARCH-01 \
  --reason "M4 完成并验收"
```

---

## 知识库结构说明

### 目录概览

\`\`\`
ZeYu-AI-Brain/
├── 00-INBOX/              # 收件箱：待处理事项、想法、每日待办
├── 01-CONTEXT/            # 上下文：客户、决策、成功模式
├── 02-PROJECTS/           # 项目：所有项目的主文档和索引
├── 03-ACTIVE-TASKS/       # 活跃任务：正在进行的任务
├── 04-TEAM/               # 团队：成员信息、当前任务、最近完成
├── 05-SCHEDULE/           # 排期：本周排期、月度里程碑、截止日期
├── 06-DASHBOARD/          # 仪表盘：每日简报、进度看板、决策队列
├── 07-CONTEXT-SNAPSHOT/   # 上下文快照：最新的全局上下文
├── 08-RAW-CONTEXT/        # 原始上下文：待处理的入站信息
├── 09-ARCHIVE/            # 归档：已完成的任务和历史文档
├── 10-GOALS/              # 目标：核心目标、年度/季度/月度目标
├── 11-RESOURCES/          # 资源：技术资源、工具清单、参考资料
├── 12-REVIEWS/            # 复盘：知识库巡检、团队进度、决策复盘
├── 13-DAILY-LOG/          # 每日日志：按日期记录的频道日志
└── templates/             # 模板：各类文档模板
\`\`\`


### 各目录详细说明

#### 00-INBOX（收件箱）
**用途**：临时存放待处理的事项、想法、每日待办

**核心文件**：
- `todo-backlog.md` - 所有待办事项的 SSoT
- `ideas.md` - 临时想法和灵感
- `daily-scratch.md` - 每日临时记录

**更新频率**：每天多次

**责任人**：所有 Agent

#### 01-CONTEXT（上下文）
**用途**：记录重要的上下文信息，供长期参考

**子目录**：
- `客户/` - 客户信息、需求、沟通记录
- `决策/` - 重要决策的记录和理由
- `成功模式/` - 可复用的成功经验和模式

**更新时机**：
- 做出重要决策时 → 记录到 `决策/决策日志.md`
- 完成任务发现可复用模式时 → 记录到 `成功模式/可复用模式.md`
- 新增客户或重要客户沟通时 → 更新 `客户/客户总览.md`

**责任人**：Writer-Agent（主要）、所有 Agent（提供素材）

#### 02-PROJECTS（项目）
**用途**：每个项目的主文档和文档索引

**文件命名规范**：
- `项目名.md` - 项目主文档（概述、状态、团队、里程碑）
- `项目名-docs-index.md` - 项目文档索引（核心文档路径）

**当前标准项目名**：
- 玉衡MBSE系统建模软件
- 天玑MBSE体系建模软件
- Divebuddy潜伴儿潜水小程序
- 玑衡自绘MBSE Agent

**更新时机**：
- 项目状态变化时
- 完成重要里程碑时
- 团队成员变动时

**责任人**：Writer-Agent

#### 03-ACTIVE-TASKS（活跃任务）
**用途**：正在进行的任务，每个任务一个目录

**任务目录结构**：
\`\`\`
TASK-YYYYMMDD-NAME-01/
├── 00-任务简报.md          # 任务概述、目标、负责人、时间线
├── 00-CURRENT.md           # 当前状态（必须维护）
├── 01-REQUIREMENTS/        # 需求文档
├── 02-WORKING/            # 工作文件
├── 03-PUBLISHED/          # 已发布的交付物
└── 04-REFERENCES/         # 参考资料
\`\`\`

**核心文件说明**：
- `00-任务简报.md` - 任务的"名片"，包含基本信息
- `00-CURRENT.md` - 任务的"心跳"，必须实时更新

**更新频率**：每天至少一次（更新 `00-CURRENT.md`）

**责任人**：任务负责人、Writer-Agent（协助）

#### 04-TEAM（团队）
**用途**：团队成员信息、当前任务、最近完成

**文件命名规范**：`成员姓名.md`

**必须包含的字段**：
- 基本信息（姓名、角色、联系方式）
- 当前任务（正在做什么）
- 最近完成（最近完成了什么）
- 技能标签

**更新时机**：
- 分配新任务时
- 完成任务时
- 成员信息变更时

**责任人**：Writer-Agent

#### 05-SCHEDULE（排期）
**用途**：时间维度的任务管理

**核心文件**：
- `本周排期.md` - 本周每天的任务安排
- `月度里程碑.md` - 本月的关键里程碑
- `截止日期汇总.md` - 所有任务的截止日期

**更新频率**：
- `本周排期.md` - 每周一生成，每天更新
- `月度里程碑.md` - 每月初生成，每周更新
- `截止日期汇总.md` - 任务变化时更新

**责任人**：Writer-Agent（自动化）、Sonnet（TODO 同步）

#### 06-DASHBOARD（仪表盘）
**用途**：高层次的状态概览

**核心文件**：
- `daily-briefing.md` - 每日简报（今日焦点、团队动态）
- `progress-board.md` - 任务进度看板（关键任务、ETA、风险）
- `decision-queue.md` - 待决策事项
- `weekly-review.md` - 周度复盘

**更新频率**：
- `daily-briefing.md` - 每天早上 8:00
- `progress-board.md` - 任务状态变化时
- `decision-queue.md` - 出现待决策事项时
- `weekly-review.md` - 每周五

**责任人**：Writer-Agent

#### 07-CONTEXT-SNAPSHOT（上下文快照）
**用途**：最新的全局上下文快照

**核心文件**：`latest.md`

**更新频率**：每天早上 8:00（与 daily-briefing 同步）

**责任人**：Writer-Agent

#### 08-RAW-CONTEXT（原始上下文）
**用途**：待处理的入站信息

**子目录**：
- `00-PENDING/` - 待确认的任务和信息
- 其他原始数据

**治理规则**：
- 入站自动化只写 `00-PENDING/`，不直接创建 ACTIVE 任务
- Pending 必须人工确认后再晋升到 `03-ACTIVE-TASKS/`
- Pending 超过 24h 未确认，执行 TTL 归档到废弃区

**责任人**：所有 Agent（写入）、李泽宇（确认）

#### 09-ARCHIVE（归档）
**用途**：已完成的任务和历史文档

**归档规则**：
- 任务完成后移至此目录
- 保持原有目录结构
- 添加归档日期标记

**责任人**：Writer-Agent

#### 10-GOALS（目标）
**用途**：核心目标、年度/季度/月度目标

**核心文件**：`核心目标.md`

**更新时机**：
- 设定新目标时
- 目标完成时
- 目标调整时

**责任人**：李泽宇（设定）、Writer-Agent（维护）

#### 11-RESOURCES（资源）
**用途**：技术资源、工具清单、参考资料

**更新时机**：
- 发现有价值的资源时
- 完成技术调研时

**责任人**：所有 Agent

#### 12-REVIEWS（复盘）
**用途**：各类复盘和巡检报告

**子目录**：
- `KNOWLEDGEBASE/` - 知识库巡检报告
- `TEAM/` - 团队进度复盘
- `DECISION/` - 决策复盘

**更新频率**：
- 知识库巡检：每 6 小时
- 团队进度：每天 17:00
- 决策复盘：按需

**责任人**：Review-Manager

#### 13-DAILY-LOG（每日日志）
**用途**：按日期记录的频道日志

**文件命名规范**：`YYYY/MM/channel-log-YYYY-MM-DD.md`

**更新频率**：每 2 小时追加

**责任人**：Chronicle-Agent → Writer-Agent


---

## 任务生命周期 SOP

### 阶段一：创建任务

**先执行脚本（强制）**：
```bash
scripts/create-task-skeleton.sh --task-id TASK-YYYYMMDD-NAME-01 --title "任务标题"
```

**触发条件**：
- 李泽宇明确要求创建任务
- 从 `08-RAW-CONTEXT/00-PENDING/` 晋升

**必须更新的地方**：

1. **03-ACTIVE-TASKS/TASK-YYYYMMDD-NAME-01/**
   - 创建任务目录结构
   - 写入 `00-任务简报.md`
   - 写入 `00-CURRENT.md`（初始状态）

2. **00-INBOX/todo-backlog.md**
   - 添加相关 TODO 项
   - 格式：`- [ ] #TODAY [T001] 任务标题`

3. **02-PROJECTS/项目名.md**
   - 在"当前任务"章节添加此任务
   - 更新项目状态

4. **04-TEAM/成员.md**
   - 在"当前任务"章节添加此任务
   - 更新成员工作负载

5. **05-SCHEDULE/本周排期.md**
   - 将任务加入本周排期表
   - 标注负责人和预计完成时间

6. **06-DASHBOARD/progress-board.md**
   - 将任务加入进度看板
   - 设置 ETA 和风险等级

7. **10-GOALS/核心目标.md**（如果任务关联目标）
   - 在相关目标下添加此任务

**执行顺序**：
1. 先创建任务目录和核心文件（03-ACTIVE-TASKS）
2. 再更新所有关联文档（按上述顺序）
3. 最后提交 commit

**回执要求**：
- Commit hash
- Git status --short（必须为空）
- 列出所有更新的文件

**责任人**：Writer-Agent

### 阶段二：更新任务

**先执行脚本（强制）**：
```bash
scripts/update-task-status.sh --task-id TASK-xxx --status "进行中" --progress "xx%" --summary "本次进展"
```

**触发条件**：
- 任务状态变化
- 完成阶段性工作
- 出现阻塞或风险

**必须更新的地方**：

1. **03-ACTIVE-TASKS/TASK-xxx/00-CURRENT.md**
   - 更新状态字段
   - 更新进度百分比
   - 更新最新进展
   - 更新下一步计划
   - 如有阻塞，记录阻塞问题

2. **00-INBOX/todo-backlog.md**
   - 更新相关 TODO 的状态
   - 如果完成，标记为 `[x]`

3. **02-PROJECTS/项目名.md**
   - 更新项目进度
   - 如果完成里程碑，记录到"里程碑"章节

4. **04-TEAM/成员.md**
   - 更新成员的"当前任务"状态

5. **05-SCHEDULE/本周排期.md**
   - 更新任务完成度
   - 如果延期，调整排期

6. **06-DASHBOARD/progress-board.md**
   - 更新任务状态、完成度、风险
   - 如果 ETA 变化，更新 ETA

7. **01-CONTEXT/决策/决策日志.md**（如果有重要决策）
   - 记录决策内容、理由、影响

**更新频率**：
- 至少每天一次（更新 `00-CURRENT.md`）
- 状态变化时立即更新

**回执要求**：
- Commit hash
- Git status --short（必须为空）
- 列出所有更新的文件
- 简述主要变化

**责任人**：任务负责人、Writer-Agent（协助）

### 阶段二点五：交付物同步（v1.3 新增，强制）

**触发条件**：
- 在自己的 workspace 完成任务交付物（文档、代码、报告等）
- 需要将成果同步到知识库

**工作流程**：

1. **完成交付物后，立即通知 Writer-Agent**

**通知格式**：
```
@Writer-Agent 请将以下文件同步到知识库：

源文件：~/.openclaw/workspace-xxx/成果文档.md
目标位置：~/Documents/ZeYu-AI-Brain/03-ACTIVE-TASKS/TASK-YYYYMMDD-NAME-01/03-PUBLISHED/

任务 ID：TASK-YYYYMMDD-NAME-01
```

2. **Writer-Agent 执行同步**
   - **复制**文件到知识库（不是重写）
   - 保留原始格式和内容
   - 更新任务的 `00-CURRENT.md` 状态
   - 同步到 `06-DASHBOARD/progress-board.md`
   - 提交 git commit
   - 回复确认

3. **为什么是"复制"而不是"重写"？**
   - ✅ 保留原始作者的表达和细节
   - ✅ 避免信息丢失
   - ✅ 更快（直接 `cp` 命令）
   - ✅ 可追溯（保留 workspace 原件）

**示例**：

GLM-5 完成小红书曝光策略文档后：
```
@Writer-Agent 请将以下文件同步到知识库：

源文件：~/.openclaw/workspace-glm5/xiaohongshu-exposure-strategy.md
目标位置：~/Documents/ZeYu-AI-Brain/03-ACTIVE-TASKS/TASK-20260304-XHS-DAILY-ITERATION-01/03-PUBLISHED/03-曝光策略-评论为主.md

任务 ID：TASK-20260304-XHS-DAILY-ITERATION-01
```

Writer-Agent 执行：
1. `cp ~/.openclaw/workspace-glm5/xiaohongshu-exposure-strategy.md ~/Documents/ZeYu-AI-Brain/03-ACTIVE-TASKS/TASK-20260304-XHS-DAILY-ITERATION-01/03-PUBLISHED/03-曝光策略-评论为主.md`
2. 更新 `00-CURRENT.md` 状态为"已交付"
3. 提交 git commit
4. 回复确认

**回执要求**：
- Commit hash
- Git status --short（必须为空）
- 源文件路径
- 目标文件路径

**责任人**：
- 各 Agent：完成后主动通知（30 分钟内）
- Writer-Agent：收到通知后 30 分钟内完成同步

**巡检规则**：
- Review-Manager 巡检时检查"workspace 有成果但知识库没有"的情况
- 发现违规立即报告并要求补救

### 阶段三：完成/归档任务

**先执行脚本（强制）**：
```bash
scripts/archive-task.sh --task-id TASK-xxx --reason "任务完成"
```

**触发条件**：
- 任务完全完成
- 任务取消或废弃

**任务状态分类**：
- **已完成**：任务目标达成，可归档
- **等待反馈**：我方工作完成，等待外部反馈（仍保持"进行中"状态）
- **暂停**：临时搁置，未来可能恢复
- **取消**：不再执行

**必须处理的地方**：

1. **03-ACTIVE-TASKS/TASK-xxx/**
   - 更新 `00-CURRENT.md` 状态为"已完成"
   - 确保所有交付物在 `03-PUBLISHED/`
   - 如果完全完成，移动整个目录到 `09-ARCHIVE/`

2. **00-INBOX/todo-backlog.md**
   - 标记所有相关 TODO 为 `[x]`
   - 添加完成日期和结果

3. **02-PROJECTS/项目名.md**
   - 更新项目里程碑
   - 将任务从"当前任务"移至"已完成任务"

4. **04-TEAM/成员.md**
   - 将任务从"当前任务"移至"最近完成"
   - 更新成员工作负载

5. **05-SCHEDULE/本周排期.md**
   - 标记任务为已完成

6. **06-DASHBOARD/progress-board.md**
   - 从看板移除任务

7. **01-CONTEXT/成功模式/可复用模式.md**（如果有可复用经验）
   - 记录成功模式、关键决策、可复用方法

8. **13-DAILY-LOG/**
   - 记录任务完成事件（由 Chronicle-Agent 自动完成）

**特殊情况：等待反馈**
- 状态保持"进行中"
- `00-CURRENT.md` 中明确标注：
  - 等待对象（如"沈阳发动机所"）
  - 等待内容（如"调研报告反馈"）
  - 预期时间（如果有）
- 不移至 ARCHIVE
- 在 `06-DASHBOARD/progress-board.md` 中标注"等待反馈"

**回执要求**：
- Commit hash
- Git status --short（必须为空）
- 列出所有更新的文件
- 任务完成总结（一句话）

**责任人**：Writer-Agent


---

## 检索规则

**核心原则**：先检索再翻文件，省 Token，减少误判

**推荐检索流程**：
1. `zdr snapshot` - 快速了解知识库全貌
2. `zdr zeyu-status` - 查看当前状态
3. `zdr search "关键词" --limit=5` - 语义搜索相关文档
4. 根据检索结果精读命中文件

**检索命令**：
- 如果 `zdr` 在 PATH：直接使用 `zdr`
- 否则使用绝对路径：`/Users/lizeyu/.agents/skills/zeyu-docs-retrieval/zdr`

**详细检索规则**：参见 `zeyu-docs-retrieval` skill

---

## 巡检标准

### 巡检频率
- **知识库大巡检**：每 6 小时
- **任务状态一致性检查**：每 6 小时（与大巡检错开 3 小时）
- **脏仓库检查**：每小时

### 知识库大巡检清单

**检查项**：
1. 活跃任务是否缺少必需文件（`00-任务简报.md`、`00-CURRENT.md`）
2. 任务状态字段是否完整
3. 脏仓库检查（未提交的改动）
4. 归档任务是否还在 ACTIVE-TASKS
5. 文件命名是否符合规范

**报告格式**：
- 🔴 HIGH（需立即处理）
- 🟡 MEDIUM（需跟进）
- 🟢 LOW（观察）

**责任人**：Review-Manager

### 任务状态一致性检查清单

**检查项**：
1. 任务状态与 TODO 状态是否一致
2. 任务状态与个人页面是否一致
3. 如果标记"已完成"，是否已移至 ARCHIVE
4. 如果标记"等待反馈"，是否有明确的等待对象和预期时间
5. 交付物是否已归档到 `03-PUBLISHED/`
6. 进度看板是否与任务状态一致

**发现不一致时**：
- 立即报告给 Codex Main
- 标注责任人
- 提供修复建议

**责任人**：Review-Manager

---

## 违规处理

**发现违规时**：
1. Review-Manager 立即报告给 Codex Main
2. Codex Main 评估严重程度
3. 如果是 SOP 不清晰导致，修改此 skill
4. 如果是 Agent 未遵守，提醒并要求修正

**常见违规**：
- 操作知识库前未读此 skill
- 更新任务时遗漏关联文档
- 创建任务时未按标准结构
- 归档任务时未清理关联文档
- 在 workspace 中维护独立 SOP

---

## 附录：快速参考

### 任务创建检查清单
- [ ] 创建任务目录和核心文件
- [ ] 更新 todo-backlog.md
- [ ] 更新项目主文档
- [ ] 更新团队成员页面
- [ ] 更新本周排期
- [ ] 更新进度看板
- [ ] 关联核心目标（如果有）
- [ ] 提交 commit

### 任务更新检查清单
- [ ] 更新 00-CURRENT.md
- [ ] 更新 TODO 状态
- [ ] 更新项目进度
- [ ] 更新团队成员页面
- [ ] 更新排期
- [ ] 更新进度看板
- [ ] 记录重要决策（如果有）
- [ ] 提交 commit

### 任务完成检查清单
- [ ] 更新 00-CURRENT.md 状态
- [ ] 标记所有 TODO 完成
- [ ] 更新项目里程碑
- [ ] 更新团队成员页面
- [ ] 标记排期完成
- [ ] 从看板移除
- [ ] 沉淀成功模式（如果有）
- [ ] 移至 ARCHIVE（如果完全完成）
- [ ] 提交 commit

---

## Task/Todo 宪章（v1.2，强制）

> 目标：统一 Task 与 Todo 的判定、状态、归档口径，杜绝“凭感觉建任务/归档”。

### 1) 定义

- **Task（任务包）**：跨天、多步骤、多人协作、有交付物、需进度风险管理的工作包。
- **Todo（动作项）**：单动作、短周期、可快速完成的执行项。

### 2) 判定规则（满足任一即建 Task）

1. 预计周期 > 1 天
2. 需要 2 人及以上协作
3. 有正式交付物（文档/代码/报告）
4. 需要进度管理（%/风险/ETA）

不满足以上条件，默认建 Todo。若 Todo 超过 24h 未闭环或出现外部阻塞，升级为 Task。

### 3) 关系规则

- Todo **可以绑定** Task，也可以独立存在。
- 一个 Todo 只能绑定一个主 Task（禁止多归属）。
- Task 完成前，绑定 Todo 必须全部闭合或显式迁移。

### 4) 状态机（固定枚举）

#### Task 状态

- 待启动
- 进行中
- 等待反馈（我方完成，等待外部）
- 暂停
- 已完成
- 已取消

> `等待反馈` 不等于完成，不可归档到 `09-ARCHIVE/`。

#### Todo 状态

- `[ ]` 待办
- `[-]` 进行中（可选）
- `[x]` 已完成
- `[~]` 已取消（可选）

### 5) 归档规则

#### Task 归档

- 仅当 Task 状态为 `已完成` 或 `已取消` 时可归档。
- 执行：`scripts/archive-task.sh --task-id ...`
- 目录：`03-ACTIVE-TASKS/` → `09-ARCHIVE/`

#### Todo 归档（无 Task 场景）

- 无 Task 的已完成 Todo **不得进入** `09-ARCHIVE/`。
- 在 `todo-backlog.md` 勾选完成后，按月转存到：
  - `00-INBOX/todo-archive-YYYY-MM.md`
- 主 backlog 仅保留：未完成 + 近 14 天已完成项。

### 6) 执行契约

1. **先判定，再执行**（先判 Task/Todo，后创建/更新/归档）
2. **脚本优先**：Task 必须走 create/update/archive 脚本
3. **证据优先**：状态变更回执需附 commit hash + git status
4. **巡检强制项**：Review Manager 每 6 小时检查 Task/Todo 状态与归档一致性

---

## 版本历史

### v1.0 (2026-03-04)
- 初始版本
- 整合所有散落的 SOP
- 建立 SSoT 原则
