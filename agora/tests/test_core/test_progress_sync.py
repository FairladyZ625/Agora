"""Tests for ProgressSync — three-layer activity logging."""
import pytest
from agora.core.db import DatabaseManager
from agora.core.progress_sync import ProgressSync


@pytest.fixture
def db(tmp_path):
    db = DatabaseManager(str(tmp_path / "test.db"))
    db.initialize()
    return db


@pytest.fixture
def ps(db):
    return ProgressSync(db)


@pytest.fixture(autouse=True)
def seed_task(db):
    """Insert a dummy task so FK constraints are satisfied."""
    db.insert_task(
        task_id="OC-001", title="Test Task", task_type="coding",
        creator="system", team={"members": []}, workflow={"stages": []},
    )


class TestFlowLayer:
    def test_record_state_change(self, ps, db):
        ps.record_state_change("OC-001", "draft", "created", actor="system")
        logs = db.get_flow_logs("OC-001")
        assert len(logs) == 1
        assert logs[0]["event"] == "state_change"
        assert logs[0]["from_state"] == "draft"
        assert logs[0]["to_state"] == "created"

    def test_record_stage_advance(self, ps, db):
        ps.record_stage_advance("OC-001", "discuss", "develop", actor="opus")
        logs = db.get_flow_logs("OC-001")
        assert len(logs) == 1
        assert logs[0]["event"] == "stage_advance"

    def test_record_gate_result(self, ps, db):
        ps.record_gate_result("OC-001", "discuss", "archon_review", passed=True, actor="lizeyu")
        logs = db.get_flow_logs("OC-001")
        assert logs[0]["event"] == "gate_passed"

    def test_record_archon_decision(self, ps, db):
        ps.record_archon_decision("OC-001", "discuss", "approved", actor="lizeyu")
        logs = db.get_flow_logs("OC-001")
        assert logs[0]["kind"] == "archon"


class TestProgressLayer:
    def test_record_agent_report(self, ps, db):
        ps.record_agent_report("OC-001", "develop", "sonnet", "API done", artifacts=["src/auth/"])
        logs = db.connect().execute(
            "SELECT * FROM progress_log WHERE task_id='OC-001'"
        ).fetchall()
        assert len(logs) == 1
        assert logs[0]["kind"] == "progress"
        assert logs[0]["actor"] == "sonnet"

    def test_record_todos_snapshot(self, ps, db):
        todos = "1. [done] JWT 2. [in_progress] Refresh token"
        ps.record_todos_snapshot("OC-001", "develop", "sonnet", todos)
        logs = db.connect().execute(
            "SELECT * FROM progress_log WHERE task_id='OC-001' AND kind='todos'"
        ).fetchall()
        assert len(logs) == 1


class TestSystemLayer:
    def test_record_subtask_dispatched(self, ps, db):
        ps.record_subtask_event("OC-001", "develop", "dev-api", "dispatched", actor="system")
        logs = db.get_flow_logs("OC-001")
        assert logs[0]["kind"] == "system"
        assert logs[0]["event"] == "subtask_dispatched"

    def test_record_subtask_done(self, ps, db):
        ps.record_subtask_event("OC-001", "develop", "dev-api", "done", actor="sonnet")
        logs = db.get_flow_logs("OC-001")
        assert logs[0]["event"] == "subtask_done"


class TestActivityStream:
    def test_get_merged_activity(self, ps, db):
        ps.record_state_change("OC-001", "draft", "created", actor="system")
        ps.record_agent_report("OC-001", "discuss", "opus", "discussing plan")
        stream = ps.get_activity_stream("OC-001")
        assert len(stream) == 2
        assert stream[0]["layer"] == "flow"
        assert stream[1]["layer"] == "progress"
