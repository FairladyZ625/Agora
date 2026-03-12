#!/usr/bin/env python3
"""
上下文注入命令模块

生成富上下文 Prompt，用于 Agent 任务派发
"""

import sys
from pathlib import Path
from typing import Optional

# 添加父目录到 sys.path 以支持绝对导入
skill_dir = Path(__file__).parent.parent
if str(skill_dir) not in sys.path:
    sys.path.insert(0, str(skill_dir))

from commands.project import project_info
from commands.docs import docs_index, get_doc
from commands.search import search, search_context


def context(
    config: dict,
    project_name: str,
    task: str,
    include_history: bool = False,
) -> str:
    """
    生成富上下文 Prompt

    Args:
        config: 配置字典
        project_name: 项目名称
        task: 任务描述
        include_history: 是否包含历史参考（语义搜索相关文档）

    Returns:
        富上下文 Prompt（Markdown 格式）

    Example:
        >>> prompt = context(config, "DiveBuddy", "实现行程匹配功能", include_history=True)
        >>> print(prompt)
        # 项目上下文：DiveBuddy
        ...
    """
    try:
        lines = [f"# 项目上下文：{project_name}\n"]

        # 1. 项目基本信息
        info = project_info(config, project_name)
        if info:
            yaml_data = info["yaml"]
            lines.append("## 项目信息\n")
            lines.append(f"- **状态**: {yaml_data.get('status', 'unknown')}")
            lines.append(f"- **优先级**: {yaml_data.get('priority', 'medium')}")
            lines.append(
                f"- **技术栈**: {', '.join(yaml_data.get('tech_stack', []))}"
            )
            lines.append(f"- **仓库路径**: {yaml_data.get('repository', '')}")
            lines.append(f"\n**项目摘要**: {info['summary']}\n")

        # 2. 核心文档路径
        index = docs_index(config, project_name)
        if index:
            lines.append("## 核心文档\n")
            for doc in index["core_docs"]:
                lines.append(f"- `{doc}`")
            lines.append("")

            # 按类别列出文档
            for category, docs in index["categories"].items():
                if docs:
                    lines.append(f"### {category}文档\n")
                    for doc in docs:
                        lines.append(f"- `{doc}`")
                    lines.append("")

        # 3. 开发规范摘要（读取 CLAUDE.md 的前 500 字符）
        claude_content = get_doc(config, project_name, "CLAUDE.md")
        if claude_content:
            lines.append("## 开发规范摘要\n")
            summary = claude_content[:500].replace("\n", "\n> ")
            lines.append(f"> {summary}...\n")

        # 4. 任务描述
        lines.append("## 当前任务\n")
        lines.append(f"{task}\n")

        # 5. 历史参考（可选）
        if include_history:
            lines.append("## 历史参考\n")

            # 搜索相关的成功模式
            success_results = search_context(
                config, task, "01-CONTEXT/成功模式", top_k=3
            )
            if success_results:
                lines.append("### 成功模式\n")
                for r in success_results:
                    lines.append(f"- [{r['score']:.3f}] {r['path']}")
                    lines.append(f"  > {r['snippet']}\n")

            # 搜索相关的失败案例
            failure_results = search_context(
                config, task, "01-CONTEXT/失败案例", top_k=2
            )
            if failure_results:
                lines.append("### 失败案例（避免重蹈覆辙）\n")
                for r in failure_results:
                    lines.append(f"- [{r['score']:.3f}] {r['path']}")
                    lines.append(f"  > {r['snippet']}\n")

        # 6. 注意事项
        lines.append("## 注意事项\n")
        lines.append("- 遵循项目的开发规范（见 CLAUDE.md）")
        lines.append("- 参考架构文档（见核心文档列表）")
        lines.append("- 完成后更新任务状态和文档")

        return "\n".join(lines)

    except Exception as e:
        print(f"错误：生成上下文失败：{e}")
        return f"# 错误\n\n生成上下文失败：{e}"


def cross_project(
    config: dict, source: str, target: str, topic: str
) -> str:
    """
    跨项目知识复用

    Args:
        config: 配置字典
        source: 源项目名称
        target: 目标项目名称
        topic: 主题（如 "权限管理"）

    Returns:
        跨项目知识复用建议（Markdown 格式）

    Example:
        >>> advice = cross_project(config, "DiveBuddy", "AIMBSE", "权限管理")
        >>> print(advice)
        # 跨项目知识复用：权限管理
        ...
    """
    try:
        lines = [f"# 跨项目知识复用：{topic}\n"]
        lines.append(f"**源项目**: {source}")
        lines.append(f"**目标项目**: {target}\n")

        # 1. 在源项目中搜索相关经验
        from .search import search_project

        source_results = search_project(config, topic, source, top_k=5)

        if source_results:
            lines.append(f"## 从 {source} 学到的经验\n")
            for r in source_results:
                lines.append(f"### [{r['score']:.3f}] {r['path']}\n")
                lines.append(f"> {r['snippet']}\n")

        # 2. 对比目标项目的现状
        target_results = search_project(config, topic, target, top_k=3)

        if target_results:
            lines.append(f"## {target} 的现状\n")
            for r in target_results:
                lines.append(f"### [{r['score']:.3f}] {r['path']}\n")
                lines.append(f"> {r['snippet']}\n")

        # 3. 生成应用建议
        lines.append("## 应用建议\n")
        lines.append(
            f"1. 参考 {source} 的实现方式（见上述文档）"
        )
        lines.append(
            f"2. 根据 {target} 的技术栈调整实现细节"
        )
        lines.append("3. 注意两个项目的架构差异")
        lines.append("4. 记录复用过程到成功模式文档")

        return "\n".join(lines)

    except Exception as e:
        print(f"错误：跨项目知识复用失败：{e}")
        return f"# 错误\n\n跨项目知识复用失败：{e}"


def history(config: dict, query: str, top_k: int = 3) -> str:
    """
    查找历史解决方案

    Args:
        config: 配置字典
        query: 查询（如 "行程匹配功能实现"）
        top_k: 返回结果数量

    Returns:
        历史解决方案摘要（Markdown 格式）

    Example:
        >>> solutions = history(config, "行程匹配功能", top_k=3)
        >>> print(solutions)
        # 历史解决方案：行程匹配功能
        ...
    """
    try:
        lines = [f"# 历史解决方案：{query}\n"]

        # 1. 搜索成功模式
        success_results = search_context(
            config, query, "01-CONTEXT/成功模式", top_k=top_k
        )

        if success_results:
            lines.append("## 成功模式\n")
            for i, r in enumerate(success_results, 1):
                lines.append(f"### {i}. [{r['score']:.3f}] {r['path']}\n")
                lines.append(f"> {r['snippet']}\n")

                # 读取完整内容（可选）
                try:
                    from ..utils.obsidian_api import ObsidianAPI

                    api = ObsidianAPI(
                        api_url=config["obsidian"]["api_url"],
                        api_key=config["obsidian"]["api_key"],
                        timeout=config["obsidian"]["timeout"],
                    )
                    content = api.read_note(r["path"])

                    # 提取关键要点（查找 "关键要点" 或 "要点" 部分）
                    if "关键要点" in content or "要点" in content:
                        lines.append("**关键要点**:\n")
                        # 简单提取（实际可以更复杂）
                        key_points = content.split("关键要点")[-1][:300]
                        lines.append(f"> {key_points}...\n")
                except Exception:
                    pass

        # 2. 搜索失败案例
        failure_results = search_context(
            config, query, "01-CONTEXT/失败案例", top_k=top_k
        )

        if failure_results:
            lines.append("## 失败案例（避免重蹈覆辙）\n")
            for i, r in enumerate(failure_results, 1):
                lines.append(f"### {i}. [{r['score']:.3f}] {r['path']}\n")
                lines.append(f"> {r['snippet']}\n")

        # 3. 搜索决策记录
        decision_results = search_context(
            config, query, "01-CONTEXT/决策", top_k=top_k
        )

        if decision_results:
            lines.append("## 相关决策\n")
            for i, r in enumerate(decision_results, 1):
                lines.append(f"### {i}. [{r['score']:.3f}] {r['path']}\n")
                lines.append(f"> {r['snippet']}\n")

        # 4. 总结
        if not success_results and not failure_results and not decision_results:
            lines.append("未找到相关历史记录。这可能是一个新问题。\n")
        else:
            lines.append("## 建议\n")
            lines.append("- 优先参考成功模式中的实现方式")
            lines.append("- 避免失败案例中提到的陷阱")
            lines.append("- 遵循相关决策记录中的指导原则")

        return "\n".join(lines)

    except Exception as e:
        print(f"错误：查找历史解决方案失败：{e}")
        return f"# 错误\n\n查找历史解决方案失败：{e}"


def customer_context(config: dict, customer_name: str) -> str:
    """
    获取客户上下文

    Args:
        config: 配置字典
        customer_name: 客户名称

    Returns:
        客户上下文（Markdown 格式）

    Example:
        >>> ctx = customer_context(config, "客户X")
        >>> print(ctx)
        # 客户上下文：客户X
        ...
    """
    try:
        from ..utils.obsidian_api import ObsidianAPI

        api = ObsidianAPI(
            api_url=config["obsidian"]["api_url"],
            api_key=config["obsidian"]["api_key"],
            timeout=config["obsidian"]["timeout"],
        )

        # 读取客户文档
        context_dir = config["paths"]["context"]
        customer_path = f"{context_dir}/客户/{customer_name}.md"

        content = api.read_note(customer_path)

        lines = [f"# 客户上下文：{customer_name}\n"]
        lines.append(content)

        return "\n".join(lines)

    except FileNotFoundError:
        return f"# 错误\n\n客户文档不存在：{customer_name}"
    except Exception as e:
        print(f"错误：读取客户上下文失败：{e}")
        return f"# 错误\n\n读取客户上下文失败：{e}"


def decision_context(config: dict, topic: str) -> str:
    """
    获取决策上下文

    Args:
        config: 配置字典
        topic: 决策主题

    Returns:
        决策上下文（Markdown 格式）

    Example:
        >>> ctx = decision_context(config, "数据库选型")
        >>> print(ctx)
        # 决策上下文：数据库选型
        ...
    """
    try:
        lines = [f"# 决策上下文：{topic}\n"]

        # 搜索相关决策
        decision_results = search_context(
            config, topic, "01-CONTEXT/决策", top_k=5
        )

        if decision_results:
            lines.append("## 相关决策记录\n")
            for r in decision_results:
                lines.append(f"### [{r['score']:.3f}] {r['path']}\n")
                lines.append(f"> {r['snippet']}\n")
        else:
            lines.append("未找到相关决策记录。\n")

        return "\n".join(lines)

    except Exception as e:
        print(f"错误：获取决策上下文失败：{e}")
        return f"# 错误\n\n获取决策上下文失败：{e}"
