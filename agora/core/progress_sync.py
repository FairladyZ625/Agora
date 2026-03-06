"""ProgressSync — three-layer activity logging.

flow_log: state transitions, gate results, stage advances
progress_log: agent work reports, todo snapshots
system events: subtask dispatch/completion/failure
"""
from __future__ import annotations

from .db import DatabaseManager


class ProgressSync:
    """Unified writer for the three-layer activity stream."""

    def __init__(self, db: DatabaseManager):
        self.db = db

    # ── Flow Layer ──

    def record_state_change(self, task_id: str, from_state: str, to_state: str,
                            actor: str = "system", detail: dict | None = None):
        self.db.insert_flow_log(
            task_id, event="state_change", kind="flow",
            from_state=from_state, to_state=to_state,
            detail=detail, actor=actor,
        )

    def record_stage_advance(self, task_id: str, from_stage: str, to_stage: str,
                             actor: str = "system"):
        self.db.insert_flow_log(
            task_id, event="stage_advance", kind="flow",
            stage_id=to_stage, from_state=from_stage, to_state=to_stage,
            detail={"from_stage": from_stage, "to_stage": to_stage},
            actor=actor,
        )

    def record_gate_result(self, task_id: str, stage_id: str, gate_type: str,
                           passed: bool, actor: str = "system"):
        event = "gate_passed" if passed else "gate_failed"
        self.db.insert_flow_log(
            task_id, event=event, kind="flow", stage_id=stage_id,
            detail={"gate_type": gate_type, "passed": passed},
            actor=actor,
        )

    def record_archon_decision(self, task_id: str, stage_id: str, decision: str,
                               actor: str = "archon", comment: str = ""):
        self.db.insert_flow_log(
            task_id, event=f"archon_{decision}", kind="archon", stage_id=stage_id,
            detail={"decision": decision, "comment": comment},
            actor=actor,
        )

    # ── Progress Layer ──

    def record_agent_report(self, task_id: str, stage_id: str, actor: str,
                            content: str, subtask_id: str | None = None,
                            artifacts: list | None = None):
        self.db.insert_progress_log(
            task_id, content=content, actor=actor,
            kind="progress", stage_id=stage_id,
            subtask_id=subtask_id, artifacts=artifacts,
        )

    def record_todos_snapshot(self, task_id: str, stage_id: str, actor: str,
                              content: str):
        self.db.insert_progress_log(
            task_id, content=content, actor=actor,
            kind="todos", stage_id=stage_id,
        )

    # ── System Layer ──

    def record_subtask_event(self, task_id: str, stage_id: str, subtask_id: str,
                             event_type: str, actor: str = "system",
                             detail: dict | None = None):
        self.db.insert_flow_log(
            task_id, event=f"subtask_{event_type}", kind="system",
            stage_id=stage_id,
            detail={"subtask_id": subtask_id, **(detail or {})},
            actor=actor,
        )

    # ── Query ──

    def get_activity_stream(self, task_id: str, limit: int = 50) -> list[dict]:
        """Merge flow_log and progress_log into a single time-ordered stream."""
        conn = self.db.connect()
        flow = conn.execute(
            "SELECT *, 'flow' as layer FROM flow_log WHERE task_id=? ORDER BY created_at",
            (task_id,),
        ).fetchall()
        progress = conn.execute(
            "SELECT *, 'progress' as layer FROM progress_log WHERE task_id=? ORDER BY created_at",
            (task_id,),
        ).fetchall()
        merged = sorted(
            [dict(r) for r in flow] + [dict(r) for r in progress],
            key=lambda x: x["created_at"],
        )
        return merged[:limit]
