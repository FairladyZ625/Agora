"""Tests for StateMachine gate checks."""
from agora.core.db import DatabaseManager
from agora.core.state_machine import StateMachine
from agora.core.task_mgr import TaskManager


def _build_manager(tmp_path, config=None):
    db = DatabaseManager(db_path=str(tmp_path / "sm.db"))
    db.initialize()
    return TaskManager(db, config=config or {})


class TestStateMachineArchonReviewGate:
    def test_archon_review_requires_approved_record(self, tmp_path):
        mgr = _build_manager(tmp_path, config={"permissions": {"archonUsers": ["lizeyu"]}})
        task = mgr.create_task("测试 archon gate", "coding", creator="lizeyu")

        stage = mgr.state_machine.get_current_stage(task["workflow"], task["current_stage"])
        assert stage["gate"]["type"] == "archon_review"

        # No archon review record yet -> must fail even with caller_id.
        assert mgr.state_machine.check_gate(mgr.db, task, stage, caller_id="opus") is False

        # Rejected review still fails.
        mgr.gate_keeper.record_archon_review(task["id"], task["current_stage"], "rejected", "lizeyu", "x")
        assert mgr.state_machine.check_gate(mgr.db, task, stage, caller_id="opus") is False

        # Approved review passes.
        mgr.gate_keeper.record_archon_review(task["id"], task["current_stage"], "approved", "lizeyu", "ok")
        assert mgr.state_machine.check_gate(mgr.db, task, stage, caller_id="opus") is True
