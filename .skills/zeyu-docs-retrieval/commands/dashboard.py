#!/usr/bin/env python3
"""
OpenClaw 管家看板相关命令

提供 daily briefing / decision queue / team status / schedule / snapshot 的快速读取。
"""

from pathlib import Path

from utils.obsidian_api import ObsidianAPI


def _api(config: dict) -> ObsidianAPI:
    return ObsidianAPI(
        api_url=config["obsidian"]["api_url"],
        api_key=config["obsidian"]["api_key"],
        timeout=config["obsidian"].get("timeout", 30),
    )


def _read_note_or_empty(api: ObsidianAPI, note_path: str) -> str:
    try:
        return api.read_note(note_path)
    except Exception as e:
        return f"[读取失败] {note_path}: {e}"


def snapshot(config: dict) -> str:
    """读取最新上下文快照。"""
    api = _api(config)
    return _read_note_or_empty(api, "07-CONTEXT-SNAPSHOT/latest.md")


def zeyu_status(config: dict) -> str:
    """聚合李总当前状态（简报 + 决策 + 进行中任务）。"""
    api = _api(config)

    briefing = _read_note_or_empty(api, "06-DASHBOARD/daily-briefing.md")
    decisions = _read_note_or_empty(api, "06-DASHBOARD/decision-queue.md")
    tasks = _read_note_or_empty(api, "03-ACTIVE-TASKS/进行中任务.md")

    return "\n\n".join(
        [
            "# ZeYu Status\n",
            "## Daily Briefing\n",
            briefing,
            "## Decision Queue\n",
            decisions,
            "## Active Tasks\n",
            tasks,
        ]
    )


def team_status(config: dict) -> str:
    """读取团队状态看板。"""
    api = _api(config)

    overview = _read_note_or_empty(api, "04-TEAM/团队总览.md")
    tasks_json = _read_note_or_empty(api, ".clawdbot/active-tasks.json")

    return "\n\n".join(
        [
            "# Team Status\n",
            "## 团队总览\n",
            overview,
            "## active-tasks.json\n",
            tasks_json,
        ]
    )


def schedule(config: dict) -> str:
    """读取本周排期与截止日期。"""
    api = _api(config)

    weekly = _read_note_or_empty(api, "05-SCHEDULE/本周排期.md")
    deadlines = _read_note_or_empty(api, "05-SCHEDULE/截止日期汇总.md")

    return "\n\n".join(
        [
            "# Schedule\n",
            "## 本周排期\n",
            weekly,
            "## 截止日期汇总\n",
            deadlines,
        ]
    )


def decisions(config: dict) -> str:
    """读取待决策队列。"""
    api = _api(config)
    return _read_note_or_empty(api, "06-DASHBOARD/decision-queue.md")
