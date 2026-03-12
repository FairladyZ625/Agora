#!/usr/bin/env python3
"""
语义搜索命令模块

基于 Smart Connections 向量索引的语义搜索功能
"""

import sys
from pathlib import Path
from typing import Optional

# 添加父目录到 sys.path 以支持绝对导入
skill_dir = Path(__file__).parent.parent
if str(skill_dir) not in sys.path:
    sys.path.insert(0, str(skill_dir))

from utils.vector_search import VectorSearch
from utils.obsidian_api import ObsidianAPI


def search(
    config: dict, query: str, top_k: int = 5, threshold: Optional[float] = None
) -> list[dict]:
    """
    全库语义搜索

    Args:
        config: 配置字典
        query: 搜索查询
        top_k: 返回结果数量
        threshold: 相似度阈值（None 表示使用配置默认值）

    Returns:
        搜索结果列表，每项包含：
        - score: 相似度分数（0-1）
        - path: 文档路径
        - snippet: 内容片段（前 200 字符）

    Example:
        >>> results = search(config, "DiveBuddy 权限管理", top_k=5)
        >>> for r in results:
        ...     print(f"[{r['score']:.3f}] {r['path']}")
    """
    try:
        # 初始化向量搜索
        vault_path = Path(config["paths"]["vault"])
        smart_env_path = vault_path / config["vector_search"]["smart_env_path"]

        searcher = VectorSearch(
            smart_env_path=str(smart_env_path),
            model_name=config["vector_search"]["model"],
            max_vectors=config["vector_search"]["max_vectors"],
        )

        # 使用配置的默认阈值
        if threshold is None:
            threshold = config["vector_search"]["default_threshold"]

        # 执行搜索
        raw_results = searcher.search(query, top_k=top_k, threshold=threshold)

        # 格式化结果
        results = []
        api = ObsidianAPI(
            api_url=config["obsidian"]["api_url"],
            api_key=config["obsidian"]["api_key"],
            timeout=config["obsidian"]["timeout"],
        )

        for score, path in raw_results:
            try:
                # 读取文档片段
                content = api.read_note(path)
                snippet = content[:200].replace("\n", " ")
                if len(content) > 200:
                    snippet += "..."

                results.append({
                    "score": score,
                    "path": path,
                    "snippet": snippet,
                })
            except Exception as e:
                # 如果读取失败，仍然返回路径
                results.append({
                    "score": score,
                    "path": path,
                    "snippet": f"[无法读取内容: {e}]",
                })

        return results

    except Exception as e:
        print(f"错误：搜索失败：{e}")
        return []


def search_project(
    config: dict,
    query: str,
    project_name: str,
    top_k: int = 5,
    threshold: Optional[float] = None,
) -> list[dict]:
    """
    限定项目的语义搜索

    Args:
        config: 配置字典
        query: 搜索查询
        project_name: 项目名称
        top_k: 返回结果数量
        threshold: 相似度阈值

    Returns:
        搜索结果列表（格式同 search）

    Example:
        >>> results = search_project(config, "权限管理", "DiveBuddy", top_k=3)
    """
    try:
        # 先执行全库搜索（获取更多结果以便过滤）
        all_results = search(config, query, top_k=top_k * 3, threshold=threshold)

        # 过滤出项目相关的结果
        # 项目相关文档通常在：
        # 1. 02-PROJECTS/{project_name}.md
        # 2. 02-PROJECTS/{project_name}-docs-index.md
        # 3. 项目仓库路径下的文档
        filtered = []

        # 获取项目仓库路径
        from .project import project_info

        info = project_info(config, project_name)
        repo_path = info["yaml"].get("repository", "") if info else ""

        for result in all_results:
            path = result["path"]

            # 检查是否是项目相关文档
            if (
                f"02-PROJECTS/{project_name}" in path
                or (repo_path and repo_path in path)
            ):
                filtered.append(result)

            # 达到目标数量后停止
            if len(filtered) >= top_k:
                break

        return filtered

    except Exception as e:
        print(f"错误：项目搜索失败：{e}")
        return []


def similar_to(
    config: dict, doc_path: str, top_k: int = 5, threshold: Optional[float] = None
) -> list[dict]:
    """
    查找相似文档

    Args:
        config: 配置字典
        doc_path: 文档路径（相对于 vault 根目录）
        top_k: 返回结果数量
        threshold: 相似度阈值

    Returns:
        相似文档列表（格式同 search）

    Example:
        >>> similar = similar_to(config, "02-PROJECTS/DiveBuddy.md", top_k=5)
    """
    try:
        # 读取文档内容
        api = ObsidianAPI(
            api_url=config["obsidian"]["api_url"],
            api_key=config["obsidian"]["api_key"],
            timeout=config["obsidian"]["timeout"],
        )

        content = api.read_note(doc_path)

        # 提取摘要作为查询（前 500 字符）
        query = content[:500]

        # 执行搜索
        results = search(config, query, top_k=top_k + 1, threshold=threshold)

        # 过滤掉原文档本身
        filtered = [r for r in results if r["path"] != doc_path]

        return filtered[:top_k]

    except Exception as e:
        print(f"错误：查找相似文档失败：{e}")
        return []


def format_search_results_markdown(results: list[dict], title: str = "搜索结果") -> str:
    """
    将搜索结果格式化为 Markdown

    Args:
        results: 搜索结果列表
        title: 标题

    Returns:
        Markdown 格式的搜索结果
    """
    if not results:
        return "未找到结果"

    lines = [f"## {title}\n"]

    for i, r in enumerate(results, 1):
        score = r["score"]
        path = r["path"]
        snippet = r["snippet"]

        lines.append(f"### {i}. [{score:.3f}] {path}\n")
        lines.append(f"> {snippet}\n")

    return "\n".join(lines)


def search_by_tags(
    config: dict, tags: list[str], top_k: int = 10
) -> list[dict]:
    """
    根据标签搜索文档

    Args:
        config: 配置字典
        tags: 标签列表
        top_k: 返回结果数量

    Returns:
        搜索结果列表

    Example:
        >>> results = search_by_tags(config, ["权限管理", "认证"], top_k=5)
    """
    try:
        # 构建查询（组合所有标签）
        query = " ".join(tags)

        # 执行搜索
        results = search(config, query, top_k=top_k)

        return results

    except Exception as e:
        print(f"错误：标签搜索失败：{e}")
        return []


def search_context(
    config: dict, query: str, context_path: str, top_k: int = 5
) -> list[dict]:
    """
    在特定上下文目录中搜索

    Args:
        config: 配置字典
        query: 搜索查询
        context_path: 上下文目录（如 "01-CONTEXT/成功模式"）
        top_k: 返回结果数量

    Returns:
        搜索结果列表

    Example:
        >>> results = search_context(config, "行程匹配", "01-CONTEXT/成功模式", top_k=3)
    """
    try:
        # 执行全库搜索
        all_results = search(config, query, top_k=top_k * 3)

        # 过滤出指定目录下的结果
        filtered = [r for r in all_results if context_path in r["path"]]

        return filtered[:top_k]

    except Exception as e:
        print(f"错误：上下文搜索失败：{e}")
        return []
