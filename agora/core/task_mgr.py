"""Task manager — CRUD + state management.

Orchestrates task creation, state transitions, and stage advancement
using StateMachine and DatabaseManager.
"""
import json
from pathlib import Path
from typing import Optional

from .db import DatabaseManager
from .enums import TaskState
from .state_machine import StateMachine


class TaskManager:
    """Task manager — CRUD + state management."""

    def __init__(self, db: DatabaseManager, templates_dir: str = None):
        self.db = db
        self.state_machine = StateMachine()
        self.templates_dir = templates_dir or str(
            Path(__file__).parent.parent / "templates"
        )

    def load_template(self, task_type: str) -> dict:
        """Load a task template JSON by type name."""
        path = Path(self.templates_dir) / "tasks" / f"{task_type}.json"
        if not path.exists():
            raise FileNotFoundError(f"Template not found: {path}")
        return json.loads(path.read_text(encoding="utf-8"))

    def create_task(self, title: str, task_type: str, creator: str = "archon",
                    description: str = "", priority: str = "normal") -> dict:
        """Create a task (two-phase: draft -> created -> active).

        MVP: skips Discord Thread creation, goes draft -> created -> active directly.
        """
        # 1. Load template
        template = self.load_template(task_type)

        # 2. Generate task_id
        task_id = self.db.generate_task_id()

        # 3. Build default team from template
        team = {"members": []}
        for role, config in template.get("defaultTeam", {}).items():
            suggested = config.get("suggested", [])
            agent_id = suggested[0] if suggested else role
            team["members"].append({
                "role": role,
                "agentId": agent_id,
                "model_preference": config.get("model_preference", ""),
            })
        # 4. Build workflow from template stages
        workflow = {
            "type": template.get("defaultWorkflow", "linear"),
            "stages": template.get("stages", []),
        }

        # 5. Insert task (state=draft)
        task = self.db.insert_task(
            task_id=task_id,
            title=title,
            task_type=task_type,
            creator=creator,
            team=team,
            workflow=workflow,
            priority=priority,
            description=description,
        )

        # 6. flow_log: created
        self.db.insert_flow_log(
            task_id, event="created", kind="flow",
            detail={"task_type": task_type, "template": template["name"]},
            actor=creator,
        )

        # 7. draft -> created
        task = self.db.update_task(task_id, task["version"], state="created")
        self.db.insert_flow_log(
            task_id, event="provisioned", kind="flow",
            from_state="draft", to_state="created",
            actor="system",
        )

        # 8. created -> active, set current_stage to first stage
        first_stage_id = workflow["stages"][0]["id"]
        task = self.db.update_task(
            task_id, task["version"],
            state="active",
            current_stage=first_stage_id,
        )

        # 9. flow_log: stage_enter + stage_history
        self.db.insert_flow_log(
            task_id, event="stage_enter", kind="flow",
            stage_id=first_stage_id,
            from_state="created", to_state="active",
            actor="system",
        )
        self.db.enter_stage(task_id, first_stage_id)

        return task

    def get_task(self, task_id: str) -> Optional[dict]:
        """Get a task by ID."""
        return self.db.get_task(task_id)

    def list_tasks(self, state_filter: Optional[str] = None) -> list[dict]:
        """List tasks, optionally filtered by state."""
        return self.db.list_tasks(state_filter)

    def advance_task(self, task_id: str, caller_id: str = "archon") -> dict:
        """Advance task to next stage. Delegates to StateMachine.advance()."""
        task = self.db.get_task(task_id)
        if task is None:
            raise ValueError(f"Task {task_id} not found")
        if task["state"] != TaskState.ACTIVE:
            raise ValueError(
                f"Task {task_id} is in state '{task['state']}', expected 'active'"
            )
        return self.state_machine.advance(self.db, task, caller_id)

    def update_task_state(self, task_id: str, new_state: str,
                          reason: str = "") -> dict:
        """Update task state directly (for pause/resume/cancel/block/unblock).

        Validates transition legality, writes flow_log.
        """
        task = self.db.get_task(task_id)
        if task is None:
            raise ValueError(f"Task {task_id} not found")

        old_state = task["state"]
        if not self.state_machine.validate_transition(old_state, new_state):
            raise ValueError(
                f"Invalid transition: {old_state} -> {new_state}"
            )

        update_kwargs = {"state": new_state}
        # Clear error_detail when unblocking or cancelling
        if new_state in (TaskState.ACTIVE, TaskState.CANCELLED):
            update_kwargs["error_detail"] = None

        task = self.db.update_task(task_id, task["version"], **update_kwargs)
        self.db.insert_flow_log(
            task_id, event="state_change", kind="flow",
            from_state=old_state, to_state=new_state,
            detail={"reason": reason} if reason else None,
            actor="system",
        )
        return task

    def cleanup_orphaned(self, task_id: Optional[str] = None) -> int:
        """Clean up orphaned tasks. Returns count of cleaned tasks."""
        conn = self.db.connect()
        if task_id:
            rows = conn.execute(
                "SELECT id FROM tasks WHERE id = ? AND state = 'orphaned'",
                (task_id,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id FROM tasks WHERE state = 'orphaned'"
            ).fetchall()

        count = 0
        for row in rows:
            tid = row["id"]
            with self.db.get_connection() as c:
                c.execute("DELETE FROM subtasks WHERE task_id = ?", (tid,))
                c.execute("DELETE FROM flow_log WHERE task_id = ?", (tid,))
                c.execute("DELETE FROM progress_log WHERE task_id = ?", (tid,))
                c.execute("DELETE FROM stage_history WHERE task_id = ?", (tid,))
                c.execute("DELETE FROM archon_reviews WHERE task_id = ?", (tid,))
                c.execute("DELETE FROM approvals WHERE task_id = ?", (tid,))
                c.execute("DELETE FROM quorum_votes WHERE task_id = ?", (tid,))
                c.execute("DELETE FROM tasks WHERE id = ?", (tid,))
            count += 1
        return count
