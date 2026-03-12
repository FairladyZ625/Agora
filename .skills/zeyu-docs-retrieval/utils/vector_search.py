#!/usr/bin/env python3
"""
向量搜索模块

基于 Smart Connections 的预计算向量进行语义搜索
复用 test-vector-index.py 的核心逻辑
"""

import json
import numpy as np
from pathlib import Path
from typing import Optional
try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    SentenceTransformer = None  # type: ignore


class VectorSearch:
    """向量搜索引擎"""

    def __init__(
        self,
        smart_env_path: str,
        model_name: str = "TaylorAI/bge-micro-v2",
        max_vectors: int = 5000,
    ):
        """
        初始化向量搜索引擎

        Args:
            smart_env_path: Smart Connections 向量索引路径（如 .smart-env/multi）
            model_name: 嵌入模型名称
            max_vectors: 最大加载向量数量
        """
        self.smart_env_path = Path(smart_env_path)
        self.model_name = model_name
        self.max_vectors = max_vectors
        self.model: Optional[SentenceTransformer] = None
        self.vectors: list[dict] = []
        self._vectors_loaded = False

    def _load_model(self):
        """延迟加载嵌入模型"""
        if self.model is None:
            print(f"加载模型：{self.model_name}")
            self.model = SentenceTransformer(self.model_name)
            print("模型加载完成")

    def load_vectors(self, limit: Optional[int] = None) -> list[dict]:
        """
        从 .ajson 文件加载预计算向量

        .ajson 格式：每行是一个 "key": {value}, 末尾带逗号
        向量存储在 value.embeddings["TaylorAI/bge-micro-v2"]["vec"]
        文件可能有多行（重复写入），取最后一行（最新版本）

        Args:
            limit: 最大加载文件数量（None 表示使用 max_vectors）

        Returns:
            向量列表，每项包含：
            - path: 文档路径
            - vec: 向量（numpy array）
        """
        if self._vectors_loaded:
            return self.vectors

        limit = limit or self.max_vectors
        vectors = []
        all_files = list(self.smart_env_path.glob("*.ajson"))
        files = all_files[:limit]

        print(f"加载向量文件（最多 {limit} 个，共 {len(all_files)} 个）...")

        for f in files:
            try:
                content = f.read_text(encoding="utf-8")
                # 每行一个 key:value，末尾带逗号；取最后一行（最新）
                lines = [l.rstrip(",") for l in content.split("\n") if l.strip()]
                if not lines:
                    continue
                line = lines[-1]
                obj = json.loads("{" + line + "}")

                for key, val in obj.items():
                    if not isinstance(val, dict):
                        continue
                    # 向量在 embeddings["TaylorAI/bge-micro-v2"]["vec"]
                    emb = val.get("embeddings", {})
                    model_emb = emb.get("TaylorAI/bge-micro-v2", {})
                    vec = model_emb.get("vec", [])
                    if vec and len(vec) == 384:
                        path = key.replace("smart_sources:", "").replace(
                            "smart_blocks:", ""
                        )
                        vectors.append({
                            "path": path,
                            "vec": np.array(vec, dtype=np.float32),
                        })
            except Exception:
                continue

        print(f"成功加载 {len(vectors)} 个向量\n")
        self.vectors = vectors
        self._vectors_loaded = True
        return vectors

    @staticmethod
    def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
        """
        计算余弦相似度

        Args:
            a: 向量 A
            b: 向量 B

        Returns:
            余弦相似度（-1 到 1）
        """
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))

    def search(
        self, query: str, top_k: int = 8, threshold: float = 0.0
    ) -> list[tuple[float, str]]:
        """
        嵌入查询并返回 top-k 最相似文档

        Args:
            query: 查询文本
            top_k: 返回结果数量
            threshold: 相似度阈值（低于此值的结果将被过滤）

        Returns:
            结果列表，每项是 (score, path) 元组，按相似度降序排列

        Example:
            >>> searcher = VectorSearch(".smart-env/multi")
            >>> results = searcher.search("DiveBuddy 权限管理", top_k=5)
            >>> for score, path in results:
            ...     print(f"[{score:.3f}] {path}")
        """
        # 延迟加载模型和向量
        self._load_model()
        if not self._vectors_loaded:
            self.load_vectors()

        if not self.vectors:
            print("警告：未加载任何向量")
            return []

        # 嵌入查询
        if self.model is None:
            print("错误：模型未加载")
            return []
        query_vec = self.model.encode(query, normalize_embeddings=True)

        # 计算相似度
        scores = [
            (self.cosine_similarity(query_vec, v["vec"]), v["path"])
            for v in self.vectors
        ]

        # 过滤低于阈值的结果
        if threshold > 0:
            scores = [(s, p) for s, p in scores if s >= threshold]

        # 排序并返回 top-k
        scores.sort(reverse=True)
        return scores[:top_k]

    def clear_cache(self):
        """清除向量缓存（用于重新加载）"""
        self.vectors = []
        self._vectors_loaded = False
        print("向量缓存已清除")
