#!/usr/bin/env python3
"""
生成 zeyu-docs-retrieval 的参考文档
"""

import os

# 基础路径
BASE_DIR = os.path.expanduser("~/.claude/skills/zeyu-docs-retrieval/reference")

# commands.md 内容
COMMANDS_MD = """# Commands Reference

Complete reference for all zeyu-docs-retrieval commands.

---

## list-projects

### 功能
列出所有项目的基本信息（名称、状态、优先级、技术栈）

### 用法
```bash
zdr list-projects [--format FORMAT]
```

### 参数
| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| --format | string | 否 | table | 输出格式：table/json/yaml |

### 输出格式
Markdown 表格（默认）或 JSON/YAML

### 示例

#### 示例 1：基本用法（表格输出）
```bash
zdr list-projects
```

**输出**：
```
| 项目名 | 状态 | 优先级 | 技术栈 | 仓库路径 |
|--------|------|--------|--------|----------|
| DiveBuddy | active | high | Java, Vue3, MySQL | /path/to/DiveBuddy |
| AIMBSE | active | high | Python, FastAPI | /path/to/AIMBSE |
| Co-Todo | paused | medium | TypeScript, React | /path/to/Co-Todo |
```

#### 示例 2：JSON 输出
```bash
zdr list-projects --format json
```

**输出**:
```json
[
  {
    "name": "DiveBuddy",
    "status": "active",
    "priority": "high",
    "tech_stack": ["Java", "Vue3", "MySQL"],
    "repository": "/Users/lizeyu/Documents/DiveBuddy"
  },
  {
    "name": "AIMBSE",
    "status": "active",
    "priority": "high",
    "tech_stack": ["Python", "FastAPI", "PostgreSQL"],
    "repository": "/Users/lizeyu/Documents/AIMBSE"
  }
]
```

[PLACEHOLDER_CONTINUE]
"""

def write_file(filename, content):
    """写入文件"""
    filepath = os.path.join(BASE_DIR, filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"✓ 已生成: {filepath}")

if __name__ == "__main__":
    # 生成 commands.md
    write_file("commands.md", COMMANDS_MD)
    print("文档生成完成！")
