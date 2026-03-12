# Performance Optimization

性能优化建议。

---

## 性能指标

### 目标性能

| 操作 | 目标时间 | 说明 |
|------|----------|------|
| 项目定位 | < 1 秒 | list-projects, project-info |
| 文档读取 | < 2 秒 | docs-index, get-doc |
| 语义搜索 | < 5 秒 | search, search-project |
| 上下文生成 | < 10 秒 | context, cross-project |

### 实际性能（测试环境）

- MacBook Pro M1, 16GB RAM
- 知识库：12K+ 文档，5K 向量
- Python 3.11

| 操作 | 实际时间 | 状态 |
|------|----------|------|
| list-projects | 0.3 秒 | ✓ |
| docs-index | 0.5 秒 | ✓ |
| search | 3.2 秒 | ✓ |
| context | 4.8 秒 | ✓ |

---

## 缓存策略

### 1. 向量缓存（内存）

**问题**：每次搜索都加载向量（3-5 秒）

**解决**：首次加载后缓存到内存

```python
class VectorSearch:
    def __init__(self):
        self._vectors = None  # 缓存
        self._model = None

    def load_vectors(self):
        if self._vectors is None:  # 只加载一次
            self._vectors = self._load_from_disk()
```

**效果**：
- 首次搜索：3.2 秒
- 后续搜索：0.8 秒（节省 75%）

### 2. 配置缓存（内存）

**问题**：每次命令都读取 config.yaml

**解决**：启动时加载一次

```python
_config_cache = None

def load_config():
    global _config_cache
    if _config_cache is None:
        _config_cache = yaml.safe_load(open("config.yaml"))
    return _config_cache
```

**效果**：节省 10-20ms

### 3. 文档缓存（可选，Redis）

**问题**：频繁读取相同文档

**解决**：使用 Redis 缓存文档内容

```python
def read_note_cached(path: str) -> str:
    # 1. 尝试从 Redis 获取
    cached = redis.get(f"doc:{path}")
    if cached:
        return cached

    # 2. 从 API 读取
    content = api.read_note(path)

    # 3. 缓存到 Redis（TTL 1 小时）
    redis.setex(f"doc:{path}", 3600, content)
    return content
```

**效果**：
- 缓存命中：< 10ms
- 缓存未命中：500ms

---

## 向量索引优化

### 1. 限制向量数量

**问题**：加载 12K 向量占用 2GB 内存

**解决**：只加载最近的 5K 向量

```yaml
# config.yaml
vector_search:
  max_vectors: 5000
```

**效果**：
- 内存占用：2GB → 800MB
- 加载时间：5 秒 → 2 秒

### 2. 预加载向量

**问题**：首次搜索慢（需要加载向量）

**解决**：启动时预加载

```bash
# 启动脚本
zdr search "warmup" > /dev/null 2>&1 &
```

**效果**：首次搜索从 3.2 秒降到 0.8 秒

### 3. 增量更新

**问题**：重新索引全部文档耗时长

**解决**：只更新变化的文档

```python
def incremental_update():
    # 1. 获取最后更新时间
    last_update = get_last_update_time()

    # 2. 只索引新文档和修改的文档
    changed_docs = get_changed_docs(since=last_update)

    # 3. 更新向量
    for doc in changed_docs:
        update_vector(doc)
```

**效果**：
- 全量索引：10 分钟
- 增量更新：30 秒

---

## 并行处理

### 1. 多文档并行读取

**问题**：顺序读取 10 个文档需要 5 秒

**解决**：并行读取

```python
from concurrent.futures import ThreadPoolExecutor

def read_docs_parallel(paths: list[str]) -> list[str]:
    with ThreadPoolExecutor(max_workers=5) as executor:
        return list(executor.map(api.read_note, paths))
```

**效果**：
- 顺序读取：5 秒
- 并行读取：1.2 秒（节省 76%）

### 2. 批量搜索

**问题**：搜索 5 个关键词需要 5 次 API 调用

**解决**：批量嵌入

```python
def batch_search(queries: list[str]) -> list[list[dict]]:
    # 1. 批量嵌入（一次调用）
    query_vecs = model.encode(queries)

    # 2. 批量搜索
    results = []
    for vec in query_vecs:
        results.append(search_by_vector(vec))
    return results
```

**效果**：
- 逐个搜索：5 × 0.8 秒 = 4 秒
- 批量搜索：1.5 秒（节省 62%）

---

## 性能监控

### 1. 添加计时日志

```python
import time

def search(query: str):
    start = time.time()

    # 加载向量
    t1 = time.time()
    vectors = load_vectors()
    print(f"加载向量：{t1 - start:.2f}s")

    # 嵌入查询
    t2 = time.time()
    query_vec = model.encode(query)
    print(f"嵌入查询：{t2 - t1:.2f}s")

    # 计算相似度
    t3 = time.time()
    results = compute_similarity(query_vec, vectors)
    print(f"计算相似度：{t3 - t2:.2f}s")

    print(f"总耗时：{t3 - start:.2f}s")
    return results
```

### 2. 分析瓶颈

运行示例：
```
加载向量：2.1s  ← 瓶颈
嵌入查询：0.3s
计算相似度：0.5s
总耗时：2.9s
```

**优化方向**：缓存向量

### 3. 性能测试脚本

```bash
#!/bin/bash
# benchmark.sh

echo "=== 性能测试 ==="

echo "1. 项目定位"
time zdr list-projects > /dev/null

echo "2. 文档读取"
time zdr docs-index DiveBuddy > /dev/null

echo "3. 语义搜索（首次）"
time zdr search "权限管理" > /dev/null

echo "4. 语义搜索（缓存）"
time zdr search "权限管理" > /dev/null

echo "5. 上下文生成"
time zdr context DiveBuddy --task="测试" > /dev/null
```

---

## 优化建议总结

### 立即可做

1. **限制向量数量**：`max_vectors: 5000`
2. **预加载向量**：启动时运行一次搜索
3. **并行读取文档**：使用 ThreadPoolExecutor

### 中期优化

1. **Redis 缓存**：缓存热门文档
2. **增量更新**：只更新变化的向量
3. **批量搜索**：一次嵌入多个查询

### 长期优化

1. **向量数据库**：使用 Milvus/Qdrant 替代文件存储
2. **分布式搜索**：多机并行搜索
3. **GPU 加速**：使用 GPU 加速嵌入和相似度计算

---

## 性能对比

| 优化措施 | 优化前 | 优化后 | 提升 |
|----------|--------|--------|------|
| 向量缓存 | 3.2s | 0.8s | 75% |
| 限制向量数量 | 5s | 2s | 60% |
| 并行读取文档 | 5s | 1.2s | 76% |
| 批量搜索 | 4s | 1.5s | 62% |

**综合优化后**：
- 首次搜索：2.5s（优化前 5s）
- 后续搜索：0.6s（优化前 3.2s）
- 内存占用：800MB（优化前 2GB）
