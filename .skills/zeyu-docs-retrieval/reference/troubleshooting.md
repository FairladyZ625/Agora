# Troubleshooting Guide

常见问题排查指南。

---

## 目录

1. [REST API 连接失败](#rest-api-连接失败)
2. [向量搜索无结果](#向量搜索无结果)
3. [YAML 解析错误](#yaml-解析错误)
4. [性能问题](#性能问题)
5. [依赖问题](#依赖问题)

---

## REST API 连接失败

### 症状
```
错误：无法连接到 Obsidian REST API
ConnectionError: [Errno 61] Connection refused
```

### 排查步骤

1. **检查 Obsidian 是否运行**
   ```bash
   ps aux | grep Obsidian
   ```

2. **检查 REST API 插件是否启用**
   - 打开 Obsidian
   - 设置 → 第三方插件 → Local REST API
   - 确认已启用

3. **检查端口**
   ```bash
   lsof -i :27123
   ```
   应该看到 Obsidian 进程监听 27123 端口

4. **检查 API Key**
   ```bash
   # 查看配置文件
   cat ~/.claude/skills/zeyu-docs-retrieval/config.yaml
   ```
   确认 `obsidian.api_key` 正确

5. **测试连接**
   ```bash
   curl -H "Authorization: Bearer YOUR_API_KEY" \
        http://localhost:27123/vault/
   ```

### 解决方案

- **Obsidian 未运行**：启动 Obsidian
- **插件未启用**：在设置中启用 Local REST API 插件
- **端口被占用**：修改插件端口或关闭占用进程
- **API Key 错误**：重新生成 API Key 并更新 config.yaml

---

## 向量搜索无结果

### 症状
```
找到 0 个相关文档
警告：未加载任何向量
```

### 排查步骤

1. **检查向量索引目录**
   ```bash
   ls -la /Users/lizeyu/Documents/ZeYu-AI-Brain/.smart-env/multi/
   ```
   应该看到大量 `.ajson` 文件

2. **检查向量文件格式**
   ```bash
   head -1 /Users/lizeyu/Documents/ZeYu-AI-Brain/.smart-env/multi/*.ajson | head -5
   ```
   应该看到 JSON 格式的向量数据

3. **检查模型是否加载**
   ```bash
   python3 -c "from sentence_transformers import SentenceTransformer; print('OK')"
   ```

4. **测试向量搜索**
   ```bash
   cd /Users/lizeyu/Documents/ZeYu-AI-Brain
   python3 test-vector-index.py
   ```

### 解决方案

- **向量索引不存在**：
  - 打开 Obsidian
  - Smart Connections 插件 → 重新索引

- **向量文件损坏**：
  - 删除 `.smart-env/multi/` 目录
  - 重新生成索引

- **模型未安装**：
  ```bash
  pip install sentence-transformers
  ```

- **路径配置错误**：
  检查 `config.yaml` 中的 `vector_search.smart_env_path`

---

## YAML 解析错误

### 症状
```
错误：YAML 解析失败
yaml.scanner.ScannerError: mapping values are not allowed here
```

### 排查步骤

1. **检查 Frontmatter 格式**
   ```bash
   head -20 /Users/lizeyu/Documents/ZeYu-AI-Brain/02-PROJECTS/DiveBuddy.md
   ```

2. **验证 YAML 语法**
   ```bash
   python3 -c "import yaml; yaml.safe_load(open('02-PROJECTS/DiveBuddy.md').read().split('---')[1])"
   ```

### 常见错误

**错误 1：缺少分隔符**
```yaml
---
tags: [项目, Java]
status: active
# 缺少结束分隔符
```

**解决**：添加结束分隔符
```yaml
---
tags: [项目, Java]
status: active
---
```

**错误 2：缩进错误**
```yaml
---
tags:
- 项目
 - Java  # 缩进不一致
---
```

**解决**：统一缩进
```yaml
---
tags:
  - 项目
  - Java
---
```

**错误 3：特殊字符未转义**
```yaml
---
description: 这是一个: 测试  # 冒号未转义
---
```

**解决**：使用引号
```yaml
---
description: "这是一个: 测试"
---
```

---

## 性能问题

### 症状 1：向量加载慢（> 10 秒）

**原因**：向量文件过多

**解决**：
1. 限制向量数量
   ```yaml
   # config.yaml
   vector_search:
     max_vectors: 5000  # 默认 5000
   ```

2. 预加载向量（启动时）
   ```bash
   # 首次运行时加载，后续使用缓存
   zdr search "test" > /dev/null
   ```

### 症状 2：搜索响应慢（> 5 秒）

**原因**：向量计算量大

**解决**：
1. 降低 top-k
   ```bash
   zdr search "query" --top-k=3  # 默认 5
   ```

2. 提高相似度阈值
   ```bash
   zdr search "query" --threshold=0.8  # 默认 0.7
   ```

### 症状 3：内存占用高（> 2GB）

**原因**：向量全部加载到内存

**解决**：
1. 限制向量数量（见症状 1）
2. 使用更小的嵌入模型
   ```yaml
   # config.yaml
   vector_search:
     model: "TaylorAI/bge-micro-v2"  # 384 维，更小
   ```

---

## 依赖问题

### 症状 1：sentence-transformers 安装失败

**错误**：
```
ERROR: Could not build wheels for tokenizers
```

**解决**：
```bash
# macOS
brew install rust
pip install sentence-transformers

# Linux
apt-get install cargo
pip install sentence-transformers
```

### 症状 2：numpy 版本冲突

**错误**：
```
ImportError: numpy.core.multiarray failed to import
```

**解决**：
```bash
pip install --upgrade numpy
```

### 症状 3：Python 版本不兼容

**错误**：
```
SyntaxError: invalid syntax (match statement)
```

**解决**：
```bash
# 检查 Python 版本
python3 --version  # 需要 3.10+

# 升级 Python
brew install python@3.11  # macOS
```

---

## 快速诊断

运行诊断脚本：
```bash
cd ~/.claude/skills/zeyu-docs-retrieval
python3 -c "
import sys
print(f'Python: {sys.version}')

try:
    import yaml
    print('✓ yaml')
except:
    print('✗ yaml (pip install pyyaml)')

try:
    import requests
    print('✓ requests')
except:
    print('✗ requests (pip install requests)')

try:
    import numpy
    print('✓ numpy')
except:
    print('✗ numpy (pip install numpy)')

try:
    from sentence_transformers import SentenceTransformer
    print('✓ sentence-transformers')
except:
    print('✗ sentence-transformers (pip install sentence-transformers)')
"
```

预期输出：
```
Python: 3.11.x
✓ yaml
✓ requests
✓ numpy
✓ sentence-transformers
```
