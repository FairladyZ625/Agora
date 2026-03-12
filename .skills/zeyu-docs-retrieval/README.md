# zeyu-docs-retrieval

**统一文档检索接口 - 为 OpenClaw Agent 编排系统提供三合一检索方案**

## 简介

zeyu-docs-retrieval Skill 为 ZeYu AI Brain 知识库提供统一的文档检索接口，支持：

- **YAML Frontmatter 快速定位**：快速理解项目定位、状态、技术栈
- **文档索引精确导航**：获取项目仓库中核心文档的精确路径
- **Smart Connections 语义搜索**：查找相关文档、历史解决方案

### 为什么需要它？

在 OpenClaw Agent 编排系统中，编排层（Zoe/OpenClaw）需要：
1. 快速选择合适的项目
2. 为执行层 Agent 注入富上下文
3. 查找历史解决方案和成功模式
4. 跨项目复用知识

本 Skill 提供统一的检索接口，让 Agent 可以高效地获取所需信息。

### 核心功能

- **12 个命令**：覆盖项目定位、文档导航、语义搜索、上下文注入
- **三合一检索方案**：YAML Frontmatter + 文档索引 + Smart Connections
- **渐进披露设计**：5 分钟快速上手，按需深入阅读详细文档

---

## 安装

### 1. 安装 Python 依赖

```bash
cd ~/.claude/skills/zeyu-docs-retrieval
pip install -r requirements.txt
```

### 2. 配置 API Key

```bash
# 复制配置文件模板
cp config.yaml.example config.yaml

# 编辑配置文件，填入 Obsidian API Key
vim config.yaml
```

配置文件示例：

```yaml
obsidian:
  api_url: http://localhost:27123
  api_key: your-api-key-here

vault:
  path: /Users/lizeyu/Documents/ZeYu-AI-Brain
  projects_dir: 02-PROJECTS
  context_dir: 01-CONTEXT
  active_tasks_dir: 03-ACTIVE-TASKS

cache:
  enabled: true
  ttl: 3600  # 1 小时
```

### 3. 测试安装

```bash
# 测试 API 连接
./zdr list-projects

# 预期输出：
# ✓ 找到 5 个项目
# - DiveBuddy (active, high)
# - AIMBSE (active, high)
# - Co-Todo (paused, medium)
# ...
```

如果出现错误，请参考 [故障排查指南](reference/troubleshooting.md)。

---

## 快速开始

### 最常用 4 个命令

```bash
# 1. 列出所有活跃项目
zdr list-projects --status=active

# 2. 获取项目的文档索引
zdr docs-index DiveBuddy

# 3. 语义搜索全库
zdr search "权限管理"

# 4. 生成富上下文（用于 Agent 派发）
zdr context DiveBuddy --task="添加收藏功能"
```

### 更多示例

查看 [SKILL.md](SKILL.md) 了解所有 12 个命令的详细用法。

---

## 配置

### 关键配置项

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `obsidian.api_url` | Obsidian REST API 地址 | `http://localhost:27123` |
| `obsidian.api_key` | Obsidian REST API Key | 无 |
| `vault.path` | 知识库路径 | `/Users/lizeyu/Documents/ZeYu-AI-Brain` |
| `cache.enabled` | 是否启用缓存 | `true` |
| `cache.ttl` | 缓存过期时间（秒） | `3600` |

### 环境变量（可选）

```bash
# 覆盖配置文件中的 API Key
export OBSIDIAN_API_KEY=your-api-key-here

# 覆盖知识库路径
export ZEYU_VAULT_PATH=/path/to/vault
```

### 详细配置

查看 [reference/config.md](reference/config.md) 了解所有配置项。

---

## 文档

- **快速上手**：[SKILL.md](SKILL.md) - 5-10 分钟快速上手
- **命令详解**：[reference/commands.md](reference/commands.md) - 12 个命令的详细说明
- **场景示例**：[reference/scenarios.md](reference/scenarios.md) - 5 个典型场景的完整示例
- **实现建议**：[reference/implementation.md](reference/implementation.md) - 架构设计和实现建议
- **故障排查**：[reference/troubleshooting.md](reference/troubleshooting.md) - 常见问题和解决方案
- **配置详解**：[reference/config.md](reference/config.md) - 配置文件详解
- **性能优化**：[reference/performance.md](reference/performance.md) - 性能优化建议

---

## 贡献

欢迎提交 Issue 和 Pull Request！

---

## 许可证

MIT License

---

**最后更新**：2026-02-26
**维护者**：泽宇
**版本**：1.0.0
