"""Permission hardening tests for Wave2 baseline."""
import json
from datetime import datetime, timezone

import pytest

from agora.core.db import DatabaseManager
from agora.core.task_mgr import TaskManager


@pytest.fixture
def mgr(tmp_path):
    db = DatabaseManager(str(tmp_path / "test.db"))
    db.initialize()
    return TaskManager(db, config={
        "permissions": {
            "archonUsers": ["lizeyu", "archon"],
            "allowAgents": {
                "opus": {"canCall": ["sonnet", "glm5"], "canAdvance": True},
                "sonnet": {"canCall": ["opus"], "canAdvance": False},
                "glm5": {"canCall": ["opus"], "canAdvance": False},
                "haiku": {"canCall": [], "canAdvance": False},
                "*": {"canCall": [], "canAdvance": False},
            },
            "commandAuth": {
                "requireAgentMatch": True,
                "requireSessionKey": True,
            },
        }
    })


@pytest.fixture
def approval_task(mgr):
    """Insert a one-stage task with approval gate for role-validation tests."""
    now = datetime.now(timezone.utc).isoformat()
    team = {
        "members": [
            {"role": "developer", "agentId": "sonnet"},
            {"role": "reviewer", "agentId": "glm5"},
        ]
    }
    workflow = {
        "stages": [
            {
                "id": "review",
                "name": "审查",
                "mode": "discuss",
                "gate": {"type": "approval", "approver_role": "reviewer"},
            }
        ]
    }
    with mgr.db.get_connection() as conn:
        conn.execute(
            "INSERT INTO tasks (id, version, title, type, priority, creator, state, current_stage, team, workflow, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                "OC-900",
                1,
                "approval test",
                "coding",
                "normal",
                "archon",
                "active",
                "review",
                json.dumps(team),
                json.dumps(workflow),
                now,
                now,
            ),
        )
    return mgr.db.get_task("OC-900")


class TestAdvancePermission:
    def test_advance_requires_can_advance(self, mgr):
        task = mgr.create_task("quick", "quick")
        with pytest.raises(PermissionError, match="canAdvance"):
            mgr.advance_task(task["id"], caller_id="haiku")


class TestArchonPermission:
    def test_archon_approve_requires_archon_user(self, mgr):
        task = mgr.create_task("coding", "coding")
        with pytest.raises(PermissionError, match="Archon"):
            mgr.archon_approve(task["id"], reviewer_id="sonnet")

    def test_archon_reject_requires_archon_user(self, mgr):
        task = mgr.create_task("coding", "coding")
        with pytest.raises(PermissionError, match="Archon"):
            mgr.archon_reject(task["id"], reviewer_id="sonnet", reason="x")


class TestApprovalPermission:
    def test_approve_requires_reviewer_role(self, mgr, approval_task):
        with pytest.raises(PermissionError):
            mgr.approve_task(approval_task["id"], approver_id="sonnet")

    def test_approve_rejected_when_gate_type_mismatch(self, mgr):
        task = mgr.create_task("coding", "coding")
        with pytest.raises(PermissionError, match="不是 approval"):
            mgr.approve_task(task["id"], approver_id="glm5")


class TestSubtaskPermission:
    def test_complete_subtask_requires_assignee_or_archon(self, mgr):
        task = mgr.create_task("coding", "coding")
        tid = task["id"]
        mgr.archon_approve(tid, reviewer_id="lizeyu")
        mgr.advance_task(tid, caller_id="opus")
        mgr.db.insert_subtask(tid, "dev-api", "develop", "API", "sonnet")

        with pytest.raises(PermissionError, match="无权完成子任务"):
            mgr.complete_subtask(tid, "dev-api", caller_id="glm5", output="done")

        mgr.complete_subtask(tid, "dev-api", caller_id="sonnet", output="done")
        sub = mgr.db.get_subtasks(tid, "develop")[0]
        assert sub["status"] == "done"


@pytest.fixture
def quorum_task(mgr):
    """Insert a one-stage task with quorum gate for member-validation tests."""
    now = datetime.now(timezone.utc).isoformat()
    team = {
        "members": [
            {"role": "architect", "agentId": "opus"},
            {"role": "developer", "agentId": "sonnet"},
        ]
    }
    workflow = {
        "stages": [
            {
                "id": "vote",
                "name": "投票",
                "mode": "discuss",
                "gate": {"type": "quorum", "required": 2},
            }
        ]
    }
    with mgr.db.get_connection() as conn:
        conn.execute(
            "INSERT INTO tasks (id, version, title, type, priority, creator, state, current_stage, team, workflow, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                "OC-901",
                1,
                "quorum test",
                "quick",
                "normal",
                "archon",
                "active",
                "vote",
                json.dumps(team),
                json.dumps(workflow),
                now,
                now,
            ),
        )
    return mgr.db.get_task("OC-901")


class TestRejectPermission:
    def test_reject_requires_reviewer_role(self, mgr, approval_task):
        with pytest.raises(PermissionError):
            mgr.reject_task(approval_task["id"], rejector_id="sonnet", reason="x")

    def test_reject_rejected_when_gate_type_mismatch(self, mgr):
        task = mgr.create_task("coding", "coding")
        with pytest.raises(PermissionError, match="不是 approval"):
            mgr.reject_task(task["id"], rejector_id="glm5", reason="x")


class TestConfirmPermission:
    def test_confirm_requires_quorum_gate(self, mgr):
        task = mgr.create_task("quick", "quick")
        with pytest.raises(PermissionError, match="不是 quorum"):
            mgr.confirm_task(task["id"], voter_id="haiku", vote="approve")

    def test_confirm_requires_member(self, mgr, quorum_task):
        with pytest.raises(PermissionError, match="团队成员"):
            mgr.confirm_task(quorum_task["id"], voter_id="glm5", vote="approve")
