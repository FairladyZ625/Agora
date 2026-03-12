# Commands Reference

完整的 zeyu-docs-retrieval 命令参考手册。

---

## 目录

**项目定位类**
- [list-projects](#list-projects) - 列出所有项目
- [project-info](#project-info) - 获取项目详细信息
- [filter-projects](#filter-projects) - 按条件筛选项目

**文档导航类**
- [docs-index](#docs-index) - 读取项目文档索引
- [get-doc](#get-doc) - 获取特定文档内容
- [list-docs](#list-docs) - 列出项目所有文档

**语义搜索类**
- [search](#search) - 全库语义搜索
- [search-project](#search-project) - 限定项目搜索
- [similar-to](#similar-to) - 查找相似文档

**上下文注入类**
- [context](#context) - 生成富上下文 Prompt
- [cross-project](#cross-project) - 跨项目知识复用
- [history](#history) - 查找历史解决方案

---

## 项目定位类命令

### list-projects

列出所有项目的基本信息（名称、状态、优先级、技术栈）。

**用法**
```bash
zdr list-projects [--status STATUS] [--priority PRIORITY]
```

**参数**
| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| --status | string | 否 | - | 按状态筛选（active/paused/completed） |
| --priority | string | 否 | - | 按优先级筛选（high/medium/low） |

**输出格式**
Markdown 表格

**示例 1：列出所有项目**
```bash
zdr list-projects
```

输出：
```
找到 5 个项目

| 项目名 | 状态 | 优先级 | 技术栈 | 仓库路径 |
|--------|------|--------|--------|----------|
| DiveBuddy | active | high | Java, Vue3, MySQL | /path/to/DiveBuddy |
| AIMBSE | active | high | Python, FastAPI | /path/to/AIMBSE |
| Co-Todo | paused | medium | Swift, SwiftUI | /path/to/Co-Todo |
| MbseCopilot | active | high | Python, LangGraph | /path/to/MbseCopilot |
| ygagentlanggraphLZY | active | high | Python, LangGraph | /path/to/ygagentlanggraphLZY |
```

**示例 2：只列出活跃项目**
```bash
zdr list-projects --status=active
```

**示例 3：列出高优先级项目**
```bash
zdr list-projects --priority=high
```

**错误处理**
- 无项目文档：提示检查 02-PROJECTS/ 目录
- YAML 解析失败：提示检查 Frontmatter 格式

**相关命令**
- `project-info` - 获取单个项目的详细信息
- `filter-projects` - 更灵活的多条件筛选

---

### project-info

获取单个项目的详细元数据。

**用法**
```bash
zdr project-info <项目名>
```

**参数**
| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| 项目名 | string | 是 | - | 项目名称（如 DiveBuddy） |

**输出格式**
Markdown 格式的详细信息

**示例**
```bash
zdr project-info DiveBuddy
```

输出：
```markdown
# DiveBuddy

**状态**: active
**优先级**: high
**创建时间**: 2024-01-15
**更新时间**: 2026-02-26

**技术栈**:
- Java 17
- Vue 3
- MySQL 8.0
- Redis

**仓库路径**: /Users/lizeyu/Documents/DiveBuddy

**标签**: #潜水社交 #微信小程序 #Java后端

**描述**:
潜水爱好者社交平台，包含微信小程序、管理后台和 AI 服务。

**相关文档**:
- 文档索引: 02-PROJECTS/DiveBuddy-docs-index.md
- 架构文档: DiveBuddyWechat/ARCHITECTUREForWechat.md
```

**错误处理**
- 项目不存在：提示可用项目列表
- 文档读取失败：提示检查文件权限

**相关命令**
- `docs-index` - 查看项目的文档索引
- `list-projects` - 列出所有项目

---

### filter-projects

按多个条件筛选项目。

**用法**
```bash
zdr filter-projects [--status STATUS] [--priority PRIORITY] [--tags TAGS] [--tech TECH]
```

**参数**
| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| --status | string | 否 | - | 状态（active/paused/completed） |
| --priority | string | 否 | - | 优先级（high/medium/low） |
| --tags | string | 否 | - | 标签（逗号分隔） |
| --tech | string | 否 | - | 技术栈（逗号分隔） |

**输出格式**
Markdown 表格

**示例 1：活跃的高优先级项目**
```bash
zdr filter-projects --status=active --priority=high
```

**示例 2：包含 Python 的项目**
```bash
zdr filter-projects --tech=Python
```

**示例 3：多标签筛选**
```bash
zdr filter-projects --tags="微信小程序,Java后端"
```

**错误处理**
- 无匹配项目：提示调整筛选条件
- 参数格式错误：显示正确格式

**相关命令**
- `list-projects` - 简单的状态/优先级筛选
- `project-info` - 查看单个项目详情

---

## 文档导航类命令

### docs-index

读取项目的文档索引，列出所有核心文档的路径。

**用法**
```bash
zdr docs-index <项目名>
```

**参数**
| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| 项目名 | string | 是 | - | 项目名称（如 DiveBuddy） |

**输出格式**
Markdown 格式的文档索引

**示例**
```bash
zdr docs-index DiveBuddy
```

输出：
```markdown
# DiveBuddy 文档索引

## 核心文档（按重要性排序）

1. **.hidden/CLAUDE.md** - 开发规范和 Agent 指令
2. **DiveBuddyWechat/ARCHITECTUREForWechat.md** - 微信小程序架构
3. **DiveBuddyWechat/tasks.md** - 当前任务列表
4. **PROMPT_FOR_P0_FIX.md** - P0 级 Bug 修复指南

## 按子项目分类

### DiveBuddyWechat（微信小程序）
- ARCHITECTUREForWechat.md - 架构设计
- MOCK_TEST_GUIDE.md - 测试指南
- tasks.md - 任务列表

### DiveBuddyAdminBackEnd（管理后台）
- README.md - 项目说明

### AIService（AI 服务）
- .agent/workflows/divebuddy-ai-dev-guide.md - 开发指南
```

**错误处理**
- 文档索引不存在：提示创建 `{项目名}-docs-index.md`
- 项目不存在：提示可用项目列表

**相关命令**
- `get-doc` - 获取特定文档内容
- `list-docs` - 按类别列出文档

---

### get-doc

获取项目中特定文档的内容。

**用法**
```bash
zdr get-doc <项目名> <文档类型>
```

**参数**
| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| 项目名 | string | 是 | - | 项目名称 |
| 文档类型 | string | 是 | - | 文档类型（CLAUDE.md/ARCHITECTURE/tasks.md） |

**输出格式**
文档的完整内容（Markdown）

**示例 1：获取开发规范**
```bash
zdr get-doc DiveBuddy CLAUDE.md
```

**示例 2：获取架构文档**
```bash
zdr get-doc DiveBuddy ARCHITECTURE
```

**示例 3：获取任务列表**
```bash
zdr get-doc DiveBuddy tasks.md
```

**错误处理**
- 文档不存在：提示可用文档类型
- 文档索引缺失：提示先运行 `docs-index`

**相关命令**
- `docs-index` - 查看所有可用文档
- `list-docs` - 按类别列出文档

---

### list-docs

列出项目的所有文档，可按类别筛选。

**用法**
```bash
zdr list-docs <项目名> [--category CATEGORY]
```

**参数**
| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| 项目名 | string | 是 | - | 项目名称 |
| --category | string | 否 | - | 类别（开发/测试/部署/架构） |

**输出格式**
Markdown 列表

**示例 1：列出所有文档**
```bash
zdr list-docs DiveBuddy
```

**示例 2：只列出开发相关文档**
```bash
zdr list-docs DiveBuddy --category=开发
```

**错误处理**
- 项目不存在：提示可用项目
- 类别不存在：提示可用类别

**相关命令**
- `docs-index` - 查看文档索引
- `get-doc` - 获取文档内容

---

## 语义搜索类命令

### search

在整个知识库中进行语义搜索。

**用法**
```bash
zdr search "<查询>" [--top-k N] [--threshold SCORE]
```

**参数**
| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| 查询 | string | 是 | - | 搜索查询（中文或英文） |
| --top-k | int | 否 | 5 | 返回结果数量 |
| --threshold | float | 否 | 0.7 | 相似度阈值（0-1） |

**输出格式**
Markdown 格式的搜索结果（带相似度分数）

**示例 1：基本搜索**
```bash
zdr search "DiveBuddy 权限管理"
```

输出：
```markdown
找到 5 个相关文档（相似度 > 0.70）

1. [0.89] 02-PROJECTS/DiveBuddy.md
   潜水爱好者社交平台，包含微信小程序、管理后台和 AI 服务...

2. [0.85] DiveBuddy/.hidden/CLAUDE.md
   # DiveBuddy 开发规范
   权限管理采用 RBAC 模型...

3. [0.78] 01-CONTEXT/成功模式/权限管理最佳实践.md
   基于角色的权限控制（RBAC）实现...
```

**示例 2：增加结果数量**
```bash
zdr search "RAG 向量检索" --top-k=10
```

**示例 3：提高相似度阈值**
```bash
zdr search "微信小程序开发" --threshold=0.8
```

**错误处理**
- 向量索引未加载：提示检查 .smart-env/multi/ 目录
- 无搜索结果：提示调整查询或降低阈值

**相关命令**
- `search-project` - 限定项目搜索
- `similar-to` - 查找相似文档

---

### search-project

在特定项目中进行语义搜索。

**用法**
```bash
zdr search-project "<查询>" --project=<项目名> [--top-k N]
```

**参数**
| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| 查询 | string | 是 | - | 搜索查询 |
| --project | string | 是 | - | 项目名称 |
| --top-k | int | 否 | 5 | 返回结果数量 |

**输出格式**
Markdown 格式的搜索结果

**示例**
```bash
zdr search-project "行程匹配功能" --project=DiveBuddy
```

输出：
```markdown
在 DiveBuddy 中找到 3 个相关文档

1. [0.92] DiveBuddyWechat/tasks.md
   ## 行程匹配优化
   当前行程匹配算法基于地理位置和时间...

2. [0.87] DiveBuddyWechat/ARCHITECTUREForWechat.md
   ### 行程管理模块
   负责行程的创建、匹配和推荐...
```

**错误处理**
- 项目不存在：提示可用项目
- 无搜索结果：提示扩大搜索范围

**相关命令**
- `search` - 全库搜索
- `similar-to` - 查找相似文档

---

### similar-to

查找与指定文档相似的其他文档。

**用法**
```bash
zdr similar-to <文档路径> [--top-k N]
```

**参数**
| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| 文档路径 | string | 是 | - | 文档相对路径 |
| --top-k | int | 否 | 5 | 返回结果数量 |

**输出格式**
Markdown 格式的相似文档列表

**示例**
```bash
zdr similar-to 02-PROJECTS/DiveBuddy.md
```

输出：
```markdown
找到 5 个相似文档

1. [0.85] 02-PROJECTS/Co-Todo.md
   iOS 语音任务管理应用...

2. [0.78] 02-PROJECTS/AIMBSE.md
   MBSE 系统建模平台...
```

**错误处理**
- 文档不存在：提示检查路径
- 文档无向量：提示重新索引

**相关命令**
- `search` - 语义搜索
- `search-project` - 项目内搜索

---

## 上下文注入类命令

### context

为 Agent 生成富上下文 Prompt，包含项目信息、核心文档、开发规范等。

**用法**
```bash
zdr context <项目名> --task="<任务描述>" [--include-history]
```

**参数**
| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| 项目名 | string | 是 | - | 项目名称 |
| --task | string | 是 | - | 任务描述 |
| --include-history | flag | 否 | false | 包含历史参考 |

**输出格式**
结构化的 Markdown Prompt

**示例**
```bash
zdr context DiveBuddy --task="添加行程收藏功能" --include-history
```

输出：
```markdown
# Agent 任务上下文

## 项目信息
- **项目名**: DiveBuddy
- **状态**: active
- **优先级**: high
- **技术栈**: Java 17, Vue 3, MySQL 8.0
- **仓库路径**: /Users/lizeyu/Documents/DiveBuddy

## 任务描述
添加行程收藏功能

## 核心文档路径
1. .hidden/CLAUDE.md - 开发规范
2. DiveBuddyWechat/ARCHITECTUREForWechat.md - 架构设计
3. DiveBuddyWechat/tasks.md - 当前任务

## 开发规范摘要
- 使用 Java 17 + Spring Boot 3.x
- 前端使用 Vue 3 Composition API
- 数据库使用 MySQL 8.0
- 遵循 RESTful API 设计规范

## 历史参考
### 相关功能实现
1. [0.88] 01-CONTEXT/成功模式/收藏功能实现.md
   用户收藏功能采用 Redis 缓存 + MySQL 持久化...

2. [0.82] DiveBuddyWechat/tasks.md
   ## 已完成：行程点赞功能
   实现了行程点赞，可参考类似逻辑...
```

**错误处理**
- 项目不存在：提示可用项目
- 文档索引缺失：提示创建文档索引

**相关命令**
- `cross-project` - 跨项目知识复用
- `history` - 查找历史方案

---

### cross-project

从源项目搜索经验，应用到目标项目。

**用法**
```bash
zdr cross-project <源项目> <目标项目> --topic="<主题>"
```

**参数**
| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| 源项目 | string | 是 | - | 源项目名称 |
| 目标项目 | string | 是 | - | 目标项目名称 |
| --topic | string | 是 | - | 知识主题 |

**输出格式**
结构化的知识复用建议

**示例**
```bash
zdr cross-project ygagentlanggraphLZY DiveBuddy --topic="RAG 实现"
```

输出：
```markdown
# 跨项目知识复用：RAG 实现

## 源项目：ygagentlanggraphLZY
**相关经验**:
1. [0.91] ygagentlanggraphLZY/README.md
   使用 LangGraph 实现 RAG 工作流，支持多轮对话...

2. [0.87] ygagentlanggraphLZY/src/rag/vector_store.py
   向量存储使用 Chroma，嵌入模型使用 bge-large-zh...

## 目标项目：DiveBuddy
**当前状态**:
- 技术栈：Java 17, Vue 3, MySQL
- 暂无 RAG 相关实现

## 应用建议
1. **向量存储选择**
   - 源项目使用 Chroma（Python）
   - 建议 DiveBuddy 使用 Elasticsearch（Java 生态）

2. **嵌入模型**
   - 可复用 bge-large-zh 模型
   - 通过 HTTP API 调用 Python 服务

3. **工作流设计**
   - 参考 LangGraph 的多轮对话设计
   - 使用 Spring State Machine 实现类似逻辑
```

**错误处理**
- 项目不存在：提示可用项目
- 无相关经验：提示调整主题

**相关命令**
- `context` - 生成任务上下文
- `search-project` - 项目内搜索

---

### history

查找历史解决方案（成功模式、失败案例、决策记录）。

**用法**
```bash
zdr history "<问题描述>" [--top-k N]
```

**参数**
| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| 问题描述 | string | 是 | - | 问题或需求描述 |
| --top-k | int | 否 | 3 | 返回结果数量 |

**输出格式**
分类的历史案例（成功模式/失败案例/决策记录）

**示例**
```bash
zdr history "权限管理实现"
```

输出：
```markdown
# 历史解决方案：权限管理实现

## 成功模式
1. [0.92] 01-CONTEXT/成功模式/RBAC权限管理.md
   **模式名称**: 基于角色的权限控制（RBAC）
   **适用场景**: 多角色用户系统
   **实施步骤**:
   1. 定义角色（管理员、普通用户、访客）
   2. 定义权限（读、写、删除）
   3. 建立角色-权限映射表
   **验证结果**: 已在 DiveBuddy 和 AIMBSE 中成功应用

## 失败案例
1. [0.78] 01-CONTEXT/失败案例/权限缓存失效问题.md
   **问题**: 权限更新后缓存未及时刷新
   **原因**: Redis 缓存 TTL 设置过长（24 小时）
   **教训**: 权限变更时主动清除缓存，TTL 设置为 1 小时

## 决策记录
1. [0.85] 01-CONTEXT/决策/权限框架选择.md
   **决策**: 使用 Spring Security + JWT
   **理由**:
   - Spring Security 成熟稳定
   - JWT 无状态，适合微服务
   - 社区支持好，文档完善
```

**错误处理**
- 无历史记录：提示扩大搜索范围
- 上下文目录缺失：提示检查 01-CONTEXT/ 目录

**相关命令**
- `search` - 全库搜索
- `context` - 生成任务上下文

---

## 附录

### 输出格式说明

所有命令默认输出 Markdown 格式，便于 Agent 阅读和解析。

### 错误码

- 0: 成功
- 1: 一般错误（参数错误、文件不存在等）
- 2: 配置错误（config.yaml 缺失或格式错误）
- 3: API 连接失败（Obsidian REST API 不可用）

### 环境变量

- `ZDR_CONFIG_PATH`: 配置文件路径（默认：~/.claude/skills/zeyu-docs-retrieval/config.yaml）
- `ZDR_API_KEY`: Obsidian API Key（覆盖配置文件）
