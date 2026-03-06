"""Task state machine + DAG workflow engine.

Handles state transitions, gate checks, and stage advancement.
"""
from typing import Optional

from .db import DatabaseManager
from .enums import GateType, TaskState


class StateMachine:
    """Task state machine + DAG workflow engine."""

    VALID_TRANSITIONS = {
        TaskState.DRAFT: {TaskState.CREATED, TaskState.ORPHANED},
        TaskState.CREATED: {TaskState.ACTIVE},
        TaskState.ACTIVE: {TaskState.ACTIVE, TaskState.BLOCKED, TaskState.PAUSED,
                           TaskState.DONE, TaskState.CANCELLED},
        TaskState.BLOCKED: {TaskState.ACTIVE, TaskState.CANCELLED},
        TaskState.PAUSED: {TaskState.ACTIVE, TaskState.CANCELLED},
        # DONE, CANCELLED, ORPHANED are terminal states
    }

    def validate_transition(self, from_state: TaskState, to_state: TaskState) -> bool:
        """Check if a state transition is valid."""
        if isinstance(from_state, str):
            from_state = TaskState(from_state)
        if isinstance(to_state, str):
            to_state = TaskState(to_state)
        allowed = self.VALID_TRANSITIONS.get(from_state, set())
        return to_state in allowed

    def get_current_stage(self, workflow: dict, current_stage_id: str) -> dict:
        """Get the current stage definition from workflow JSON."""
        for stage in workflow.get("stages", []):
            if stage["id"] == current_stage_id:
                return stage
        raise ValueError(f"Stage '{current_stage_id}' not found in workflow")

    def check_gate(self, db: DatabaseManager, task: dict, stage: dict,
                   caller_id: Optional[str] = None) -> bool:
        """Check if a gate condition is satisfied.

        Supported gate types (MVP):
        - command: verify caller_id is in task.team.members (MVP: any caller passes)
        - all_subtasks_done: all subtasks status == 'done'
        - archon_review: latest review decision in archon_reviews must be 'approved'
        - approval: query approvals table
        """
        gate = stage.get("gate", {})
        gate_type = gate.get("type", "command")

        if gate_type in (GateType.COMMAND, "command"):
            # MVP: any caller with an ID passes
            return caller_id is not None

        if gate_type in (GateType.ARCHON_REVIEW, "archon_review"):
            task_id = task["id"]
            stage_id = stage["id"]
            conn = db.connect()
            row = conn.execute(
                "SELECT decision FROM archon_reviews WHERE task_id = ? AND stage_id = ? "
                "ORDER BY reviewed_at DESC LIMIT 1",
                (task_id, stage_id),
            ).fetchone()
            return row is not None and row["decision"] == "approved"

        if gate_type in (GateType.ALL_SUBTASKS_DONE, "all_subtasks_done"):
            task_id = task["id"]
            stage_id = stage["id"]
            subtasks = db.get_subtasks(task_id, stage_id)
            if not subtasks:
                return True  # no subtasks means gate passes
            return all(st["status"] == "done" for st in subtasks)

        if gate_type in (GateType.APPROVAL, "approval"):
            task_id = task["id"]
            stage_id = stage["id"]
            conn = db.connect()
            row = conn.execute(
                "SELECT 1 FROM approvals WHERE task_id = ? AND stage_id = ?",
                (task_id, stage_id)
            ).fetchone()
            return row is not None

        # Unknown gate type — fail closed
        return False

    def advance(self, db: DatabaseManager, task: dict, caller_id: str) -> dict:
        """Execute stage advancement.

        Flow:
        1. Get current stage
        2. Check gate
        3. Get next stage
        4. No next stage → task done (active → done)
        5. Has next stage → update current_stage + flow_log + stage_history
        6. Return updated task
        """
        task_id = task["id"]
        version = task["version"]
        current_stage_id = task.get("current_stage")
        workflow = task["workflow"]

        if not current_stage_id:
            raise ValueError(f"Task {task_id} has no current_stage set")

        current_stage = self.get_current_stage(workflow, current_stage_id)

        # Check gate
        if not self.check_gate(db, task, current_stage, caller_id):
            raise PermissionError(
                f"Gate check failed for stage '{current_stage_id}' "
                f"(gate type: {current_stage.get('gate', {}).get('type')})"
            )

        next_stage = self.get_next_stage(workflow, current_stage_id)

        # Exit current stage
        db.exit_stage(task_id, current_stage_id, reason="advance")
        db.insert_flow_log(
            task_id, event="stage_exit", kind="flow",
            stage_id=current_stage_id, actor=caller_id,
            detail={"from_stage": current_stage_id}
        )

        if next_stage is None:
            # Final stage done → task complete
            task = db.update_task(task_id, version, state="done")
            db.insert_flow_log(
                task_id, event="task_done", kind="flow",
                from_state="active", to_state="done",
                actor=caller_id
            )
            return task
        else:
            # Advance to next stage
            task = db.update_task(
                task_id, version,
                current_stage=next_stage["id"]
            )
            db.enter_stage(task_id, next_stage["id"])
            db.insert_flow_log(
                task_id, event="stage_enter", kind="flow",
                stage_id=next_stage["id"], actor=caller_id,
                detail={"from_stage": current_stage_id, "to_stage": next_stage["id"]}
            )
            return task

    def get_next_stage(self, workflow: dict, current_stage_id: str) -> Optional[dict]:
        """Get the next stage. Supports linear (array order) and DAG (next field)."""
        stages = workflow.get("stages", [])
        for i, stage in enumerate(stages):
            if stage["id"] == current_stage_id:
                current = stage
                # DAG: use 'next' field if present
                if "next" in stage and stage["next"]:
                    next_id = stage["next"][0]  # MVP: take first next
                    for s in stages:
                        if s["id"] == next_id:
                            return s
                    return None
                # Linear: next in array
                if i + 1 < len(stages):
                    return stages[i + 1]
                return None
        raise ValueError(f"Stage '{current_stage_id}' not found in workflow")
