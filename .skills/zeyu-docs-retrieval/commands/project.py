#!/usr/bin/env python3
"""
项目定位命令模块

提供基于 YAML Frontmatter 的项目快速定位功能
"""

import sys
from pathlib import Path
from typing import Optional

# 添加父目录到 sys.path 以支持绝对导入
skill_dir = Path(__file__).parent.parent
if str(skill_dir) not in sys.path:
    sys.path.insert(0, str(skill_dir))

from utils.obsidian_api import ObsidianAPI
from utils.yaml_parser import parse_yaml_frontmatter, validate_project_yaml


def list_projects(
    config: dict, status: Optional[str] = None
) -> list[dict]:
    """
    列出所有项目（基于 YAML Frontmatter）

    Args:
        config: 配置字典
        status: 可选的状态筛选（active/paused/completed/failed）

    Returns:
        项目列表，每项包含：
        - name: 项目名称
        - status: 项目状态
        - priority: 优先级
        - tech_stack: 技术栈列表
        - repository: 仓库路径
        - tags: 标签列表

    Example:
        >>> projects = list_projects(config, status="active")
        >>> for p in projects:
        ...     print(f"{p['name']}: {p['status']} - {p['priority']}")
    """
    try:
        # 初始化 API 客户端
        api = ObsidianAPI(
            api_url=config["obsidian"]["api_url"],
            api_key=config["obsidian"]["api_key"],
            timeout=config["obsidian"]["timeout"],
        )

        # 获取项目目录路径
        vault_path = Path(config["paths"]["vault"])
        projects_dir = config["paths"]["projects"]

        # 列出所有项目文件
        project_files = api.list_files(projects_dir)

        # 过滤出 .md 文件（排除 *-docs-index.md）
        project_files = [
            f
            for f in project_files
            if f.endswith(".md") and not f.endswith("-docs-index.md")
        ]

        projects = []
        for file in project_files:
            try:
                # 读取文档内容
                content = api.read_note(f"{projects_dir}/{file}")

                # 解析 YAML Frontmatter
                parsed = parse_yaml_frontmatter(content)
                yaml_data = parsed["yaml"]

                # 验证 YAML 格式
                if not validate_project_yaml(yaml_data):
                    print(f"警告：{file} 的 YAML 格式不完整，跳过")
                    continue

                # 状态筛选
                if status and yaml_data.get("status") != status:
                    continue

                # 提取项目信息
                project_name = file.replace(".md", "")
                projects.append({
                    "name": project_name,
                    "status": yaml_data.get("status", "unknown"),
                    "priority": yaml_data.get("priority", "medium"),
                    "tech_stack": yaml_data.get("tech_stack", []),
                    "repository": yaml_data.get("repository", ""),
                    "tags": yaml_data.get("tags", []),
                    "created": yaml_data.get("created", ""),
                    "updated": yaml_data.get("updated", ""),
                })
            except Exception as e:
                print(f"警告：读取 {file} 失败：{e}")
                continue

        return projects

    except Exception as e:
        print(f"错误：列出项目失败：{e}")
        return []


def project_info(config: dict, project_name: str) -> Optional[dict]:
    """
    获取项目的完整元数据

    Args:
        config: 配置字典
        project_name: 项目名称（如 "DiveBuddy"）

    Returns:
        项目元数据字典，包含：
        - yaml: 完整的 YAML Frontmatter
        - content: 文档正文内容
        - summary: 项目摘要（从正文提取）

    Example:
        >>> info = project_info(config, "DiveBuddy")
        >>> print(info["yaml"]["status"])
        'active'
        >>> print(info["summary"])
        '潜水社交平台...'
    """
    try:
        # 初始化 API 客户端
        api = ObsidianAPI(
            api_url=config["obsidian"]["api_url"],
            api_key=config["obsidian"]["api_key"],
            timeout=config["obsidian"]["timeout"],
        )

        # 构建文档路径
        projects_dir = config["paths"]["projects"]
        doc_path = f"{projects_dir}/{project_name}.md"

        # 读取文档内容
        content = api.read_note(doc_path)

        # 解析 YAML Frontmatter
        parsed = parse_yaml_frontmatter(content)

        # 提取摘要（正文第一段）
        body = parsed["content"].strip()
        lines = body.split("\n")
        summary = ""
        for line in lines:
            if line.strip() and not line.startswith("#"):
                summary = line.strip()
                break

        return {
            "name": project_name,
            "yaml": parsed["yaml"],
            "content": parsed["content"],
            "summary": summary,
        }

    except FileNotFoundError:
        print(f"错误：项目文档不存在：{project_name}")
        return None
    except Exception as e:
        print(f"错误：读取项目信息失败：{e}")
        return None


def filter_projects(config: dict, **filters) -> list[dict]:
    """
    多条件筛选项目

    Args:
        config: 配置字典
        **filters: 筛选条件，支持：
            - status: 项目状态
            - priority: 优先级
            - tags: 标签（包含任一标签即匹配）
            - tech_stack: 技术栈（包含任一技术即匹配）

    Returns:
        符合条件的项目列表

    Example:
        >>> # 查找高优先级的活跃项目
        >>> projects = filter_projects(config, status="active", priority="high")
        >>> # 查找包含 "Java" 技术栈的项目
        >>> projects = filter_projects(config, tech_stack=["Java"])
    """
    try:
        # 获取所有项目
        all_projects = list_projects(config)

        # 应用筛选条件
        filtered = []
        for project in all_projects:
            match = True

            # 状态筛选
            if "status" in filters and project["status"] != filters["status"]:
                match = False

            # 优先级筛选
            if "priority" in filters and project["priority"] != filters["priority"]:
                match = False

            # 标签筛选（包含任一标签即匹配）
            if "tags" in filters:
                filter_tags = filters["tags"]
                if isinstance(filter_tags, str):
                    filter_tags = [filter_tags]
                if not any(tag in project["tags"] for tag in filter_tags):
                    match = False

            # 技术栈筛选（包含任一技术即匹配）
            if "tech_stack" in filters:
                filter_tech = filters["tech_stack"]
                if isinstance(filter_tech, str):
                    filter_tech = [filter_tech]
                if not any(tech in project["tech_stack"] for tech in filter_tech):
                    match = False

            if match:
                filtered.append(project)

        return filtered

    except Exception as e:
        print(f"错误：筛选项目失败：{e}")
        return []


def format_projects_markdown(projects: list[dict]) -> str:
    """
    将项目列表格式化为 Markdown 表格

    Args:
        projects: 项目列表

    Returns:
        Markdown 格式的表格字符串
    """
    if not projects:
        return "未找到项目"

    # 构建表格
    lines = [
        "| 项目名称 | 状态 | 优先级 | 技术栈 | 仓库 |",
        "|---------|------|--------|--------|------|",
    ]

    for p in projects:
        tech_stack = ", ".join(p["tech_stack"][:3])  # 最多显示 3 个
        if len(p["tech_stack"]) > 3:
            tech_stack += "..."

        repo = p["repository"]
        if len(repo) > 40:
            repo = "..." + repo[-37:]

        lines.append(
            f"| {p['name']} | {p['status']} | {p['priority']} | {tech_stack} | {repo} |"
        )

    return "\n".join(lines)
