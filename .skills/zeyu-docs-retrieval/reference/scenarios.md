# Scenarios Reference

典型使用场景的完整示例。

---

## 目录

1. [场景 1：编排层选择项目并派发 Agent](#场景-1编排层选择项目并派发-agent)
2. [场景 2：执行层读取开发规范](#场景-2执行层读取开发规范)
3. [场景 3：查找类似问题的解决方案](#场景-3查找类似问题的解决方案)
4. [场景 4：跨项目知识复用](#场景-4跨项目知识复用)
5. [场景 5：查找历史成功模式](#场景-5查找历史成功模式)

---

## 场景 1：编排层选择项目并派发 Agent

### 背景
OpenClaw 编排层收到用户需求："为 DiveBuddy 添加行程收藏功能"。

### 步骤
1. `zdr list-projects --status=active` - 列出活跃项目
2. `zdr project-info DiveBuddy` - 获取项目元数据
3. `zdr context DiveBuddy --task="添加行程收藏功能" --include-history` - 生成富上下文
4. 派发 Agent 到独立 worktree

### 预期结果
Agent 收到完整上下文，包含项目信息、文档路径、开发规范、历史参考。

---

## 场景 2：执行层读取开发规范

### 背景
Agent 接收任务后，需要读取开发规范和架构文档。

### 步骤
1. `zdr docs-index DiveBuddy` - 读取文档索引
2. `zdr get-doc DiveBuddy CLAUDE.md` - 获取开发规范
3. `zdr get-doc DiveBuddy ARCHITECTURE` - 获取架构文档

### 预期结果
Agent 了解技术栈、代码风格、目录结构、测试要求。

---

## 场景 3：查找类似问题的解决方案

### 背景
Agent 遇到问题："如何实现行程匹配功能？"

### 步骤
1. `zdr search "行程匹配功能实现"` - 全库语义搜索
2. 读取最相关的文档
3. `zdr history "推荐算法实现"` - 查找历史成功模式

### 预期结果
找到现有实现、算法流程、性能优化方案。

---

## 场景 4：跨项目知识复用

### 背景
DiveBuddy 需要实现 RAG，ygagentlanggraphLZY 已有实现。

### 步骤
1. `zdr cross-project ygagentlanggraphLZY DiveBuddy --topic="RAG 实现"` - 跨项目知识复用
2. 深入阅读源项目文档

### 预期结果
获得适配目标项目技术栈的实施建议。

---

## 场景 5：查找历史成功模式

### 背景
Agent 需要实现权限管理功能。

### 步骤
1. `zdr history "权限管理实现"` - 查找历史解决方案
2. 深入阅读成功模式文档

### 预期结果
了解成功模式、避免失败案例、参考决策记录。
