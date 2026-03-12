---
name: zeyu-docs-retrieval
version: "2.3"
description: |
  统一文档检索接口，为 OpenClaw Agent 编排系统提供三合一检索方案：
  1) YAML Frontmatter 快速定位
  2) 文档索引精确路径导航
  3) Smart Connections 语义搜索
tags:
  - docs-retrieval
  - openclaw
  - obsidian
  - yaml-frontmatter
  - docs-index
  - smart-connections
  - semantic-search
applies_to:
  - OpenClaw Agent
  - Codex Agent
  - Claude Code Agent
trigger_keywords:
  - 文档检索
  - 项目状态
  - docs index
  - YAML frontmatter
  - Smart Connections
  - 语义搜索
  - 跨项目知识复用
entrypoint: zdr
runtime_priority:
  - .venv
  - /Users/lizeyu/miniforge/bin/python
  - python3
prerequisites:
  - Obsidian REST API (localhost:27123)
  - Smart Connections 已安装并完成索引
  - Python 3.10+
governance:
  pending_write_path: 08-RAW-CONTEXT/00-PENDING
  require_human_confirmation_before_active: true
  pending_ttl_hours: 24
  final_output_must_update_current: true
maintainer: 泽宇
updated: 2026-03-03
---

# zeyu-docs-retrieval Skill

**统一文档检索接口 - 为 OpenClaw Agent 编排系统提供三合一检索方案**

本 Skill 为 ZeYu AI Brain 知识库提供统一的文档检索接口，支持：
- **YAML Frontmatter 快速定位**：快速理解项目定位、状态、技术栈
- **文档索引精确导航**：获取项目仓库中核心文档的精确路径
- **Smart Connections 语义搜索**：查找相关文档、历史解决方案

---

## 2026-03-03 口径更新（必须遵守）

1. **检索优先**：查知识库前先跑检索，不要直接盲读全库。
   - 原则：**先检索再翻文件**（省 Token，减少误判）。
   - 推荐最短链路：
     - `zdr snapshot`
     - `zdr zeyu-status`
     - `zdr search "关键词" --limit=5`

2. **命令入口**：若 `zdr` 不在 PATH，使用绝对路径：
   - `/Users/lizeyu/.agents/skills/zeyu-docs-retrieval/zdr`

3. **当前知识库标准目录（00-12）**：
   - `00-INBOX` `01-CONTEXT` `02-PROJECTS` `03-ACTIVE-TASKS` `04-TEAM`
   - `05-SCHEDULE` `06-DASHBOARD` `07-CONTEXT-SNAPSHOT` `08-RAW-CONTEXT` `09-ARCHIVE`
   - `10-GOALS` `11-RESOURCES` `12-REVIEWS`

4. **当前项目标准名（统一口径）**：
   - 玉衡MBSE系统建模软件
   - 天玑MBSE体系建模软件
   - Divebuddy潜伴儿潜水小程序
   - 玑衡自绘MBSE Agent

5. **说明**：下文包含部分历史示例项目名，仅作命令演示；执行时以上述标准口径为准。

---

## 治理规范适配（v2.2）

当用于任务编排时，遵循以下最小治理约束：
- 入站自动化只写 `08-RAW-CONTEXT/00-PENDING`，不直接创建 ACTIVE 任务。
- Pending 必须人工确认后再晋升到 `03-ACTIVE-TASKS`。
- Pending 超过 24h 未确认，执行 TTL 归档到废弃区。
- 任务发布时应维护 `00-CURRENT.md` 唯一入口，并输出 final 的 Before→After 一句话 diff 摘要。

## 快速开始（2 分钟）

### 前置条件

- Obsidian REST API 已启动（端口 27123）
- Smart Connections 插件已安装并完成索引
- Python 3.10+
- 已配置 `config.yaml`（参见 README.md）
- 运行时优先级：`.venv` > `/Users/lizeyu/miniforge/bin/python` > `python3`

### ⚠️ Obsidian 未启动时的处理

**检查方式**:
```bash
# 检查 Obsidian 是否运行
ps aux | grep -i obsidian | grep -v grep
```

**如果未启动**:
```bash
# 方式 1：通过 open 命令启动
open -a Obsidian

# 方式 2：手动启动
# 在应用程序中打开 Obsidian
```
**等待启动**:
- Obsidian 启动后,需要等待 5-10 秒让 REST API 完全就绪
- 可以通过 `curl http://localhost:27123` 验证服务是否可用

**注意事项**:
- 如果使用 `zdr` 命令时报错 `Connection refused`,通常是 Obsidian 未启动
- 启动 Obsidian 后,无需重启其他服务,直接重试 `zdr` 命令即可
- 建议:将 Obsidian 添加到 macOS 登录项,实现开机自动启动


### 最常用 8 个命令

```bash
# 1. 获取最新上下文快照（OpenClaw 优先读取）
zdr snapshot

# 2. 获取泽宇的当前状态（今日焦点/决策队列）
zdr zeyu-status

# 3. 列出所有活跃项目
zdr list-projects --status=active

# 4. 获取项目的文档索引
zdr docs-index DiveBuddy

# 5. 语义搜索全库
zdr search "权限管理"

# 6. 生成富上下文（用于 Agent 派发）
zdr context DiveBuddy --task="添加收藏功能"

# 7. 按任务ID读取原始上下文（证据链）
zdr task-source TASK-20260226-RESEARCH-01

# 8. 浏览原始上下文（可按日期）
zdr raw-context --date=2026-02
```

### 快速验证

```bash
# 测试 API 连接
zdr list-projects

# 预期输出：
# ✓ 找到 5 个项目
# - 玉衡MBSE系统建模软件 (active, high)
# - 天玑MBSE体系建模软件 (active, high)
# - Divebuddy潜伴儿潜水小程序 (active, high)
# ...
```

---

## 命令速查表（3 分钟）

### OpenClaw 核心命令（优先使用）

| 命令 | 功能 | 示例 | 详细文档 |
|------|------|------|----------|
| `snapshot` | 获取最新上下文快照 | `zdr snapshot` | [详见](#snapshot) |
| `zeyu-status` | 获取泽宇当前状态 | `zdr zeyu-status` | [详见](#zeyu-status) |
| `team-status` | 获取团队负载状态 | `zdr team-status` | [详见](#team-status) |
| `schedule` | 获取本周排期 | `zdr schedule` | [详见](#schedule) |
| `decisions` | 获取待决策事项 | `zdr decisions` | [详见](#decisions) |

**使用场景**：OpenClaw 每日 briefing、任务派发前快速获取全局状态

### 原始上下文命令（证据链）

| 命令 | 功能 | 示例 | 详细文档 |
|------|------|------|----------|
| `task-source` | 按任务ID读取原始上下文 | `zdr task-source TASK-20260226-RESEARCH-01` | [详见](#task-source) |
| `raw-context` | 浏览原始上下文仓 | `zdr raw-context --date=2026-02` | [详见](#raw-context) |
| `find-raw` | 语义检索原文仓 | `zdr find-raw "沈阳发动机所"` | [详见](#find-raw) |
| `verify` | 校验证据链完整性 | `zdr verify` | [详见](#verify) |

**使用场景**：先读任务原文，再写摘要/拆解，确保可追溯。

### 项目定位类命令

| 命令 | 功能 | 示例 | 详细文档 |
|------|------|------|----------|
| `list-projects` | 列出所有项目 | `zdr list-projects` | [详见](#list-projects) |
| `project-info` | 获取项目元数据 | `zdr project-info DiveBuddy` | [详见](#project-info) |
| `filter-projects` | 按条件筛选项目 | `zdr filter-projects --status=active --priority=high` | [详见](#filter-projects) |

**使用场景**：编排层选择项目、判断优先级

### 文档导航类命令

| 命令 | 功能 | 示例 | 详细文档 |
|------|------|------|----------|
| `docs-index` | 读取文档索引 | `zdr docs-index DiveBuddy` | [详见](#docs-index) |
| `get-doc` | 获取特定文档 | `zdr get-doc DiveBuddy CLAUDE.md` | [详见](#get-doc) |
| `list-docs` | 列出某类文档 | `zdr list-docs DiveBuddy --category=开发` | [详见](#list-docs) |

**使用场景**：执行层读取开发规范、架构文档

### 语义搜索类命令

| 命令 | 功能 | 示例 | 详细文档 |
|------|------|------|----------|
| `search` | 全库语义搜索 | `zdr search "权限管理"` | [详见](#search) |
| `search-project` | 限定项目搜索 | `zdr search-project "行程匹配" --project=DiveBuddy` | [详见](#search-project) |
| `similar-to` | 查找相似文档 | `zdr similar-to 02-PROJECTS/DiveBuddy.md` | [详见](#similar-to) |

**使用场景**：查找类似问题的解决方案、跨项目知识复用

### 上下文注入类命令

| 命令 | 功能 | 示例 | 详细文档 |
|------|------|------|----------|
| `context` | 生成富上下文 | `zdr context DiveBuddy --task="添加收藏功能"` | [详见](#context) |
| `cross-project` | 跨项目知识复用 | `zdr cross-project ygagentlanggraphLZY DiveBuddy --topic="RAG"` | [详见](#cross-project) |
| `history` | 查找历史方案 | `zdr history "权限管理实现"` | [详见](#history) |

**使用场景**：Agent 派发前注入上下文、复用历史经验

---

## 命令详解

### 原始上下文类

#### task-source

按任务ID读取原始上下文文件（证据链优先）。

```bash
zdr task-source TASK-20260226-RESEARCH-01
```

#### raw-context

浏览原始上下文仓，支持按任务或日期过滤。

```bash
# 按日期浏览
zdr raw-context --date=2026-02

# 直接按任务读取
zdr raw-context --task=TASK-20260226-RESEARCH-01
```

#### find-raw

在原始上下文仓中进行语义检索。

```bash
# 基本用法
zdr find-raw "沈阳发动机所"

# 限制结果数量
zdr find-raw "AIMBSE调研" --limit=5

# 按敏感度过滤
zdr find-raw "调研" --sensitivity=internal

# 输出 JSON 格式
zdr find-raw "调研" --format=json
```

**输出示例**：
```
✓ 找到 2 条相关原文

1. TASK-20260226-RESEARCH-01 (相关度: 0.95)
   路径: 08-RAW-CONTEXT/2026/2026-02/TASK-20260226-RESEARCH-01.md
   摘要: 沈阳发动机所 AIMBSE 调研需求，4 大方向...
   敏感度: internal

2. TASK-20260220-RESEARCH-02 (相关度: 0.72)
   路径: 08-RAW-CONTEXT/2026/2026-02/TASK-20260220-RESEARCH-02.md
   摘要: ...
```

#### verify

校验证据链完整性，检查任务是否有对应的原始上下文。

```bash
# 基本用法
zdr verify

# 只检查特定任务
zdr verify --task=TASK-20260226-RESEARCH-01

# 修复断链（自动创建占位原文）
zdr verify --fix
```

**输出示例**：
```
✓ 证据链校验完成

检查项：
- 任务总数: 5
- 有原文链接: 4
- 断链任务: 1

断链详情：
- TASK-20260220-DEV-01: 缺少原始上下文文件

建议：
运行 `zdr verify --fix` 自动创建占位原文
```

### 项目定位类

#### list-projects

列出所有项目及其元数据。

```bash
# 基本用法
zdr list-projects

# 按状态筛选
zdr list-projects --status=active

# 按优先级筛选
zdr list-projects --priority=high

# 组合筛选
zdr list-projects --status=active --priority=high

# 输出 JSON 格式
zdr list-projects --format=json
```

**输出示例**：
```
✓ 找到 5 个项目

DiveBuddy
  状态: active
  优先级: high
  技术栈: Java, Vue3, WeChat Mini Program
  仓库: /Users/lizeyu/Documents/DiveBuddy
  描述: 潜水社交平台

AIMBSE
  状态: active
  优先级: high
  技术栈: Python, LangGraph, RAG
  仓库: /Users/lizeyu/Documents/AIMBSE
  描述: AI 驱动的 MBSE 知识库
```

**详细文档**：[reference/commands.md#list-projects](reference/commands.md#list-projects)

---

#### project-info

获取单个项目的详细元数据。

```bash
# 基本用法
zdr project-info DiveBuddy

# 输出 JSON 格式
zdr project-info DiveBuddy --format=json

# 包含文档索引路径
zdr project-info DiveBuddy --include-docs-index
```

**输出示例**：
```yaml
name: DiveBuddy
status: active
priority: high
tech_stack:
  - Java
  - Vue3
  - WeChat Mini Program
repository: /Users/lizeyu/Documents/DiveBuddy
description: 潜水社交平台
tags:
  - 社交
  - 潜水
  - 小程序
created: 2025-01-15
updated: 2026-02-26
docs_index: 02-PROJECTS/DiveBuddy-docs-index.md
```

**详细文档**：[reference/commands.md#project-info](reference/commands.md#project-info)

---

#### filter-projects

按多个条件筛选项目。

```bash
# 按状态筛选
zdr filter-projects --status=active

# 按优先级筛选
zdr filter-projects --priority=high

# 按技术栈筛选
zdr filter-projects --tech=Java

# 组合筛选
zdr filter-projects --status=active --priority=high --tech=Java

# 按标签筛选
zdr filter-projects --tag=社交
```

**详细文档**：[reference/commands.md#filter-projects](reference/commands.md#filter-projects)

---

### 文档导航类

#### docs-index

读取项目的文档索引。

```bash
# 基本用法
zdr docs-index DiveBuddy

# 按类别筛选
zdr docs-index DiveBuddy --category=开发

# 按子项目筛选
zdr docs-index DiveBuddy --subproject=Wechat

# 输出 JSON 格式
zdr docs-index DiveBuddy --format=json
```

**输出示例**：
```
DiveBuddy 文档索引

核心文档（按重要性排序）：
1. .hidden/CLAUDE.md - 开发规范
2. DiveBuddyWechat/ARCHITECTUREForWechat.md - 架构设计
3. DiveBuddyWechat/tasks.md - 当前任务
4. PROMPT_FOR_P0_FIX.md - P0 修复指南

子项目文档：
- Wechat: 小程序前端（5 个文档）
- AdminBackEnd: 管理后台（3 个文档）
- AIService: AI 服务（4 个文档）

按场景分类：
- 开发: 3 个文档
- 测试: 2 个文档
- 部署: 2 个文档
- 架构: 2 个文档
```

**详细文档**：[reference/commands.md#docs-index](reference/commands.md#docs-index)

---

#### get-doc

获取项目中的特定文档。

```bash
# 基本用法
zdr get-doc DiveBuddy CLAUDE.md

# 获取子项目文档
zdr get-doc DiveBuddy Wechat/ARCHITECTURE.md

# 输出到文件
zdr get-doc DiveBuddy CLAUDE.md --output=/tmp/claude.md

# 只显示路径（不读取内容）
zdr get-doc DiveBuddy CLAUDE.md --path-only
```

**输出示例**：
```
文档路径: /Users/lizeyu/Documents/DiveBuddy/.hidden/CLAUDE.md

--- 文档内容 ---
# DiveBuddy 开发规范

## 项目定位
潜水社交平台，支持行程发布、匹配、预订...

[文档内容...]
```

**详细文档**：[reference/commands.md#get-doc](reference/commands.md#get-doc)

---

#### list-docs

列出项目中某类文档。

```bash
# 列出所有开发相关文档
zdr list-docs DiveBuddy --category=开发

# 列出所有测试相关文档
zdr list-docs DiveBuddy --category=测试

# 列出子项目的所有文档
zdr list-docs DiveBuddy --subproject=Wechat

# 列出所有文档
zdr list-docs DiveBuddy
```

**详细文档**：[reference/commands.md#list-docs](reference/commands.md#list-docs)

---

### 语义搜索类

#### search

全库语义搜索。

```bash
# 基本用法
zdr search "权限管理"

# 限制结果数量
zdr search "权限管理" --limit=10

# 按相关度排序
zdr search "权限管理" --sort=relevance

# 输出 JSON 格式
zdr search "权限管理" --format=json

# 只显示文件路径
zdr search "权限管理" --path-only
```

**输出示例**：
```
✓ 找到 5 个相关文档

1. DiveBuddy-docs-index.md (相关度: 0.92)
   路径: 02-PROJECTS/DiveBuddy-docs-index.md
   摘要: ...权限管理模块位于 AdminBackEnd...

2. DiveBuddy.md (相关度: 0.87)
   路径: 02-PROJECTS/DiveBuddy.md
   摘要: ...管理员权限分为超级管理员、普通管理员...

3. 可复用模式.md (相关度: 0.81)
   路径: 01-CONTEXT/成功模式/可复用模式.md
   摘要: ...基于角色的权限管理（RBAC）实现...
```

**详细文档**：[reference/commands.md#search](reference/commands.md#search)

---

#### search-project

限定项目范围的语义搜索。

```bash
# 基本用法
zdr search-project "行程匹配" --project=DiveBuddy

# 限制结果数量
zdr search-project "行程匹配" --project=DiveBuddy --limit=5

# 输出 JSON 格式
zdr search-project "行程匹配" --project=DiveBuddy --format=json
```

**详细文档**：[reference/commands.md#search-project](reference/commands.md#search-project)

---

#### similar-to

查找与指定文档相似的文档。

```bash
# 基本用法
zdr similar-to 02-PROJECTS/DiveBuddy.md

# 限制结果数量
zdr similar-to 02-PROJECTS/DiveBuddy.md --limit=5

# 排除特定目录
zdr similar-to 02-PROJECTS/DiveBuddy.md --exclude=INBOX
```

**详细文档**：[reference/commands.md#similar-to](reference/commands.md#similar-to)

---

### 上下文注入类

#### context

生成富上下文（用于 Agent 派发）。

```bash
# 基本用法
zdr context DiveBuddy --task="添加收藏功能"

# 指定任务类型
zdr context DiveBuddy --task="修复登录 Bug" --type=bug

# 包含历史成功模式
zdr context DiveBuddy --task="添加收藏功能" --include-patterns

# 包含历史决策
zdr context DiveBuddy --task="添加收藏功能" --include-decisions

# 输出到文件
zdr context DiveBuddy --task="添加收藏功能" --output=/tmp/context.md
```

**输出示例**：
```markdown
# Agent 任务上下文

## 项目信息
- 名称: DiveBuddy
- 状态: active
- 优先级: high
- 技术栈: Java, Vue3, WeChat Mini Program
- 仓库: /Users/lizeyu/Documents/DiveBuddy

## 任务描述
添加收藏功能

## 核心文档
1. 开发规范: /Users/lizeyu/Documents/DiveBuddy/.hidden/CLAUDE.md
2. 架构设计: /Users/lizeyu/Documents/DiveBuddy/DiveBuddyWechat/ARCHITECTUREForWechat.md
3. 当前任务: /Users/lizeyu/Documents/DiveBuddy/DiveBuddyWechat/tasks.md

## 相关历史方案
- 可复用模式: 收藏功能的通用实现模式
- 成功案例: AIMBSE 的收藏功能实现

## 建议阅读顺序
1. 先读开发规范，了解代码风格和约束
2. 再读架构设计，了解模块划分
3. 查看当前任务，避免重复工作
4. 参考历史方案，复用成功经验
```

**详细文档**：[reference/commands.md#context](reference/commands.md#context)

---

#### cross-project

跨项目知识复用。

```bash
# 基本用法
zdr cross-project ygagentlanggraphLZY DiveBuddy --topic="RAG"

# 指定源项目的特定文档
zdr cross-project ygagentlanggraphLZY DiveBuddy --topic="RAG" --source-doc=README.md

# 输出到文件
zdr cross-project ygagentlanggraphLZY DiveBuddy --topic="RAG" --output=/tmp/cross.md
```

**输出示例**：
```markdown
# 跨项目知识复用

## 源项目: ygagentlanggraphLZY
- RAG 实现经验
- 向量数据库选型
- 检索优化策略

## 目标项目: DiveBuddy
- 可应用场景: 行程推荐、用户匹配
- 需要调整的部分: 数据模型、检索策略

## 可复用的代码/模式
1. 向量化流程
2. 检索优化
3. 结果排序

## 需要注意的差异
- 数据规模不同
- 实时性要求不同
```

**详细文档**：[reference/commands.md#cross-project](reference/commands.md#cross-project)

---

#### history

查找历史解决方案。

```bash
# 基本用法
zdr history "权限管理实现"

# 限制结果数量
zdr history "权限管理实现" --limit=5

# 只查找成功案例
zdr history "权限管理实现" --success-only

# 包含失败案例
zdr history "权限管理实现" --include-failures
```

**输出示例**：
```markdown
# 历史解决方案

## 成功案例

### 1. DiveBuddy 的权限管理实现
- 时间: 2025-12-15
- 方案: 基于角色的权限管理（RBAC）
- 关键要点:
  - 使用 Spring Security
  - 角色分为超级管理员、普通管理员、用户
  - 权限粒度到接口级别
- 验证结果: 稳定运行 2 个月，无安全问题

### 2. AIMBSE 的权限管理实现
- 时间: 2026-01-10
- 方案: 基于属性的权限管理（ABAC）
- 关键要点:
  - 更细粒度的权限控制
  - 支持动态权限策略
- 验证结果: 满足复杂权限需求

## 失败案例

### 1. Co-Todo 的权限管理尝试
- 时间: 2025-11-20
- 方案: 自定义权限系统
- 失败原因: 过于复杂，维护成本高
- 教训: 优先使用成熟框架
```

**详细文档**：[reference/commands.md#history](reference/commands.md#history)

---

## 典型场景速览（2 分钟）

### 场景 0：OpenClaw 每日 briefing（最常用）

**目标**：快速获取全局状态 → 生成每日简报

**步骤**：
1. `zdr snapshot` — 读取最新上下文快照（如果未过期直接用）
2. 如果快照过期或不存在：
   - `zdr zeyu-status` — 获取泽宇状态
   - `zdr team-status` — 获取团队负载
   - `zdr schedule` — 获取本周排期
   - `zdr decisions` — 获取待决策事项
3. 生成 `06-DASHBOARD/daily-briefing.md`
4. 更新 `07-CONTEXT-SNAPSHOT/latest.md`

**详细示例**：[reference/scenarios.md#scenario-0](reference/scenarios.md#scenario-0)

---

### 场景 1：编排层选择项目并派发 Agent

**目标**：列出活跃项目 → 获取元数据 → 生成任务上下文

**步骤**：
1. `zdr list-projects --status=active --priority=high`
2. `zdr project-info DiveBuddy`
3. `zdr context DiveBuddy --task="添加收藏功能"`

**详细示例**：[reference/scenarios.md#scenario-1](reference/scenarios.md#scenario-1)

---

### 场景 2：执行层读取开发规范

**目标**：读取文档索引 → 获取开发规范 → 开始编码

**步骤**：
1. `zdr docs-index DiveBuddy`
2. `zdr get-doc DiveBuddy CLAUDE.md`
3. 开始编码

**详细示例**：[reference/scenarios.md#scenario-2](reference/scenarios.md#scenario-2)

---

### 场景 3：查找类似问题的解决方案

**目标**：语义搜索 → 阅读相关文档 → 复用经验

**步骤**：
1. `zdr search "权限管理"`
2. `zdr get-doc DiveBuddy AdminBackEnd/权限管理.md`
3. 复用经验

**详细示例**：[reference/scenarios.md#scenario-3](reference/scenarios.md#scenario-3)

---

### 场景 4：跨项目知识复用

**目标**：从源项目搜索经验 → 应用到目标项目

**步骤**：
1. `zdr cross-project ygagentlanggraphLZY DiveBuddy --topic="RAG"`
2. 分析可复用部分
3. 应用到目标项目

**详细示例**：[reference/scenarios.md#scenario-4](reference/scenarios.md#scenario-4)

---

### 场景 5：查找历史成功模式

**目标**：搜索成功模式 → 避免失败案例 → 快速决策

**步骤**：
1. `zdr history "权限管理实现"`
2. 阅读成功案例和失败案例
3. 选择合适方案

**详细示例**：[reference/scenarios.md#scenario-5](reference/scenarios.md#scenario-5)

---

## 下一步（1 分钟）

### 查看详细文档

- **命令详解**：[reference/commands.md](reference/commands.md) - 12 个命令的完整说明
- **场景示例**：[reference/scenarios.md](reference/scenarios.md) - 5 个典型场景的完整示例
- **实现建议**：[reference/implementation.md](reference/implementation.md) - 架构设计和实现建议
- **故障排查**：[reference/troubleshooting.md](reference/troubleshooting.md) - 常见问题和解决方案
- **配置详解**：[reference/config.md](reference/config.md) - 配置文件详解
- **性能优化**：[reference/performance.md](reference/performance.md) - 性能优化建议

### 排查问题

如果命令无法正常工作：
1. 检查 Obsidian REST API 是否启动：`curl http://localhost:27123/`
2. 检查配置文件：`cat ~/.claude/skills/zeyu-docs-retrieval/config.yaml`
3. 查看详细错误：`zdr list-projects --verbose`
4. 参考故障排查指南：[reference/troubleshooting.md](reference/troubleshooting.md)

### 优化性能

如果检索速度较慢：
1. 启用缓存：在 `config.yaml` 中设置 `cache.enabled: true`
2. 调整缓存时间：设置 `cache.ttl`
3. 并行读取：使用 `--parallel` 参数
4. 参考性能优化指南：[reference/performance.md](reference/performance.md)

---

## 参考文档索引

| 文档 | 用途 | 预计阅读时间 |
|------|------|--------------|
| [commands.md](reference/commands.md) | 12 个命令的详细说明 | 15 分钟 |
| [scenarios.md](reference/scenarios.md) | 5 个典型场景的完整示例 | 20 分钟 |
| [implementation.md](reference/implementation.md) | 实现建议和架构设计 | 30 分钟 |
| [troubleshooting.md](reference/troubleshooting.md) | 故障排查指南 | 10 分钟 |
| [config.md](reference/config.md) | 配置文件详解 | 10 分钟 |
| [performance.md](reference/performance.md) | 性能优化建议 | 15 分钟 |

---

## 设计理念

本 Skill 采用**渐进披露（Progressive Disclosure）**设计理念：
- **SKILL.md**：5-10 分钟快速上手，指向详细参考文档
- **reference/*.md**：Agent 按需深入阅读

这样设计的好处：
- 快速上手：新用户 5 分钟即可开始使用
- 按需深入：有需要时再阅读详细文档
- 减少认知负担：不会一次性展示所有信息
- 提高效率：Agent 可以快速定位需要的信息

---

**最后更新**：2026-02-26
**维护者**：泽宇
**版本**：2.3.0
