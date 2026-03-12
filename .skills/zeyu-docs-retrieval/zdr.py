#!/usr/bin/env python3
"""
zeyu-docs-retrieval - ZeYu AI Brain 文档检索工具

统一的文档检索接口，封装三合一检索方案：
1. YAML Frontmatter（快速定位）
2. 文档索引（精确路径）
3. Smart Connections（语义搜索）

Usage:
    zdr snapshot
    zdr zeyu-status
    zdr team-status
    zdr schedule
    zdr decisions
    zdr task-source <任务ID>
    zdr raw-context [--task=<任务ID>] [--date=<YYYY|YYYY-MM|YYYY-MM-DD>] [--top-k=<数量>]
    zdr list-projects [--status=<状态>] [--priority=<优先级>]
    zdr project-info <项目名>
    zdr filter-projects [--status=<状态>] [--priority=<优先级>] [--tags=<标签>]
    zdr docs-index <项目名>
    zdr get-doc <项目名> <文档类型>
    zdr list-docs <项目名> [--category=<类别>]
    zdr search "<查询>" [--top-k=<数量>|--limit=<数量>] [--threshold=<阈值>]
    zdr search-project "<查询>" --project=<项目名> [--top-k=<数量>|--limit=<数量>]
    zdr similar-to <文档路径> [--top-k=<数量>|--limit=<数量>]
    zdr context <项目名> --task="<任务描述>" [--include-history]
    zdr cross-project <源项目> <目标项目> --topic="<主题>"
    zdr history "<问题描述>" [--top-k=<数量>]
"""

import sys
import argparse
import yaml
import importlib
from pathlib import Path
from typing import Any, Optional

# 添加当前目录到 sys.path
SKILL_DIR = Path(__file__).parent
if str(SKILL_DIR) not in sys.path:
    sys.path.insert(0, str(SKILL_DIR))


# 命令路由表
COMMANDS = {
    # OpenClaw 管家看板
    "snapshot": ("commands.dashboard", "snapshot"),
    "zeyu-status": ("commands.dashboard", "zeyu_status"),
    "team-status": ("commands.dashboard", "team_status"),
    "schedule": ("commands.dashboard", "schedule"),
    "decisions": ("commands.dashboard", "decisions"),

    # 原始上下文
    "task-source": ("commands.raw_context", "task_source"),
    "raw-context": ("commands.raw_context", "raw_context"),

    # 项目定位
    "list-projects": ("commands.project", "list_projects"),
    "project-info": ("commands.project", "project_info"),
    "filter-projects": ("commands.project", "filter_projects"),

    # 文档导航
    "docs-index": ("commands.docs", "docs_index"),
    "get-doc": ("commands.docs", "get_doc"),
    "list-docs": ("commands.docs", "list_docs"),

    # 语义搜索
    "search": ("commands.search", "search"),
    "search-project": ("commands.search", "search_project"),
    "similar-to": ("commands.search", "similar_to"),

    # 上下文注入
    "context": ("commands.context", "context"),
    "cross-project": ("commands.context", "cross_project"),
    "history": ("commands.context", "history"),
}


def load_config() -> dict:
    """
    加载配置文件

    Returns:
        配置字典

    Raises:
        FileNotFoundError: 配置文件不存在
        yaml.YAMLError: 配置文件格式错误
    """
    config_path = SKILL_DIR / "config.yaml"

    if not config_path.exists():
        print(f"错误：配置文件不存在：{config_path}", file=sys.stderr)
        print("\n请创建配置文件 config.yaml，参考模板：", file=sys.stderr)
        print("  obsidian:", file=sys.stderr)
        print("    api_url: http://localhost:27123", file=sys.stderr)
        print("    api_key: YOUR_API_KEY_HERE", file=sys.stderr)
        sys.exit(1)

    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f)
        return config
    except yaml.YAMLError as e:
        print(f"错误：配置文件格式错误：{e}", file=sys.stderr)
        sys.exit(1)


def parse_args() -> argparse.Namespace:
    """
    解析命令行参数

    Returns:
        解析后的参数对象
    """
    parser = argparse.ArgumentParser(
        description="ZeYu AI Brain 文档检索工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )

    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # 0. OpenClaw 管家看板命令
    subparsers.add_parser("snapshot", help="读取最新上下文快照")
    subparsers.add_parser("zeyu-status", help="读取李总当前状态（简报+决策+任务）")
    subparsers.add_parser("team-status", help="读取团队状态")
    subparsers.add_parser("schedule", help="读取本周排期与截止日期")
    subparsers.add_parser("decisions", help="读取待决策队列")

    task_source_parser = subparsers.add_parser("task-source", help="按任务ID读取原始上下文")
    task_source_parser.add_argument("task_id", help="任务ID，例如 TASK-20260226-RESEARCH-01")

    raw_context_parser = subparsers.add_parser("raw-context", help="浏览原始上下文目录")
    raw_context_parser.add_argument("--task", help="按任务ID读取原文")
    raw_context_parser.add_argument("--date", help="按日期过滤（YYYY 或 YYYY-MM 或 YYYY-MM-DD）")
    raw_context_parser.add_argument("--top-k", type=int, default=20, help="返回结果数量")

    # 1. list-projects
    list_projects_parser = subparsers.add_parser(
        "list-projects",
        help="列出所有项目"
    )
    list_projects_parser.add_argument(
        "--status",
        choices=["active", "paused", "completed", "failed"],
        help="按状态筛选"
    )
    list_projects_parser.add_argument(
        "--priority",
        choices=["high", "medium", "low"],
        help="按优先级筛选"
    )

    # 2. project-info
    project_info_parser = subparsers.add_parser(
        "project-info",
        help="获取项目详细信息"
    )
    project_info_parser.add_argument("project_name", help="项目名称")

    # 3. filter-projects
    filter_projects_parser = subparsers.add_parser(
        "filter-projects",
        help="多条件筛选项目"
    )
    filter_projects_parser.add_argument("--status", help="项目状态")
    filter_projects_parser.add_argument("--priority", help="优先级")
    filter_projects_parser.add_argument("--tags", help="标签（逗号分隔）")
    filter_projects_parser.add_argument("--tech-stack", help="技术栈（逗号分隔）")

    # 4. docs-index
    docs_index_parser = subparsers.add_parser(
        "docs-index",
        help="读取项目文档索引"
    )
    docs_index_parser.add_argument("project_name", help="项目名称")

    # 5. get-doc
    get_doc_parser = subparsers.add_parser(
        "get-doc",
        help="获取项目文档内容"
    )
    get_doc_parser.add_argument("project_name", help="项目名称")
    get_doc_parser.add_argument("doc_type", help="文档类型（CLAUDE.md/ARCHITECTURE/TASKS/README/API）")

    # 6. list-docs
    list_docs_parser = subparsers.add_parser(
        "list-docs",
        help="列出项目所有文档"
    )
    list_docs_parser.add_argument("project_name", help="项目名称")
    list_docs_parser.add_argument("--category", help="文档类别（开发/测试/部署/架构）")

    # 7. search
    search_parser = subparsers.add_parser(
        "search",
        help="全库语义搜索"
    )
    search_parser.add_argument("query", help="搜索查询")
    search_parser.add_argument("--top-k", type=int, default=5, help="返回结果数量")
    search_parser.add_argument("--limit", type=int, help="返回结果数量（--top-k 别名）")
    search_parser.add_argument("--threshold", type=float, help="相似度阈值")

    # 8. search-project
    search_project_parser = subparsers.add_parser(
        "search-project",
        help="限定项目的语义搜索"
    )
    search_project_parser.add_argument("query", help="搜索查询")
    search_project_parser.add_argument("--project", required=True, help="项目名称")
    search_project_parser.add_argument("--top-k", type=int, default=5, help="返回结果数量")
    search_project_parser.add_argument("--limit", type=int, help="返回结果数量（--top-k 别名）")
    search_project_parser.add_argument("--threshold", type=float, help="相似度阈值")

    # 9. similar-to
    similar_to_parser = subparsers.add_parser(
        "similar-to",
        help="查找相似文档"
    )
    similar_to_parser.add_argument("doc_path", help="文档路径")
    similar_to_parser.add_argument("--top-k", type=int, default=5, help="返回结果数量")
    similar_to_parser.add_argument("--limit", type=int, help="返回结果数量（--top-k 别名）")
    similar_to_parser.add_argument("--threshold", type=float, help="相似度阈值")

    # 10. context
    context_parser = subparsers.add_parser(
        "context",
        help="生成富上下文 Prompt"
    )
    context_parser.add_argument("project_name", help="项目名称")
    context_parser.add_argument("--task", required=True, help="任务描述")
    context_parser.add_argument("--include-history", action="store_true", help="包含历史参考")

    # 11. cross-project
    cross_project_parser = subparsers.add_parser(
        "cross-project",
        help="跨项目知识复用"
    )
    cross_project_parser.add_argument("source", help="源项目名称")
    cross_project_parser.add_argument("target", help="目标项目名称")
    cross_project_parser.add_argument("--topic", required=True, help="主题")

    # 12. history
    history_parser = subparsers.add_parser(
        "history",
        help="查找历史解决方案"
    )
    history_parser.add_argument("query", help="查询")
    history_parser.add_argument("--top-k", type=int, default=3, help="返回结果数量")

    args = parser.parse_args()

    # 如果没有指定命令，显示帮助
    if not args.command:
        parser.print_help()
        sys.exit(0)

    return args


def route_command(command: str, args: argparse.Namespace, config: dict) -> Any:
    """
    路由命令到对应的处理函数

    Args:
        command: 命令名称
        args: 命令行参数
        config: 配置字典

    Returns:
        命令执行结果

    Raises:
        ValueError: 命令不存在
        ImportError: 模块导入失败
    """
    if command not in COMMANDS:
        available = ", ".join(COMMANDS.keys())
        raise ValueError(f"未知命令：{command}\n可用命令：{available}")

    module_name, func_name = COMMANDS[command]

    try:
        # 动态导入模块
        module = importlib.import_module(module_name)
        func = getattr(module, func_name)
    except ImportError as e:
        print(f"错误：导入模块失败：{module_name}", file=sys.stderr)
        print(f"详细信息：{e}", file=sys.stderr)
        print("\n请确保已安装依赖：pip install -r requirements.txt", file=sys.stderr)
        sys.exit(1)
    except AttributeError:
        print(f"错误：函数不存在：{module_name}.{func_name}", file=sys.stderr)
        sys.exit(1)

    # 根据命令构建参数
    try:
        if command in {"snapshot", "zeyu-status", "team-status", "schedule", "decisions"}:
            return func(config)

        if command == "task-source":
            return func(config, args.task_id)

        if command == "raw-context":
            return func(config, task=args.task, date=args.date, top_k=args.top_k)

        if command == "list-projects":
            result = func(config, status=args.status)
            # 格式化输出
            from commands.project import format_projects_markdown
            return format_projects_markdown(result)

        elif command == "project-info":
            result = func(config, args.project_name)
            if result:
                return format_project_info(result)
            return "项目不存在"

        elif command == "filter-projects":
            filters = {}
            if args.status:
                filters["status"] = args.status
            if args.priority:
                filters["priority"] = args.priority
            if args.tags:
                filters["tags"] = args.tags.split(",")
            if args.tech_stack:
                filters["tech_stack"] = args.tech_stack.split(",")
            result = func(config, **filters)
            from commands.project import format_projects_markdown
            return format_projects_markdown(result)

        elif command == "docs-index":
            result = func(config, args.project_name)
            if result:
                return format_docs_index(result)
            return "文档索引不存在"

        elif command == "get-doc":
            result = func(config, args.project_name, args.doc_type)
            return result if result else "文档不存在"

        elif command == "list-docs":
            result = func(config, args.project_name, category=args.category)
            from commands.docs import format_docs_markdown
            return format_docs_markdown(result, title=f"{args.project_name} 文档列表")

        elif command == "search":
            top_k = args.limit if getattr(args, "limit", None) else args.top_k
            result = func(config, args.query, top_k=top_k, threshold=args.threshold)
            from commands.search import format_search_results_markdown
            return format_search_results_markdown(result, title=f"搜索结果：{args.query}")

        elif command == "search-project":
            top_k = args.limit if getattr(args, "limit", None) else args.top_k
            result = func(
                config,
                args.query,
                args.project,
                top_k=top_k,
                threshold=args.threshold
            )
            from commands.search import format_search_results_markdown
            return format_search_results_markdown(result, title=f"{args.project} 搜索结果：{args.query}")

        elif command == "similar-to":
            top_k = args.limit if getattr(args, "limit", None) else args.top_k
            result = func(config, args.doc_path, top_k=top_k, threshold=args.threshold)
            from commands.search import format_search_results_markdown
            return format_search_results_markdown(result, title=f"相似文档：{args.doc_path}")

        elif command == "context":
            result = func(
                config,
                args.project_name,
                args.task,
                include_history=args.include_history
            )
            return result

        elif command == "cross-project":
            result = func(config, args.source, args.target, args.topic)
            return result

        elif command == "history":
            result = func(config, args.query, top_k=args.top_k)
            return result

        else:
            return f"命令 {command} 尚未实现"

    except Exception as e:
        print(f"错误：执行命令失败：{e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


def format_project_info(info: dict) -> str:
    """格式化项目信息为 Markdown"""
    lines = [f"# 项目信息：{info['name']}\n"]

    yaml_data = info["yaml"]
    lines.append("## 元数据\n")
    lines.append(f"- **状态**: {yaml_data.get('status', 'unknown')}")
    lines.append(f"- **优先级**: {yaml_data.get('priority', 'medium')}")
    lines.append(f"- **技术栈**: {', '.join(yaml_data.get('tech_stack', []))}")
    lines.append(f"- **仓库路径**: {yaml_data.get('repository', '')}")
    lines.append(f"- **标签**: {', '.join(yaml_data.get('tags', []))}")
    lines.append(f"- **创建时间**: {yaml_data.get('created', '')}")
    lines.append(f"- **更新时间**: {yaml_data.get('updated', '')}\n")

    lines.append("## 项目摘要\n")
    lines.append(info["summary"])

    return "\n".join(lines)


def format_docs_index(index: dict) -> str:
    """格式化文档索引为 Markdown"""
    lines = ["# 文档索引\n"]

    if index["core_docs"]:
        lines.append("## 核心文档\n")
        for doc in index["core_docs"]:
            lines.append(f"- `{doc}`")
        lines.append("")

    for category, docs in index["categories"].items():
        if docs:
            lines.append(f"## {category}文档\n")
            for doc in docs:
                lines.append(f"- `{doc}`")
            lines.append("")

    if index["subprojects"]:
        lines.append("## 子项目\n")
        for subproject, docs in index["subprojects"].items():
            lines.append(f"### {subproject}\n")
            for doc in docs:
                lines.append(f"- `{doc}`")
            lines.append("")

    return "\n".join(lines)


def main():
    """主入口"""
    try:
        # 加载配置
        config = load_config()

        # 解析参数
        args = parse_args()

        # 路由命令
        result = route_command(args.command, args, config)

        # 输出结果
        print(result)

    except KeyboardInterrupt:
        print("\n操作已取消", file=sys.stderr)
        sys.exit(130)
    except Exception as e:
        print(f"错误：{e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
