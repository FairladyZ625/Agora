# Implementation Reference

zeyu-docs-retrieval Skill 的实现建议和架构设计。

---

## 目录

1. [架构设计](#架构设计)
2. [Python 脚本方案](#python-脚本方案)
3. [Bash 封装方案](#bash-封装方案)
4. [混合方案（当前实现）](#混合方案当前实现)
5. [扩展建议](#扩展建议)

---

## 架构设计

### 三合一检索方案

```
┌─────────────────────────────────────────┐
│  方案 1：YAML Frontmatter（快速定位）    │
│  └─ 用途：快速理解项目定位、状态、技术栈 │
│  └─ 场景：编排层选择项目、判断优先级     │
└─────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│  方案 2：文档索引（精确路径）            │
│  └─ 用途：明确列出核心文档路径           │
│  └─ 场景：执行层读取开发规范、架构文档   │
└─────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│  方案 3：Smart Connections（语义搜索）   │
│  └─ 用途：查找相关文档、历史解决方案     │
│  └─ 场景：跨项目知识复用、查找类似问题   │
└─────────────────────────────────────────┘
```

### 模块划分

```
zeyu-docs-retrieval/
├── zdr                    # Bash 入口脚本
├── zdr.py                 # Python 主程序（命令路由）
├── config.yaml            # 配置文件
├── requirements.txt       # Python 依赖
├── utils/                 # 工具模块
│   ├── obsidian_api.py    # Obsidian REST API 封装
│   ├── yaml_parser.py     # YAML Frontmatter 解析
│   └── vector_search.py   # Smart Connections 向量搜索
└── commands/              # 命令模块
    ├── project.py         # 项目定位命令
    ├── docs.py            # 文档导航命令
    ├── search.py          # 语义搜索命令
    └── context.py         # 上下文注入命令
```

### 数据流

```
用户命令
  │
  ▼
zdr (Bash)
  │
  ▼
zdr.py (Python)
  │
  ├─ 解析参数
  ├─ 加载配置
  └─ 路由到命令模块
      │
      ▼
commands/*.py
  │
  ├─ 调用 utils 模块
  │   ├─ obsidian_api.py → Obsidian REST API
  │   ├─ yaml_parser.py → 解析 YAML
  │   └─ vector_search.py → 向量搜索
  │
  └─ 返回 Markdown 格式结果
      │
      ▼
输出到 stdout
```

---

## Python 脚本方案

### 优点
- 灵活：可以使用丰富的 Python 库
- 可扩展：易于添加新功能
- 可维护：代码结构清晰

### 缺点
- 需要 Python 环境（3.10+）
- 启动稍慢（需要加载 Python 解释器）
- 依赖管理（需要 pip install）

### 适用场景
- 复杂的数据处理
- 需要调用外部 API
- 需要向量搜索等高级功能

---

## Bash 封装方案

### 优点
- 快速启动：无需加载 Python 解释器
- 轻量级：无需额外依赖
- 易于集成：可以直接在 Shell 脚本中调用

### 缺点
- 功能受限：难以实现复杂逻辑
- 可维护性差：Bash 脚本难以维护
- 不适合大规模数据处理

### 适用场景
- 简单的文件操作
- 调用外部命令
- 快速原型

---

## 混合方案（当前实现）

### 设计理念
- **Bash 入口**：快速启动，解析参数
- **Python 核心**：实现复杂逻辑

### 实现方式

**zdr (Bash)**
```bash
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 "$SCRIPT_DIR/zdr.py" "$@"
```

**zdr.py (Python)**
```python
def main():
    config = load_config()
    args = parse_args()
    result = route_command(args.command, args, config)
    print(result)
```

### 最佳实践

1. **配置管理**
   - 使用 YAML 配置文件
   - 支持环境变量覆盖
   - 提供默认值

2. **错误处理**
   - 友好的错误信息
   - 正确的退出码（0/1）
   - 日志记录（可选）

3. **性能优化**
   - 延迟加载（按需导入模块）
   - 缓存机制（向量索引、配置）
   - 并行处理（多文档读取）

4. **可测试性**
   - 单元测试（pytest）
   - 集成测试（端到端）
   - Mock 外部依赖

---

## 扩展建议

### 添加新命令

1. 在 `commands/` 目录创建新模块
2. 实现命令函数
3. 在 `zdr.py` 的 `COMMANDS` 表中注册
4. 添加参数解析逻辑

**示例**：添加 `export` 命令
```python
# commands/export.py
def export(config: dict, project_name: str, format: str) -> str:
    """导出项目信息"""
    # 实现逻辑
    pass

# zdr.py
COMMANDS = {
    # ...
    "export": "commands.export:export",
}
```

### 集成新数据源

1. 在 `utils/` 目录创建新模块
2. 实现数据源接口
3. 在命令模块中调用

**示例**：集成 Notion API
```python
# utils/notion_api.py
class NotionAPI:
    def read_page(self, page_id: str) -> str:
        # 实现逻辑
        pass

# commands/docs.py
from utils.notion_api import NotionAPI

def get_notion_doc(config: dict, page_id: str) -> str:
    api = NotionAPI(config["notion"]["api_key"])
    return api.read_page(page_id)
```

### 性能优化

1. **向量索引优化**
   - 限制向量数量（默认 5000）
   - 预加载向量（启动时）
   - 增量更新（只更新变化的文档）

2. **缓存策略**
   - 向量缓存（内存）
   - 文档缓存（可选，Redis）
   - 配置缓存（内存）

3. **并行处理**
   - 多文档并行读取（ThreadPoolExecutor）
   - 批量搜索（一次查询多个关键词）

**示例**：并行读取文档
```python
from concurrent.futures import ThreadPoolExecutor

def read_docs_parallel(api: ObsidianAPI, paths: list[str]) -> list[str]:
    with ThreadPoolExecutor(max_workers=5) as executor:
        return list(executor.map(api.read_note, paths))
```

---

## 总结

zeyu-docs-retrieval Skill 采用混合方案（Bash 入口 + Python 核心），兼顾了启动速度和功能丰富性。通过模块化设计，易于扩展和维护。
