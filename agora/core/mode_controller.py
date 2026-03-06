"""ModeController — discuss/execute mode switching.

Manages collaboration mode transitions within a stage:
- discuss: multi-agent discussion with participants
- execute: parallel subtask execution with assignments
"""
from .db import DatabaseManager
from .progress_sync import ProgressSync


class ModeController:
    """Discuss/execute mode controller."""

    def __init__(self, db: DatabaseManager):
        self.db = db
        self.progress = ProgressSync(db)

    def enter_discuss_mode(self, task_id: str, stage_id: str,
                           participants: list[str]) -> dict:
        """Enter discuss mode for a stage."""
        self.progress.record_state_change(
            task_id, from_state=stage_id, to_state=stage_id,
            actor="system",
            detail={"mode": "discuss", "participants": participants},
        )
        return {"mode": "discuss", "participants": participants, "stage_id": stage_id}

    def enter_execute_mode(self, task_id: str, stage_id: str,
                           subtask_defs: list[dict]) -> dict:
        """Enter execute mode — create subtasks from definitions."""
        created = []
        for st in subtask_defs:
            self.db.insert_subtask(task_id, st["id"], stage_id, st["title"], st["assignee"])
            self.progress.record_subtask_event(task_id, stage_id, st["id"], "created")
            created.append(st)
        return {"mode": "execute", "stage_id": stage_id, "subtasks": created}
