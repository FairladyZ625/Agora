"""Task manager — CRUD + state management.

Orchestrates task creation, state transitions, and stage advancement
using GateKeeper, PermissionManager, ProgressSync, and StateMachine.
"""
import json
from pathlib import Path
from typing import Optional

from .db import DatabaseManager
from .enums import TaskState
from .gate_keeper import GateKeeper
from .mode_controller import ModeController
from .permission import PermissionManager
from .progress_sync import ProgressSync
from .state_machine import StateMachine


class TaskManager:
    """Task manager — CRUD + state management."""

    def __init__(self, db: DatabaseManager, templates_dir: str = None,
                 permission: PermissionManager | None = None,
                 config: dict | None = None):
        self.db = db
        self.state_machine = StateMachine()
        self.templates_dir = templates_dir or str(
            Path(__file__).parent.parent / "templates"
        )
        cfg = config or {}
        self.permission = permission or PermissionManager(cfg)
        archon_users = list(self.permission.archon_users)
        self.gate_keeper = GateKeeper(db, archon_users=archon_users)
        self.progress = ProgressSync(db)
        self.mode_controller = ModeController(db)

    def load_template(self, task_type: str) -> dict:
        """Load a task template JSON by type name."""
        path = Path(self.templates_dir) / "tasks" / f"{task_type}.json"
        if not path.exists():
            raise FileNotFoundError(f"Template not found: {path}")
        return json.loads(path.read_text(encoding="utf-8"))

    def create_task(self, title: str, task_type: str, creator: str = "archon",
                    description: str = "", priority: str = "normal") -> dict:
        """Create a task (two-phase: draft -> created -> active)."""
        template = self.load_template(task_type)
        task_id = self.db.generate_task_id()

        team = {"members": []}
        for role, config in template.get("defaultTeam", {}).items():
            suggested = config.get("suggested", [])
            agent_id = suggested[0] if suggested else role
            team["members"].append({
                "role": role,
                "agentId": agent_id,
                "model_preference": config.get("model_preference", ""),
            })

        workflow = {
            "type": template.get("defaultWorkflow", "linear"),
            "stages": template.get("stages", []),
        }

        task = self.db.insert_task(
            task_id=task_id, title=title, task_type=task_type,
            creator=creator, team=team, workflow=workflow,
            priority=priority, description=description,
        )

        self.progress.record_state_change(
            task_id, from_state="init", to_state="draft",
            actor=creator, detail={"task_type": task_type, "template": template["name"]},
        )

        task = self.db.update_task(task_id, task["version"], state="created")
        self.progress.record_state_change(
            task_id, from_state="draft", to_state="created", actor="system",
        )

        first_stage_id = workflow["stages"][0]["id"]
        task = self.db.update_task(
            task_id, task["version"],
            state="active", current_stage=first_stage_id,
        )
        self.progress.record_state_change(
            task_id, from_state="created", to_state="active", actor="system",
        )
        self.db.enter_stage(task_id, first_stage_id)
        return task

    def get_task(self, task_id: str) -> Optional[dict]:
        return self.db.get_task(task_id)

    def list_tasks(self, state_filter: Optional[str] = None) -> list[dict]:
        return self.db.list_tasks(state_filter)

    def advance_task(self, task_id: str, caller_id: str = "archon") -> dict:
        """Advance task to next stage using GateKeeper for gate checks."""
        if not self.permission.can_advance(caller_id):
            raise PermissionError(
                f"caller {caller_id} has canAdvance=false for /task advance"
            )

        task = self._get_task_or_raise(task_id)
        if task["state"] != TaskState.ACTIVE:
            raise ValueError(f"Task {task_id} is in state '{task['state']}', expected 'active'")

        current_stage_id = task.get("current_stage")
        if not current_stage_id:
            raise ValueError(f"Task {task_id} has no current_stage set")

        current_stage = self.state_machine.get_current_stage(task["workflow"], current_stage_id)

        # Use GateKeeper instead of StateMachine.check_gate
        if not self.gate_keeper.check_gate(task, current_stage, caller_id):
            raise PermissionError(
                f"Gate check failed for stage '{current_stage_id}' "
                f"(gate type: {current_stage.get('gate', {}).get('type')})"
            )

        next_stage = self.state_machine.get_next_stage(task["workflow"], current_stage_id)
        version = task["version"]

        self.db.exit_stage(task_id, current_stage_id, reason="advance")
        self.progress.record_stage_advance(
            task_id, from_stage=current_stage_id,
            to_stage=next_stage["id"] if next_stage else "done",
            actor=caller_id,
        )

        if next_stage is None:
            task = self.db.update_task(task_id, version, state="done")
            self.progress.record_state_change(task_id, "active", "done", actor=caller_id)
            return task
        else:
            task = self.db.update_task(task_id, version, current_stage=next_stage["id"])
            self.db.enter_stage(task_id, next_stage["id"])
            return task

    def approve_task(self, task_id: str, approver_id: str, comment: str = "") -> dict:
        """Record an approval for the current stage."""
        task = self._get_task_or_raise(task_id)
        stage = self.state_machine.get_current_stage(task["workflow"], task["current_stage"])
        self.gate_keeper.route_gate_command(task, stage, "/task approve", approver_id)
        approver_role = stage.get("gate", {}).get("approver_role", "reviewer")
        self.gate_keeper.record_approval(task_id, task["current_stage"], approver_role, approver_id, comment)
        self.progress.record_gate_result(task_id, task["current_stage"], "approval", True, actor=approver_id)
        return self.db.get_task(task_id)

    def reject_task(self, task_id: str, rejector_id: str, reason: str = "") -> dict:
        """Reject — record in flow_log (no DB table for rejections, just log)."""
        task = self._get_task_or_raise(task_id)
        stage = self.state_machine.get_current_stage(task["workflow"], task["current_stage"])
        self.gate_keeper.route_gate_command(task, stage, "/task reject", rejector_id)
        self.progress.record_gate_result(task_id, task["current_stage"], "approval", False, actor=rejector_id)
        self.db.insert_flow_log(
            task_id, event="rejected", kind="flow",
            stage_id=task["current_stage"], actor=rejector_id,
            detail={"reason": reason},
        )
        return self.db.get_task(task_id)

    def archon_approve(self, task_id: str, reviewer_id: str, comment: str = "") -> dict:
        """Archon approves the current stage's archon_review gate."""
        task = self._get_task_or_raise(task_id)
        stage = self.state_machine.get_current_stage(task["workflow"], task["current_stage"])
        self.gate_keeper.route_gate_command(task, stage, "/task archon-approve", reviewer_id)
        self.gate_keeper.record_archon_review(task_id, task["current_stage"], "approved", reviewer_id, comment)
        self.progress.record_archon_decision(task_id, task["current_stage"], "approved", actor=reviewer_id, comment=comment)
        return self.db.get_task(task_id)

    def archon_reject(self, task_id: str, reviewer_id: str, reason: str = "") -> dict:
        """Archon rejects the current stage."""
        task = self._get_task_or_raise(task_id)
        stage = self.state_machine.get_current_stage(task["workflow"], task["current_stage"])
        self.gate_keeper.route_gate_command(task, stage, "/task archon-reject", reviewer_id)
        self.gate_keeper.record_archon_review(task_id, task["current_stage"], "rejected", reviewer_id, reason)
        self.progress.record_archon_decision(task_id, task["current_stage"], "rejected", actor=reviewer_id, comment=reason)
        return self.db.get_task(task_id)

    def confirm_task(self, task_id: str, voter_id: str, vote: str = "approve", comment: str = "") -> dict:
        """Record a quorum vote."""
        task = self._get_task_or_raise(task_id)
        stage = self.state_machine.get_current_stage(task["workflow"], task["current_stage"])
        self.gate_keeper.route_gate_command(task, stage, "/task confirm", voter_id)
        result = self.gate_keeper.record_quorum_vote(task_id, task["current_stage"], voter_id, vote, comment)
        self.db.insert_flow_log(
            task_id, event="quorum_vote", kind="flow",
            stage_id=task["current_stage"], actor=voter_id,
            detail={"vote": vote, "approved": result["approved"], "total": result["total"]},
        )
        return {**self.db.get_task(task_id), "quorum": result}

    def complete_subtask(self, task_id: str, subtask_id: str, caller_id: str,
                         output: str = "") -> dict:
        """Mark a subtask as done."""
        task = self._get_task_or_raise(task_id)
        subtask = next(
            (st for st in self.db.get_subtasks(task_id) if st["id"] == subtask_id),
            None,
        )
        if subtask is None:
            raise ValueError(f"Subtask {subtask_id} not found in task {task_id}")
        if not self.permission.verify_subtask_done(caller_id, subtask["assignee"]):
            raise PermissionError(
                f"{caller_id} 无权完成子任务 {subtask_id}（assignee={subtask['assignee']}）"
            )

        self.db.update_subtask(task_id, subtask_id, status="done", output=output)
        self.progress.record_subtask_event(
            task_id, subtask.get("stage_id") or task["current_stage"],
            subtask_id, "done", actor=caller_id,
        )
        return self.db.get_task(task_id)

    def force_advance(self, task_id: str, reason: str = "") -> dict:
        """Force advance past the current gate (archon override)."""
        task = self._get_task_or_raise(task_id)
        if task["state"] != TaskState.ACTIVE:
            raise ValueError(f"Task {task_id} is in state '{task['state']}', expected 'active'")
        self.db.insert_flow_log(
            task_id, event="force_advance", kind="flow",
            stage_id=task["current_stage"], actor="archon",
            detail={"reason": reason},
        )
        # Bypass gate check — directly advance via state machine internals
        current_stage_id = task["current_stage"]
        workflow = task["workflow"]
        next_stage = self.state_machine.get_next_stage(workflow, current_stage_id)
        self.db.exit_stage(task_id, current_stage_id, reason="force_advance")
        if next_stage is None:
            task = self.db.update_task(task_id, task["version"], state="done")
            self.progress.record_state_change(task_id, "active", "done", actor="archon")
        else:
            task = self.db.update_task(task_id, task["version"], current_stage=next_stage["id"])
            self.db.enter_stage(task_id, next_stage["id"])
            self.progress.record_stage_advance(task_id, current_stage_id, next_stage["id"], actor="archon")
        return task

    def unblock_task(self, task_id: str, reason: str = "") -> dict:
        """Unblock a blocked task back to active."""
        return self.update_task_state(task_id, TaskState.ACTIVE, reason=reason or "unblocked")

    def pause_task(self, task_id: str, reason: str = "") -> dict:
        """Pause an active task."""
        return self.update_task_state(task_id, TaskState.PAUSED, reason=reason or "paused")

    def resume_task(self, task_id: str) -> dict:
        """Resume a paused task."""
        return self.update_task_state(task_id, TaskState.ACTIVE, reason="resumed")

    def cancel_task(self, task_id: str, reason: str = "") -> dict:
        """Cancel a task."""
        return self.update_task_state(task_id, TaskState.CANCELLED, reason=reason or "cancelled")

    def update_task_state(self, task_id: str, new_state: str,
                          reason: str = "") -> dict:
        """Update task state directly (for pause/resume/cancel/block/unblock)."""
        task = self._get_task_or_raise(task_id)
        old_state = task["state"]
        if not self.state_machine.validate_transition(old_state, new_state):
            raise ValueError(f"Invalid transition: {old_state} -> {new_state}")

        update_kwargs = {"state": new_state}
        if new_state in (TaskState.ACTIVE, TaskState.CANCELLED):
            update_kwargs["error_detail"] = None

        task = self.db.update_task(task_id, task["version"], **update_kwargs)
        self.progress.record_state_change(
            task_id, from_state=old_state, to_state=new_state,
            actor="system", detail={"reason": reason} if reason else None,
        )
        return task

    def cleanup_orphaned(self, task_id: Optional[str] = None) -> int:
        """Clean up orphaned tasks."""
        conn = self.db.connect()
        if task_id:
            rows = conn.execute(
                "SELECT id FROM tasks WHERE id = ? AND state = 'orphaned'", (task_id,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT id FROM tasks WHERE state = 'orphaned'").fetchall()

        count = 0
        for row in rows:
            tid = row["id"]
            with self.db.get_connection() as c:
                for table in ("subtasks", "flow_log", "progress_log", "stage_history",
                              "archon_reviews", "approvals", "quorum_votes", "tasks"):
                    key = "id" if table == "tasks" else "task_id"
                    c.execute(f"DELETE FROM {table} WHERE {key} = ?", (tid,))
            count += 1
        return count

    def promote_todo(
        self,
        todo_id: int,
        task_type: str = "quick",
        creator: str = "archon",
        priority: str = "normal",
    ) -> dict:
        """Promote a todo item into a formal task."""
        todo = self.db.get_todo(todo_id)
        if todo is None:
            raise ValueError(f"Todo {todo_id} not found")
        if todo.get("promoted_to"):
            raise ValueError(f"Todo {todo_id} already promoted to {todo['promoted_to']}")

        task = self.create_task(
            title=todo["text"],
            task_type=task_type,
            creator=creator,
            priority=priority,
        )
        updated_todo = self.db.update_todo(todo_id, promoted_to=task["id"])
        return {"todo": updated_todo, "task": task}

    def _get_task_or_raise(self, task_id: str) -> dict:
        task = self.db.get_task(task_id)
        if task is None:
            raise ValueError(f"Task {task_id} not found")
        return task
