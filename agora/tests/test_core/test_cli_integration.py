"""CLI integration tests — TaskManager methods through full lifecycle."""
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
                "*": {"canCall": [], "canAdvance": False},
            },
        }
    })


class TestCreateAndAdvance:
    def test_create_quick_task(self, mgr):
        task = mgr.create_task("快速测试", "quick")
        assert task["id"] == "OC-001"
        assert task["state"] == "active"
        assert task["current_stage"] == "execute"

    def test_advance_quick_task_to_done(self, mgr):
        task = mgr.create_task("快速测试", "quick")
        task = mgr.advance_task(task["id"], caller_id="archon")
        assert task["state"] == "done"

    def test_create_coding_task(self, mgr):
        task = mgr.create_task("编码任务", "coding")
        assert task["state"] == "active"
        assert task["current_stage"] == "discuss"


class TestArchonReviewFlow:
    def test_archon_approve_then_advance(self, mgr):
        task = mgr.create_task("编码任务", "coding")
        tid = task["id"]
        mgr.archon_approve(tid, reviewer_id="lizeyu", comment="LGTM")
        task = mgr.advance_task(tid, caller_id="opus")
        assert task["current_stage"] == "develop"

    def test_archon_reject_blocks_advance(self, mgr):
        task = mgr.create_task("编码任务", "coding")
        tid = task["id"]
        mgr.archon_reject(tid, reviewer_id="lizeyu", reason="需要修改")
        with pytest.raises(PermissionError):
            mgr.advance_task(tid, caller_id="opus")


class TestSubtaskFlow:
    def test_complete_subtask_then_advance(self, mgr):
        task = mgr.create_task("编码任务", "coding")
        tid = task["id"]
        mgr.archon_approve(tid, "lizeyu")
        task = mgr.advance_task(tid, caller_id="opus")
        assert task["current_stage"] == "develop"
        mgr.db.insert_subtask(tid, "dev-api", "develop", "API", "sonnet")
        mgr.db.insert_subtask(tid, "dev-doc", "develop", "文档", "glm5")
        mgr.complete_subtask(tid, "dev-api", caller_id="sonnet", output="done")
        mgr.complete_subtask(tid, "dev-doc", caller_id="glm5", output="done")
        task = mgr.advance_task(tid, caller_id="opus")
        assert task["current_stage"] == "review"

    def test_incomplete_subtask_blocks_advance(self, mgr):
        task = mgr.create_task("编码任务", "coding")
        tid = task["id"]
        mgr.archon_approve(tid, "lizeyu")
        task = mgr.advance_task(tid, caller_id="opus")
        mgr.db.insert_subtask(tid, "dev-api", "develop", "API", "sonnet")
        with pytest.raises(PermissionError):
            mgr.advance_task(tid, caller_id="opus")


class TestApprovalFlow:
    def test_approve_then_advance(self, mgr):
        task = mgr.create_task("编码任务", "coding")
        tid = task["id"]
        mgr.archon_approve(tid, "lizeyu")
        mgr.advance_task(tid, caller_id="opus")
        task = mgr.advance_task(tid, caller_id="opus")
        assert task["current_stage"] == "review"
        mgr.archon_approve(tid, "lizeyu")
        task = mgr.advance_task(tid, caller_id="opus")
        assert task["state"] == "done"


class TestForceAdvance:
    def test_force_advance_bypasses_gate(self, mgr):
        task = mgr.create_task("编码任务", "coding")
        tid = task["id"]
        task = mgr.force_advance(tid, reason="紧急")
        assert task["current_stage"] == "develop"

    def test_force_advance_to_done(self, mgr):
        task = mgr.create_task("快速测试", "quick")
        tid = task["id"]
        task = mgr.force_advance(tid, reason="跳过")
        assert task["state"] == "done"


class TestPauseResumeCancel:
    def test_pause_and_resume(self, mgr):
        task = mgr.create_task("快速测试", "quick")
        tid = task["id"]
        task = mgr.pause_task(tid, reason="等待")
        assert task["state"] == "paused"
        task = mgr.resume_task(tid)
        assert task["state"] == "active"

    def test_cancel_task(self, mgr):
        task = mgr.create_task("快速测试", "quick")
        tid = task["id"]
        task = mgr.cancel_task(tid, reason="不需要了")
        assert task["state"] == "cancelled"

    def test_cannot_resume_active_task(self, mgr):
        task = mgr.create_task("快速测试", "quick")
        task = mgr.resume_task(task["id"])
        assert task["state"] == "active"


class TestUnblock:
    def test_unblock_blocked_task(self, mgr):
        task = mgr.create_task("快速测试", "quick")
        tid = task["id"]
        mgr.update_task_state(tid, "blocked", reason="依赖")
        task = mgr.db.get_task(tid)
        assert task["state"] == "blocked"
        task = mgr.unblock_task(tid, reason="依赖已解决")
        assert task["state"] == "active"


class TestConfirmQuorum:
    def test_quorum_vote(self, mgr):
        task = mgr.create_task("快速测试", "quick")
        tid = task["id"]
        result = mgr.confirm_task(tid, voter_id="opus", vote="approve")
        assert result["quorum"]["approved"] == 1
        assert result["quorum"]["total"] == 1


class TestRejectTask:
    def test_reject_records_log(self, mgr):
        task = mgr.create_task("快速测试", "quick")
        tid = task["id"]
        mgr.reject_task(tid, rejector_id="glm5", reason="质量不够")
        logs = mgr.db.get_flow_logs(tid)
        assert any(log["event"] == "rejected" for log in logs)
