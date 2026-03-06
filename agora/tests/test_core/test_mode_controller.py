"""Tests for ModeController — discuss/execute mode switching."""
import pytest
from agora.core.db import DatabaseManager
from agora.core.mode_controller import ModeController


@pytest.fixture
def db(tmp_path):
    db = DatabaseManager(str(tmp_path / "test.db"))
    db.initialize()
    return db


@pytest.fixture
def mc(db):
    return ModeController(db)


@pytest.fixture
def coding_task(db):
    """Create a coding task for testing."""
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


class TestEnterDiscussMode:
    def test_records_mode_entry(self, mc, db, coding_task):
        result = mc.enter_discuss_mode("OC-001", "discuss", ["opus", "sonnet", "glm5"])
        assert result["mode"] == "discuss"
        assert result["participants"] == ["opus", "sonnet", "glm5"]

    def test_logs_state_change(self, mc, db, coding_task):
        mc.enter_discuss_mode("OC-001", "discuss", ["opus", "sonnet"])
        logs = db.get_flow_logs("OC-001")
        assert any(log["event"] == "state_change" for log in logs)


class TestEnterExecuteMode:
    def test_records_mode_and_creates_subtasks(self, mc, db, coding_task):
        subtask_defs = [
            {"id": "dev-api", "title": "后端 API", "assignee": "sonnet"},
            {"id": "dev-doc", "title": "文档", "assignee": "glm5"},
        ]
        result = mc.enter_execute_mode("OC-001", "develop", subtask_defs)
        assert result["mode"] == "execute"
        assert len(result["subtasks"]) == 2
        subs = db.get_subtasks("OC-001", "develop")
        assert len(subs) == 2
        assert all(s["status"] == "not_started" for s in subs)

    def test_logs_subtask_creation(self, mc, db, coding_task):
        subtask_defs = [{"id": "dev-api", "title": "API", "assignee": "sonnet"}]
        mc.enter_execute_mode("OC-001", "develop", subtask_defs)
        logs = db.get_flow_logs("OC-001")
        assert any("subtask_created" in log["event"] for log in logs)
