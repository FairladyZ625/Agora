#!/usr/bin/env python3
"""
文档索引命令模块

提供基于文档索引的精确路径查找功能
"""

import sys
import re
from pathlib import Path
from typing import Optional

# 添加父目录到 sys.path 以支持绝对导入
skill_dir = Path(__file__).parent.parent
if str(skill_dir) not in sys.path:
    sys.path.insert(0, str(skill_dir))

from utils.obsidian_api import ObsidianAPI


def docs_index(config: dict, project_name: str) -> Optional[dict]:
    """
    读取项目的文档索引

    Args:
        config: 配置字典
        project_name: 项目名称（如 "DiveBuddy"）

    Returns:
        文档索引字典，包含：
        - core_docs: 核心文档列表（按重要性排序）
        - categories: 按类别分类的文档（开发/测试/部署/架构）
        - subprojects: 子项目文档（如果有）

    Example:
        >>> index = docs_index(config, "DiveBuddy")
        >>> print(index["core_docs"])
        ['/path/to/.hidden/CLAUDE.md', '/path/to/ARCHITECTURE.md', ...]
    """
    try:
        # 初始化 API 客户端
        api = ObsidianAPI(
            api_url=config["obsidian"]["api_url"],
            api_key=config["obsidian"]["api_key"],
            timeout=config["obsidian"]["timeout"],
        )

        # 构建文档索引路径
        projects_dir = config["paths"]["projects"]
        index_path = f"{projects_dir}/{project_name}-docs-index.md"

        # 读取文档索引
        content = api.read_note(index_path)

        # 解析文档索引
        result = {
            "core_docs": [],
            "categories": {
                "开发": [],
                "测试": [],
                "部署": [],
                "架构": [],
            },
            "subprojects": {},
        }

        # 提取所有文档路径（Markdown 链接格式）
        # 匹配 [文档名](路径) 或直接的路径
        path_pattern = r"(?:\[.*?\]\((.*?)\)|`(.*?)`|(?:^|\s)(/.+?\.md))"
        matches = re.findall(path_pattern, content, re.MULTILINE)

        for match in matches:
            # match 是元组，取第一个非空值
            path = next((m for m in match if m), None)
            if not path:
                continue

            # 跳过相对路径和 URL
            if not path.startswith("/"):
                continue

            # 判断文档类别
            if "CLAUDE.md" in path or "README" in path:
                result["core_docs"].append(path)
            elif "ARCHITECTURE" in path or "架构" in path:
                result["categories"]["架构"].append(path)
            elif "TEST" in path or "测试" in path:
                result["categories"]["测试"].append(path)
            elif "DEPLOY" in path or "部署" in path or "AI" in path:
                result["categories"]["部署"].append(path)
            else:
                result["categories"]["开发"].append(path)

        # 去重
        result["core_docs"] = list(set(result["core_docs"]))
        for category in result["categories"]:
            result["categories"][category] = list(set(result["categories"][category]))

        return result

    except FileNotFoundError:
        print(f"错误：文档索引不存在：{project_name}-docs-index.md")
        return None
    except Exception as e:
        print(f"错误：读取文档索引失败：{e}")
        return None


def get_doc(
    config: dict, project_name: str, doc_type: str
) -> Optional[str]:
    """
    根据文档类型获取文档内容

    Args:
        config: 配置字典
        project_name: 项目名称
        doc_type: 文档类型（CLAUDE.md/ARCHITECTURE/TASKS/README/API）

    Returns:
        文档内容（字符串），如果找不到返回 None

    Example:
        >>> content = get_doc(config, "DiveBuddy", "CLAUDE.md")
        >>> print(content[:100])
        '# DiveBuddy 开发规范...'
    """
    try:
        # 获取文档索引
        index = docs_index(config, project_name)
        if not index:
            return None

        # 根据文档类型查找路径
        doc_type_upper = doc_type.upper()
        target_path = None

        # 在核心文档中查找
        for path in index["core_docs"]:
            if doc_type_upper in path.upper():
                target_path = path
                break

        # 在分类文档中查找
        if not target_path:
            for category, docs in index["categories"].items():
                for path in docs:
                    if doc_type_upper in path.upper():
                        target_path = path
                        break
                if target_path:
                    break

        if not target_path:
            print(f"错误：未找到文档类型 {doc_type}")
            return None

        # 读取文档内容（直接从文件系统读取，因为路径是绝对路径）
        vault_path = Path(config["paths"]["vault"])
        full_path = Path(target_path)

        # 如果路径不是绝对路径，拼接 vault 路径
        if not full_path.is_absolute():
            full_path = vault_path / target_path.lstrip("/")

        if not full_path.exists():
            print(f"错误：文档不存在：{full_path}")
            return None

        return full_path.read_text(encoding="utf-8")

    except Exception as e:
        print(f"错误：读取文档失败：{e}")
        return None


def list_docs(
    config: dict, project_name: str, category: Optional[str] = None
) -> list[str]:
    """
    列出项目的所有文档

    Args:
        config: 配置字典
        project_name: 项目名称
        category: 可选的类别筛选（开发/测试/部署/架构）

    Returns:
        文档路径列表

    Example:
        >>> docs = list_docs(config, "DiveBuddy", category="架构")
        >>> for doc in docs:
        ...     print(doc)
        '/path/to/ARCHITECTURE.md'
    """
    try:
        # 获取文档索引
        index = docs_index(config, project_name)
        if not index:
            return []

        # 如果指定了类别，只返回该类别的文档
        if category:
            return index["categories"].get(category, [])

        # 否则返回所有文档
        all_docs = index["core_docs"].copy()
        for docs in index["categories"].values():
            all_docs.extend(docs)

        return list(set(all_docs))

    except Exception as e:
        print(f"错误：列出文档失败：{e}")
        return []


def format_docs_markdown(docs: list[str], title: str = "文档列表") -> str:
    """
    将文档列表格式化为 Markdown

    Args:
        docs: 文档路径列表
        title: 标题

    Returns:
        Markdown 格式的文档列表
    """
    if not docs:
        return "未找到文档"

    lines = [f"## {title}\n"]

    for doc in docs:
        # 提取文件名
        filename = Path(doc).name
        lines.append(f"- `{filename}`: {doc}")

    return "\n".join(lines)


def get_doc_by_pattern(
    config: dict, project_name: str, pattern: str
) -> list[str]:
    """
    根据文件名模式查找文档

    Args:
        config: 配置字典
        project_name: 项目名称
        pattern: 文件名模式（支持通配符，如 "ARCHITECTURE*"）

    Returns:
        匹配的文档路径列表

    Example:
        >>> docs = get_doc_by_pattern(config, "DiveBuddy", "ARCHITECTURE*")
        >>> print(docs)
        ['/path/to/ARCHITECTUREForWechat.md', '/path/to/ARCHITECTURE.md']
    """
    try:
        # 获取所有文档
        all_docs = list_docs(config, project_name)

        # 转换通配符为正则表达式
        regex_pattern = pattern.replace("*", ".*").replace("?", ".")
        regex = re.compile(regex_pattern, re.IGNORECASE)

        # 筛选匹配的文档
        matched = [doc for doc in all_docs if regex.search(Path(doc).name)]

        return matched

    except Exception as e:
        print(f"错误：查找文档失败：{e}")
        return []
