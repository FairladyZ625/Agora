#!/usr/bin/env python3
"""Raw context retrieval commands."""

from pathlib import Path
from typing import List


def _raw_root(config: dict) -> Path:
    vault = Path(config["paths"]["vault"])
    return vault / "08-RAW-CONTEXT"


def task_source(config: dict, task_id: str) -> str:
    """Find and return raw-context file content for a given task id."""
    root = _raw_root(config)
    if not root.exists():
        return f"原始上下文目录不存在：{root}"

    pattern = f"{task_id}.md"
    hits: List[Path] = list(root.rglob(pattern))

    if not hits:
        return f"未找到任务原文：{task_id}"

    path = hits[0]
    content = path.read_text(encoding="utf-8")
    return f"# 任务原文：{task_id}\n\n路径：`{path}`\n\n{content}"


def raw_context(config: dict, task: str = None, date: str = None, top_k: int = 20) -> str:
    """List raw-context files by task or date prefix (YYYY or YYYY-MM or YYYY-MM-DD)."""
    root = _raw_root(config)
    if not root.exists():
        return f"原始上下文目录不存在：{root}"

    if task:
        return task_source(config, task)

    files: List[Path] = [p for p in root.rglob("*.md") if p.name != "README.md"]

    if date:
        files = [p for p in files if date in str(p)]

    files = sorted(files, key=lambda p: p.stat().st_mtime, reverse=True)[:top_k]

    if not files:
        return "未找到符合条件的原始上下文文件"

    lines = ["# 原始上下文列表\n"]
    for p in files:
        lines.append(f"- `{p}`")

    return "\n".join(lines)
