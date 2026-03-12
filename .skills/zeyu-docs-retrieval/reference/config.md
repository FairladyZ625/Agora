# Configuration Reference

配置文件详解。

---

## 配置文件结构

**位置**：`~/.claude/skills/zeyu-docs-retrieval/config.yaml`

**完整示例**：
```yaml
# Obsidian REST API 配置
obsidian:
  api_url: http://localhost:27123
  api_key: YOUR_API_KEY_HERE
  timeout: 30

# 向量搜索配置
vector_search:
  model: TaylorAI/bge-micro-v2
  smart_env_path: .smart-env/multi
  default_top_k: 5
  default_threshold: 0.7
  max_vectors: 5000

# 路径配置
paths:
  vault: /Users/lizeyu/Documents/ZeYu-AI-Brain
  projects: 02-PROJECTS
  context: 01-CONTEXT
  active_tasks: 03-ACTIVE-TASKS
```

---

## 配置项说明

### obsidian

**api_url**
- 类型：string
- 默认值：`http://localhost:27123`
- 说明：Obsidian REST API 地址

**api_key**
- 类型：string
- 必需：是
- 说明：Obsidian REST API 密钥
- 获取方式：Obsidian → 设置 → Local REST API → API Key

**timeout**
- 类型：int
- 默认值：30
- 单位：秒
- 说明：API 请求超时时间

### vector_search

**model**
- 类型：string
- 默认值：`TaylorAI/bge-micro-v2`
- 说明：嵌入模型名称
- 可选值：
  - `TaylorAI/bge-micro-v2`（384 维，快速）
  - `BAAI/bge-small-zh-v1.5`（512 维，平衡）
  - `BAAI/bge-large-zh-v1.5`（1024 维，精确）

**smart_env_path**
- 类型：string
- 默认值：`.smart-env/multi`
- 说明：Smart Connections 向量索引路径（相对于 vault）

**default_top_k**
- 类型：int
- 默认值：5
- 说明：默认返回结果数量

**default_threshold**
- 类型：float
- 默认值：0.7
- 范围：0.0 - 1.0
- 说明：默认相似度阈值

**max_vectors**
- 类型：int
- 默认值：5000
- 说明：最大加载向量数量（限制内存占用）

### paths

**vault**
- 类型：string
- 必需：是
- 说明：Obsidian 知识库根目录绝对路径

**projects**
- 类型：string
- 默认值：`02-PROJECTS`
- 说明：项目文档目录（相对于 vault）

**context**
- 类型：string
- 默认值：`01-CONTEXT`
- 说明：上下文目录（相对于 vault）

**active_tasks**
- 类型：string
- 默认值：`03-ACTIVE-TASKS`
- 说明：活跃任务目录（相对于 vault）

---

## 环境变量

可以使用环境变量覆盖配置文件：

**ZDR_CONFIG_PATH**
- 说明：配置文件路径
- 示例：`export ZDR_CONFIG_PATH=/path/to/config.yaml`

**ZDR_API_KEY**
- 说明：Obsidian API Key
- 示例：`export ZDR_API_KEY=your_api_key`

**ZDR_VAULT_PATH**
- 说明：知识库路径
- 示例：`export ZDR_VAULT_PATH=/path/to/vault`

---

## 高级配置

### 缓存策略

```yaml
cache:
  enabled: true
  ttl: 3600  # 秒
  max_size: 100  # MB
```

### 日志配置

```yaml
logging:
  level: INFO  # DEBUG/INFO/WARNING/ERROR
  file: /tmp/zdr.log
```

### 并发控制

```yaml
concurrency:
  max_workers: 5  # 并行读取文档的线程数
```

---

## 配置示例

### 最小配置

```yaml
obsidian:
  api_key: YOUR_API_KEY

paths:
  vault: /Users/lizeyu/Documents/ZeYu-AI-Brain
```

### 性能优化配置

```yaml
obsidian:
  api_url: http://localhost:27123
  api_key: YOUR_API_KEY
  timeout: 10  # 缩短超时

vector_search:
  model: TaylorAI/bge-micro-v2  # 使用更小的模型
  max_vectors: 3000  # 限制向量数量
  default_top_k: 3  # 减少返回结果

paths:
  vault: /Users/lizeyu/Documents/ZeYu-AI-Brain

cache:
  enabled: true
  ttl: 7200  # 2 小时缓存
```

### 高精度配置

```yaml
obsidian:
  api_url: http://localhost:27123
  api_key: YOUR_API_KEY
  timeout: 60  # 延长超时

vector_search:
  model: BAAI/bge-large-zh-v1.5  # 使用更大的模型
  max_vectors: 10000  # 加载更多向量
  default_top_k: 10  # 返回更多结果
  default_threshold: 0.6  # 降低阈值

paths:
  vault: /Users/lizeyu/Documents/ZeYu-AI-Brain
```
