"""Read-only query helpers for dashboard expansion APIs."""
from __future__ import annotations

import json
from pathlib import Path

from .db import DatabaseManager


class DashboardQueryService:
    """Aggregate read models for dashboard-facing APIs."""

    def __init__(self, db: DatabaseManager, templates_dir: str):
        self.db = db
        self.templates_dir = Path(templates_dir)

    def get_agents_status(self) -> dict:
        """Summarize active agents, workloads, and craftsmen panes."""
        active_tasks = self.db.list_tasks("active")
        conn = self.db.connect()

        agents: dict[str, dict] = {}
        craftsmen: dict[str, dict] = {}
        task_ids = [task["id"] for task in active_tasks]

        activity_map: dict[str, str | None] = {}
        if task_ids:
            placeholders = ",".join("?" for _ in task_ids)
            rows = conn.execute(
                f"""
                SELECT actor, MAX(created_at) AS last_active_at
                FROM progress_log
                WHERE task_id IN ({placeholders})
                GROUP BY actor
                """,
                task_ids,
            ).fetchall()
            activity_map = {row["actor"]: row["last_active_at"] for row in rows}

        for task in active_tasks:
            for member in task.get("team", {}).get("members", []):
                entry = agents.setdefault(
                    member["agentId"],
                    {
                        "id": member["agentId"],
                        "role": member.get("role"),
                        "status": "busy",
                        "active_task_ids": [],
                        "active_subtask_ids": [],
                        "load": 0,
                        "last_active_at": activity_map.get(member["agentId"]),
                    },
                )
                if task["id"] not in entry["active_task_ids"]:
                    entry["active_task_ids"].append(task["id"])

            for subtask in self.db.get_subtasks(task["id"]):
                assignee = subtask["assignee"]
                entry = agents.setdefault(
                    assignee,
                    {
                        "id": assignee,
                        "role": None,
                        "status": "busy",
                        "active_task_ids": [task["id"]],
                        "active_subtask_ids": [],
                        "load": 0,
                        "last_active_at": activity_map.get(assignee),
                    },
                )
                if task["id"] not in entry["active_task_ids"]:
                    entry["active_task_ids"].append(task["id"])
                if subtask["id"] not in entry["active_subtask_ids"]:
                    entry["active_subtask_ids"].append(subtask["id"])
                if subtask.get("craftsman_type"):
                    craftsman_id = subtask["craftsman_type"]
                    craftsmen[craftsman_id] = {
                        "id": craftsman_id,
                        "status": "busy" if not subtask.get("done_at") else "idle",
                        "task_id": task["id"],
                        "subtask_id": subtask["id"],
                        "title": subtask["title"],
                        "running_since": subtask.get("dispatched_at"),
                    }

        for entry in agents.values():
            entry["load"] = max(len(entry["active_subtask_ids"]), len(entry["active_task_ids"]))

        return {
            "summary": {
                "active_tasks": len(active_tasks),
                "active_agents": len(agents),
                "busy_craftsmen": len([item for item in craftsmen.values() if item["status"] == "busy"]),
            },
            "agents": sorted(agents.values(), key=lambda item: (item["id"] or "")),
            "craftsmen": sorted(craftsmen.values(), key=lambda item: item["id"]),
        }

    def list_templates(self) -> list[dict]:
        """Return template summaries."""
        task_templates_dir = self.templates_dir / "tasks"
        summaries: list[dict] = []
        for path in sorted(task_templates_dir.glob("*.json")):
            payload = json.loads(path.read_text(encoding="utf-8"))
            summaries.append(
                {
                    "id": path.stem,
                    "name": payload.get("name", path.stem),
                    "type": payload.get("type", path.stem),
                    "description": payload.get("description", ""),
                    "governance": payload.get("governance"),
                    "stage_count": len(payload.get("stages", [])),
                }
            )
        return summaries

    def get_template(self, template_id: str) -> dict:
        """Return the full task template payload."""
        path = self.templates_dir / "tasks" / f"{template_id}.json"
        if not path.exists():
            raise ValueError(f"Template {template_id} not found")
        return json.loads(path.read_text(encoding="utf-8"))
