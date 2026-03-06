"""GateKeeper — 6 种 Gate 类型的完整实现。

Gate 是阶段推进的确定性条件，不依赖 AI 判断。
支持: command, archon_review, all_subtasks_done, approval, auto_timeout, quorum。
"""
from datetime import datetime, timezone
from typing import Optional

from .db import DatabaseManager
from .enums import GateType


class GateKeeper:
    """Gate 检查 + 命令路由。"""

    def __init__(self, db: DatabaseManager, archon_users: list[str] | None = None):
        self.db = db
        self.archon_users = archon_users or ["lizeyu"]

    def check_gate(self, task: dict, stage: dict, caller_id: Optional[str] = None) -> bool:
        gate = stage.get("gate", {})
        gate_type = gate.get("type", "command")
        task_id = task["id"]
        stage_id = stage["id"]

        if gate_type == GateType.COMMAND or gate_type == "command":
            return self._check_command(task, caller_id)

        if gate_type == GateType.ARCHON_REVIEW or gate_type == "archon_review":
            return self._check_archon_review(task_id, stage_id)

        if gate_type == GateType.ALL_SUBTASKS_DONE or gate_type == "all_subtasks_done":
            return self._check_all_subtasks_done(task_id, stage_id)

        if gate_type == GateType.APPROVAL or gate_type == "approval":
            approver_role = gate.get("approver_role")
            return self._check_approval(task_id, stage_id, approver_role)

        if gate_type == GateType.AUTO_TIMEOUT or gate_type == "auto_timeout":
            timeout_sec = gate.get("timeout_sec", 1800)
            return self._check_auto_timeout(task_id, stage_id, timeout_sec)

        if gate_type == GateType.QUORUM or gate_type == "quorum":
            required = gate.get("required", 1)
            return self._check_quorum(task_id, stage_id, required)

        return False

    def route_gate_command(self, task: dict, stage: dict, command: str, caller_id: str):
        gate_type = stage.get("gate", {}).get("type", "command")

        if command in ("/task approve", "/task reject"):
            if gate_type != "approval":
                raise PermissionError(f"当前 Gate 类型为 {gate_type}，不是 approval。")
            self._verify_role(task, caller_id, stage["gate"].get("approver_role", "reviewer"))

        elif command in ("/task archon-approve", "/task archon-reject"):
            if gate_type != "archon_review":
                raise PermissionError(f"当前 Gate 类型为 {gate_type}，不是 archon_review。")
            if caller_id not in self.archon_users:
                raise PermissionError("此命令仅限 Archon 使用")

        elif command == "/task advance":
            if gate_type not in ("command",):
                raise PermissionError(f"当前 Gate 类型为 {gate_type}，不是 command。")
            self._verify_member(task, caller_id)

        elif command == "/task confirm":
            if gate_type != "quorum":
                raise PermissionError(f"当前 Gate 类型为 {gate_type}，不是 quorum。")
            self._verify_member(task, caller_id)

    # ── Archon Review Actions ──

    def record_archon_review(self, task_id: str, stage_id: str, decision: str,
                              reviewer_id: str, comment: str = "") -> int:
        with self.db.get_connection() as conn:
            cursor = conn.execute(
                "INSERT INTO archon_reviews (task_id, stage_id, decision, reviewer_id, comment) VALUES (?,?,?,?,?)",
                (task_id, stage_id, decision, reviewer_id, comment)
            )
            return cursor.lastrowid

    # ── Approval Actions ──

    def record_approval(self, task_id: str, stage_id: str, approver_role: str,
                        approver_id: str, comment: str = "") -> int:
        with self.db.get_connection() as conn:
            cursor = conn.execute(
                "INSERT INTO approvals (task_id, stage_id, approver_role, approver_id, comment) VALUES (?,?,?,?,?)",
                (task_id, stage_id, approver_role, approver_id, comment)
            )
            return cursor.lastrowid

    # ── Quorum Actions ──

    def record_quorum_vote(self, task_id: str, stage_id: str, voter_id: str,
                           vote: str = "approve", comment: str = "") -> dict:
        with self.db.get_connection() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO quorum_votes (task_id, stage_id, voter_id, vote, comment) VALUES (?,?,?,?,?)",
                (task_id, stage_id, voter_id, vote, comment)
            )
        conn = self.db.connect()
        approved = conn.execute(
            "SELECT COUNT(*) as cnt FROM quorum_votes WHERE task_id=? AND stage_id=? AND vote='approve'",
            (task_id, stage_id)
        ).fetchone()["cnt"]
        total = conn.execute(
            "SELECT COUNT(*) as cnt FROM quorum_votes WHERE task_id=? AND stage_id=?",
            (task_id, stage_id)
        ).fetchone()["cnt"]
        return {"approved": approved, "total": total}

    # ── Private Gate Checks ──

    def _check_command(self, task: dict, caller_id: Optional[str]) -> bool:
        if caller_id is None:
            return False
        members = {m["agentId"] for m in task.get("team", {}).get("members", [])}
        if caller_id not in members and caller_id not in self.archon_users:
            raise PermissionError(f"caller {caller_id} is not a member of task {task['id']}")
        return True

    def _check_archon_review(self, task_id: str, stage_id: str) -> bool:
        conn = self.db.connect()
        row = conn.execute(
            "SELECT decision FROM archon_reviews WHERE task_id=? AND stage_id=? ORDER BY reviewed_at DESC LIMIT 1",
            (task_id, stage_id)
        ).fetchone()
        return row is not None and row["decision"] == "approved"

    def _check_all_subtasks_done(self, task_id: str, stage_id: str) -> bool:
        subtasks = self.db.get_subtasks(task_id, stage_id)
        if not subtasks:
            return True
        return all(st["status"] == "done" for st in subtasks)

    def _check_approval(self, task_id: str, stage_id: str, approver_role: Optional[str]) -> bool:
        conn = self.db.connect()
        if approver_role:
            row = conn.execute(
                "SELECT 1 FROM approvals WHERE task_id=? AND stage_id=? AND approver_role=?",
                (task_id, stage_id, approver_role)
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT 1 FROM approvals WHERE task_id=? AND stage_id=?",
                (task_id, stage_id)
            ).fetchone()
        return row is not None

    def _check_auto_timeout(self, task_id: str, stage_id: str, timeout_sec: int) -> bool:
        conn = self.db.connect()
        row = conn.execute(
            "SELECT entered_at FROM stage_history WHERE task_id=? AND stage_id=? ORDER BY entered_at DESC LIMIT 1",
            (task_id, stage_id)
        ).fetchone()
        if row is None:
            return False
        entered = datetime.fromisoformat(row["entered_at"].replace("Z", "+00:00")) if isinstance(row["entered_at"], str) else row["entered_at"]
        now = datetime.now(timezone.utc)
        if not entered.tzinfo:
            entered = entered.replace(tzinfo=timezone.utc)
        return (now - entered).total_seconds() > timeout_sec

    def _check_quorum(self, task_id: str, stage_id: str, required: int) -> bool:
        conn = self.db.connect()
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM quorum_votes WHERE task_id=? AND stage_id=? AND vote='approve'",
            (task_id, stage_id)
        ).fetchone()
        return row["cnt"] >= required

    def _verify_member(self, task: dict, caller_id: str):
        members = {m["agentId"] for m in task.get("team", {}).get("members", [])}
        if caller_id not in members and caller_id not in self.archon_users:
            raise PermissionError(f"{caller_id} 不是任务 {task['id']} 的团队成员")

    def _verify_role(self, task: dict, caller_id: str, role: str):
        for m in task.get("team", {}).get("members", []):
            if m["agentId"] == caller_id and m["role"] == role:
                return
        if caller_id in self.archon_users:
            return
        raise PermissionError(f"{caller_id} 不持有角色 {role}")
