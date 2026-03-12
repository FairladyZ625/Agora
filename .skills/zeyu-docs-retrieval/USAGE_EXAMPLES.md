# zeyu-docs-retrieval 使用示例

本文档展示如何在 Python 代码中使用 zeyu-docs-retrieval 的命令模块。

## 基本设置

```python
import yaml
from pathlib import Path

# 加载配置
config_path = Path.home() / ".claude/skills/zeyu-docs-retrieval/config.yaml"
with open(config_path, 'r', encoding='utf-8') as f:
    config = yaml.safe_load(f)
```

## 1. 项目定位（project 模块）

### 列出所有项目

```python
from commands.project import list_projects, format_projects_markdown

# 列出所有项目
projects = list_projects(config)
print(f"找到 {len(projects)} 个项目")

# 格式化为 Markdown 表格
markdown = format_projects_markdown(projects)
print(markdown)
```

### 筛选活跃项目

```python
from commands.project import list_projects

# 只列出活跃项目
active_projects = list_projects(config, status="active")
for p in active_projects:
    print(f"{p['name']}: {p['priority']} - {', '.join(p['tech_stack'][:3])}")
```

### 多条件筛选

```python
from commands.project import filter_projects

# 查找高优先级的 Java 项目
java_projects = filter_projects(
    config,
    priority="high",
    tech_stack=["Java"]
)

for p in java_projects:
    print(f"{p['name']}: {p['repository']}")
```

### 获取项目详细信息

```python
from commands.project import project_info

# 获取 DiveBuddy 的详细信息
info = project_info(config, "DiveBuddy")
if info:
    print(f"项目：{info['name']}")
    print(f"状态：{info['yaml']['status']}")
    print(f"摘要：{info['summary']}")
```

## 2. 文档索引（docs 模块）

### 获取项目文档索引

```python
from commands.docs import docs_index

# 获取 DiveBuddy 的文档索引
index = docs_index(config, "DiveBuddy")
if index:
    print("核心文档：")
    for doc in index['core_docs']:
        print(f"  - {doc}")
    
    print("\n架构文档：")
    for doc in index['categories']['架构']:
        print(f"  - {doc}")
```

### 读取特定类型的文档

```python
from commands.docs import get_doc

# 读取 CLAUDE.md
content = get_doc(config, "DiveBuddy", "CLAUDE.md")
if content:
    print(content[:500])  # 打印前 500 字符
```

### 列出所有文档

```python
from commands.docs import list_docs, format_docs_markdown

# 列出所有架构文档
arch_docs = list_docs(config, "DiveBuddy", category="架构")
markdown = format_docs_markdown(arch_docs, title="DiveBuddy 架构文档")
print(markdown)
```

### 按模式查找文档

```python
from commands.docs import get_doc_by_pattern

# 查找所有 ARCHITECTURE 开头的文档
arch_docs = get_doc_by_pattern(config, "DiveBuddy", "ARCHITECTURE*")
for doc in arch_docs:
    print(doc)
```

## 3. 语义搜索（search 模块）

### 全库搜索

```python
from commands.search import search, format_search_results_markdown

# 搜索"权限管理"相关文档
results = search(config, "权限管理", top_k=5)

# 格式化输出
markdown = format_search_results_markdown(results, title="权限管理相关文档")
print(markdown)
```

### 限定项目搜索

```python
from commands.search import search_project

# 在 DiveBuddy 项目中搜索
results = search_project(config, "权限管理", "DiveBuddy", top_k=3)
for r in results:
    print(f"[{r['score']:.3f}] {r['path']}")
    print(f"  {r['snippet']}\n")
```

### 查找相似文档

```python
from commands.search import similar_to

# 查找与 DiveBuddy.md 相似的文档
similar = similar_to(config, "02-PROJECTS/DiveBuddy.md", top_k=5)
for r in similar:
    print(f"[{r['score']:.3f}] {r['path']}")
```

### 按标签搜索

```python
from commands.search import search_by_tags

# 搜索包含"权限管理"和"认证"的文档
results = search_by_tags(config, ["权限管理", "认证"], top_k=5)
for r in results:
    print(f"[{r['score']:.3f}] {r['path']}")
```

### 在特定上下文中搜索

```python
from commands.search import search_context

# 在成功模式中搜索
results = search_context(
    config,
    "行程匹配",
    "01-CONTEXT/成功模式",
    top_k=3
)
for r in results:
    print(f"[{r['score']:.3f}] {r['path']}")
```

## 4. 上下文注入（context 模块）

### 生成富上下文 Prompt

```python
from commands.context import context

# 为 DiveBuddy 生成上下文
prompt = context(
    config,
    project_name="DiveBuddy",
    task="实现行程匹配功能",
    include_history=True  # 包含历史参考
)

print(prompt)
# 输出：
# # 项目上下文：DiveBuddy
# 
# ## 项目信息
# - **状态**: active
# - **优先级**: high
# ...
```

### 跨项目知识复用

```python
from commands.context import cross_project

# 从 DiveBuddy 复用权限管理经验到 AIMBSE
advice = cross_project(
    config,
    source="DiveBuddy",
    target="AIMBSE",
    topic="权限管理"
)

print(advice)
# 输出：
# # 跨项目知识复用：权限管理
# **源项目**: DiveBuddy
# **目标项目**: AIMBSE
# ...
```

### 查找历史解决方案

```python
from commands.context import history

# 查找"行程匹配"的历史解决方案
solutions = history(config, "行程匹配功能", top_k=3)

print(solutions)
# 输出：
# # 历史解决方案：行程匹配功能
# 
# ## 成功模式
# ### 1. [0.856] 01-CONTEXT/成功模式/行程匹配.md
# ...
```

### 获取客户上下文

```python
from commands.context import customer_context

# 获取客户 X 的上下文
ctx = customer_context(config, "客户X")
print(ctx)
```

### 获取决策上下文

```python
from commands.context import decision_context

# 获取数据库选型的决策上下文
ctx = decision_context(config, "数据库选型")
print(ctx)
```

## 5. 完整示例：Agent 任务派发

```python
import yaml
from commands.project import project_info, filter_projects
from commands.docs import docs_index
from commands.context import context

# 加载配置
with open("config.yaml", 'r', encoding='utf-8') as f:
    config = yaml.safe_load(f)

# 1. 选择合适的项目
high_priority = filter_projects(config, status="active", priority="high")
print(f"找到 {len(high_priority)} 个高优先级项目")

# 2. 获取项目信息
project_name = "DiveBuddy"
info = project_info(config, project_name)
print(f"\n项目：{info['name']}")
print(f"状态：{info['yaml']['status']}")

# 3. 获取文档索引
index = docs_index(config, project_name)
print(f"\n核心文档数量：{len(index['core_docs'])}")

# 4. 生成富上下文
task = "实现用户收藏功能"
prompt = context(config, project_name, task, include_history=True)

# 5. 派发给 Agent
print("\n=== Agent Prompt ===")
print(prompt)
```

## 6. 错误处理

```python
from commands.project import project_info

try:
    info = project_info(config, "NonExistentProject")
    if info is None:
        print("项目不存在")
except FileNotFoundError as e:
    print(f"文件未找到：{e}")
except Exception as e:
    print(f"发生错误：{e}")
```

## 7. 性能优化

### 批量操作

```python
from commands.project import list_projects
from commands.docs import docs_index

# 一次性获取所有项目
projects = list_projects(config)

# 批量获取文档索引
indices = {}
for p in projects:
    try:
        indices[p['name']] = docs_index(config, p['name'])
    except Exception as e:
        print(f"获取 {p['name']} 的索引失败：{e}")
```

### 缓存结果

```python
from functools import lru_cache
from commands.project import list_projects

@lru_cache(maxsize=1)
def get_all_projects(config_hash):
    return list_projects(config)

# 使用缓存
config_hash = hash(str(config))
projects = get_all_projects(config_hash)
```

---

**提示**：更多示例请参考 [reference/scenarios.md](reference/scenarios.md)
