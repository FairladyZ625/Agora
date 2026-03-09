"""Tests for GateKeeper — all 6 gate types."""
import pytest
from agora.core.db import DatabaseManager
from agora.core.gate_keeper import GateKeeper


@pytest.fixture
def db(tmp_path):
    db = DatabaseManager(str(tmp_path / "test.db"))
    db.initialize()
    return db


@pytest.fixture
def gk(db):
    return GateKeeper(db)


@pytest.fixture
def coding_task(db):
    """Create a coding task with 3 stages for testing."""
    import json
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    team = {"members": [
        {"role": "architect", "agentId": "opus"},
        {"role": "developer", "agentId": "sonnet"},
        {"role": "reviewer", "agentId": "glm5"},
    ]}
    workflow = {"stages": [
        {"id": "discuss", "name": "讨论", "mode": "discuss", "gate": {"type": "archon_review"}},
        {"id": "develop", "name": "开发", "mode": "execute", "gate": {"type": "all_subtasks_done"}},
        {"id": "review", "name": "审查", "mode": "discuss", "gate": {"type": "approval", "approver_role": "reviewer"}},
    ]}
    with db.get_connection() as conn:
        conn.execute(
            "INSERT INTO tasks (id, version, title, type, priority, creator, state, current_stage, team, workflow, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            ("OC-001", 1, "Test", "coding", "normal", "archon", "active", "discuss",
             json.dumps(team), json.dumps(workflow), now, now)
        )
    return db.get_task("OC-001")


class TestCommandGate:
    def test_passes_with_team_member(self, gk, coding_task):
        stage = {"id": "x", "gate": {"type": "command"}}
        assert gk.check_gate(coding_task, stage, caller_id="opus") is True

    def test_fails_without_caller(self, gk, coding_task):
        stage = {"id": "x", "gate": {"type": "command"}}
        assert gk.check_gate(coding_task, stage, caller_id=None) is False

    def test_fails_with_non_member(self, gk, coding_task):
        stage = {"id": "x", "gate": {"type": "command"}}
        with pytest.raises(PermissionError):
            gk.check_gate(coding_task, stage, caller_id="unknown_agent")


class TestArchonReviewGate:
    def test_fails_without_review(self, gk, coding_task):
        stage = {"id": "discuss", "gate": {"type": "archon_review"}}
        assert gk.check_gate(coding_task, stage) is False

    def test_passes_after_approval(self, gk, db, coding_task):
        stage = {"id": "discuss", "gate": {"type": "archon_review"}}
        with db.get_connection() as conn:
            conn.execute(
                "INSERT INTO archon_reviews (task_id, stage_id, decision, reviewer_id) VALUES (?,?,?,?)",
                ("OC-001", "discuss", "approved", "lizeyu")
            )
        assert gk.check_gate(coding_task, stage) is True

    def test_fails_after_rejection(self, gk, db, coding_task):
        stage = {"id": "discuss", "gate": {"type": "archon_review"}}
        with db.get_connection() as conn:
            conn.execute(
                "INSERT INTO archon_reviews (task_id, stage_id, decision, reviewer_id) VALUES (?,?,?,?)",
                ("OC-001", "discuss", "rejected", "lizeyu")
            )
        assert gk.check_gate(coding_task, stage) is False


class TestAllSubtasksDoneGate:
    def test_passes_when_no_subtasks(self, gk, coding_task):
        stage = {"id": "develop", "gate": {"type": "all_subtasks_done"}}
        assert gk.check_gate(coding_task, stage) is True

    def test_fails_when_subtask_pending(self, gk, db, coding_task):
        db.insert_subtask("OC-001", "dev-api", "develop", "API", "sonnet")
        stage = {"id": "develop", "gate": {"type": "all_subtasks_done"}}
        assert gk.check_gate(coding_task, stage) is False

    def test_passes_when_all_done(self, gk, db, coding_task):
        db.insert_subtask("OC-001", "dev-api", "develop", "API", "sonnet")
        db.update_subtask("OC-001", "dev-api", status="done")
        stage = {"id": "develop", "gate": {"type": "all_subtasks_done"}}
        assert gk.check_gate(coding_task, stage) is True


class TestApprovalGate:
    def test_fails_without_approval(self, gk, coding_task):
        stage = {"id": "review", "gate": {"type": "approval", "approver_role": "reviewer"}}
        assert gk.check_gate(coding_task, stage) is False

    def test_passes_after_approval(self, gk, db, coding_task):
        stage = {"id": "review", "gate": {"type": "approval", "approver_role": "reviewer"}}
        with db.get_connection() as conn:
            conn.execute(
                "INSERT INTO approvals (task_id, stage_id, approver_role, approver_id) VALUES (?,?,?,?)",
                ("OC-001", "review", "reviewer", "glm5")
            )
        assert gk.check_gate(coding_task, stage) is True


class TestQuorumGate:
    def test_fails_below_quorum(self, gk, db, coding_task):
        stage = {"id": "x", "gate": {"type": "quorum", "required": 2}}
        with db.get_connection() as conn:
            conn.execute(
                "INSERT INTO quorum_votes (task_id, stage_id, voter_id, vote) VALUES (?,?,?,?)",
                ("OC-001", "x", "opus", "approve")
            )
        assert gk.check_gate(coding_task, stage) is False

    def test_passes_at_quorum(self, gk, db, coding_task):
        stage = {"id": "x", "gate": {"type": "quorum", "required": 2}}
        with db.get_connection() as conn:
            conn.execute("INSERT INTO quorum_votes (task_id, stage_id, voter_id, vote) VALUES (?,?,?,?)", ("OC-001", "x", "opus", "approve"))
            conn.execute("INSERT INTO quorum_votes (task_id, stage_id, voter_id, vote) VALUES (?,?,?,?)", ("OC-001", "x", "sonnet", "approve"))
        assert gk.check_gate(coding_task, stage) is True

    def test_reject_votes_dont_count(self, gk, db, coding_task):
        stage = {"id": "x", "gate": {"type": "quorum", "required": 2}}
        with db.get_connection() as conn:
            conn.execute("INSERT INTO quorum_votes (task_id, stage_id, voter_id, vote) VALUES (?,?,?,?)", ("OC-001", "x", "opus", "approve"))
            conn.execute("INSERT INTO quorum_votes (task_id, stage_id, voter_id, vote) VALUES (?,?,?,?)", ("OC-001", "x", "glm5", "reject"))
        assert gk.check_gate(coding_task, stage) is False


class TestAutoTimeoutGate:
    def test_fails_before_timeout(self, gk, db, coding_task):
        db.enter_stage("OC-001", "discuss")
        stage = {"id": "discuss", "gate": {"type": "auto_timeout", "timeout_sec": 3600}}
        assert gk.check_gate(coding_task, stage) is False


class TestGateCommandRouting:
    def test_approve_rejected_on_archon_gate(self, gk, coding_task):
        stage = {"id": "discuss", "gate": {"type": "archon_review"}}
        with pytest.raises(PermissionError, match="不是 approval"):
            gk.route_gate_command(coding_task, stage, "/task approve", "glm5")

    def test_archon_approve_rejected_on_approval_gate(self, gk, coding_task):
        stage = {"id": "review", "gate": {"type": "approval", "approver_role": "reviewer"}}
        with pytest.raises(PermissionError, match="不是 archon_review"):
            gk.route_gate_command(coding_task, stage, "/task archon-approve", "lizeyu")

    def test_advance_rejected_on_archon_gate(self, gk, coding_task):
        stage = {"id": "discuss", "gate": {"type": "archon_review"}}
        with pytest.raises(PermissionError, match="不是 command"):
            gk.route_gate_command(coding_task, stage, "/task advance", "opus")
