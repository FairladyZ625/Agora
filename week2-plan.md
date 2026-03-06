# Week 2: 适配器联通 — 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **Agent Teams:** 所有 teammate 使用 Sonnet 4.6 模型，协调器使用 Opus。
> **开发规范:** TDD（先写测试再实现）、每个任务完成后提交、更新 walkthrough 文档。

**Goal:** 打通 Agora 完整编排能力 — GateKeeper 6 种 Gate、权限矩阵、三层活动流、HTTP Server、OpenClaw 插件，实现 Discord → OpenClaw → Agora 全链路。

**Architecture:** Python FastAPI HTTP Server 暴露 REST API，OpenClaw TypeScript 插件通过 HTTP 桥接调用。GateKeeper 从 StateMachine 独立，Permission 从配置文件加载，ProgressSync 统一三层日志写入。

**Tech Stack:** Python 3.11+ / FastAPI / SQLite / typer / pytest // TypeScript / OpenClaw Plugin SDK

---

## 依赖关系

```
Wave 1（并行，无依赖）
  ├── T1: GateKeeper 完整版
  ├── T2: Permission 权限矩阵
  └── T3: ProgressSync 三层活动流

Wave 2（依赖 Wave 1）
  ├── T4: ModeController + CLI 扩展（依赖 T1, T2, T3）
  └── T5: 架构文档更新 + Walkthrough（依赖 T1, T2, T3）

Wave 3（依赖 Wave 2）
  └── T6: Agora HTTP Server（依赖 T4）

Wave 4（依赖 Wave 3）
  └── T7: OpenClaw Agora Plugin（依赖 T6）

Wave 5（收尾）
  └── T8: 端到端集成测试 + Review + 提交
```

## Agent Teams 蓝图

| 成员名 | 职责 | Wave | 模型 |
|--------|------|------|------|
| `gate-builder` | T1 GateKeeper | Wave 1 | Sonnet 4.6 |
| `auth-builder` | T2 Permission | Wave 1 | Sonnet 4.6 |
| `sync-builder` | T3 ProgressSync | Wave 1 | Sonnet 4.6 |
| `core-integrator` | T4 ModeController + CLI 扩展 | Wave 2 | Sonnet 4.6 |
| `doc-writer` | T5 架构文档更新 + Walkthrough | Wave 2 | Sonnet 4.6 |
| `server-builder` | T6 HTTP Server | Wave 3 | Sonnet 4.6 |
| `plugin-builder` | T7 OpenClaw Plugin | Wave 4 | Sonnet 4.6 |
| 协调器（我） | T8 集成测试 + Review | Wave 5 | Opus |

---

## Task 1: GateKeeper 完整版

**Files:**
- Create: `agora/core/gate_keeper.py`
- Create: `agora/tests/test_core/test_gate_keeper.py`
- Modify: `agora/core/state_machine.py` — 移除内联 gate 检查，委托给 GateKeeper

**背景:** Week 1 的 `state_machine.py:check_gate()` 是 MVP 简化版（archon_review 等同于 command）。本任务实现完整的 6 种 Gate，并从 StateMachine 中独立出来。

**Step 1: 写测试 `test_gate_keeper.py`**

```python
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
```

**Step 2: 运行测试确认失败**

```bash
cd /Users/lizeyu/Projects/Agora && python -m pytest agora/tests/test_core/test_gate_keeper.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'agora.core.gate_keeper'`

**Step 3: 实现 `gate_keeper.py`**

```python
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
        approved = self.db.connect().execute(
            "SELECT COUNT(*) as cnt FROM quorum_votes WHERE task_id=? AND stage_id=? AND vote='approve'",
            (task_id, stage_id)
        ).fetchone()["cnt"]
        total = self.db.connect().execute(
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
```

**Step 4: 运行测试确认通过**

```bash
python -m pytest agora/tests/test_core/test_gate_keeper.py -v
```

**Step 5: 重构 StateMachine 委托给 GateKeeper**

修改 `agora/core/state_machine.py`：移除 `check_gate()` 方法，`advance()` 接受外部传入的 gate_passed 参数或 GateKeeper 实例。

**Step 6: 提交**

```bash
git add agora/core/gate_keeper.py agora/tests/test_core/test_gate_keeper.py agora/core/state_machine.py
git commit -m "feat: implement GateKeeper with all 6 gate types and command routing"
```

---

## Task 2: Permission 权限矩阵

**Files:**
- Create: `agora/core/permission.py`
- Create: `agora/tests/test_core/test_permission.py`

**背景:** 实现 `01-architecture.md` § 2.5 的权限矩阵。从 `agora.json` 加载配置，支持三路认证（Discord 用户 / Agent session / Archon token）。

**Step 1: 写测试 `test_permission.py`**

```python
"""Tests for Permission manager."""
import json
import pytest
from agora.core.permission import PermissionManager


@pytest.fixture
def config():
    return {
        "permissions": {
            "allowAgents": {
                "opus": {"canCall": ["sonnet", "glm5", "haiku", "claude_code"], "canAdvance": True},
                "sonnet": {"canCall": ["haiku"], "canAdvance": False},
                "glm5": {"canCall": ["haiku"], "canAdvance": False},
                "haiku": {"canCall": [], "canAdvance": False},
                "*": {"canCall": [], "canAdvance": False},
            },
            "archonUsers": ["lizeyu"],
            "commandAuth": {
                "requireAgentMatch": True,
                "requireSessionKey": True,
            },
        }
    }


@pytest.fixture
def pm(config):
    return PermissionManager(config)


class TestCanCall:
    def test_opus_can_call_sonnet(self, pm):
        assert pm.can_call("opus", "sonnet") is True

    def test_sonnet_cannot_call_opus(self, pm):
        assert pm.can_call("sonnet", "opus") is False

    def test_wildcard_fallback(self, pm):
        assert pm.can_call("unknown_agent", "sonnet") is False

    def test_haiku_cannot_call_anyone(self, pm):
        assert pm.can_call("haiku", "opus") is False


class TestCanAdvance:
    def test_opus_can_advance(self, pm):
        assert pm.can_advance("opus") is True

    def test_sonnet_cannot_advance(self, pm):
        assert pm.can_advance("sonnet") is False

    def test_archon_can_always_advance(self, pm):
        assert pm.can_advance("lizeyu") is True


class TestIsArchon:
    def test_archon_user(self, pm):
        assert pm.is_archon("lizeyu") is True

    def test_non_archon(self, pm):
        assert pm.is_archon("opus") is False


class TestIsMember:
    def test_member_check(self, pm):
        team = {"members": [{"agentId": "opus", "role": "architect"}]}
        assert pm.is_member("opus", team) is True
        assert pm.is_member("unknown", team) is False


class TestVerifySubtaskDone:
    def test_assignee_can_complete(self, pm):
        assert pm.verify_subtask_done("sonnet", "sonnet") is True

    def test_non_assignee_rejected(self, pm):
        assert pm.verify_subtask_done("opus", "sonnet") is False

    def test_archon_can_always_complete(self, pm):
        assert pm.verify_subtask_done("lizeyu", "sonnet") is True


class TestLoadFromFile:
    def test_load_config(self, tmp_path):
        config = {"permissions": {"allowAgents": {"*": {"canCall": [], "canAdvance": False}}, "archonUsers": ["admin"]}}
        path = tmp_path / "agora.json"
        path.write_text(json.dumps(config))
        pm = PermissionManager.from_file(str(path))
        assert pm.is_archon("admin") is True
```

**Step 2: 运行测试确认失败**

```bash
python -m pytest agora/tests/test_core/test_permission.py -v
```

**Step 3: 实现 `permission.py`**

```python
"""Permission manager — allowAgents 权限矩阵 + 三路认证。

从 agora.json 加载配置，校验 Agent 间调用权限、advance 权限、Archon 身份。
"""
import json
from pathlib import Path
from typing import Optional


class PermissionManager:
    """权限矩阵管理器。"""

    def __init__(self, config: dict):
        perms = config.get("permissions", {})
        self.allow_agents = perms.get("allowAgents", {})
        self.archon_users = set(perms.get("archonUsers", []))
        self.command_auth = perms.get("commandAuth", {
            "requireAgentMatch": True,
            "requireSessionKey": True,
        })

    @classmethod
    def from_file(cls, path: str) -> "PermissionManager":
        config = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(config)

    def _get_agent_perms(self, agent_id: str) -> dict:
        if agent_id in self.allow_agents:
            return self.allow_agents[agent_id]
        return self.allow_agents.get("*", {"canCall": [], "canAdvance": False})

    def can_call(self, caller: str, target: str) -> bool:
        perms = self._get_agent_perms(caller)
        return target in perms.get("canCall", [])

    def can_advance(self, caller: str) -> bool:
        if caller in self.archon_users:
            return True
        perms = self._get_agent_perms(caller)
        return perms.get("canAdvance", False)

    def is_archon(self, user_id: str) -> bool:
        return user_id in self.archon_users

    def is_member(self, agent_id: str, team: dict) -> bool:
        return any(m["agentId"] == agent_id for m in team.get("members", []))

    def verify_subtask_done(self, caller_id: str, assignee_id: str) -> bool:
        if caller_id in self.archon_users:
            return True
        if not self.command_auth.get("requireAgentMatch", True):
            return True
        return caller_id == assignee_id

    def has_role(self, agent_id: str, team: dict, role: str) -> bool:
        for m in team.get("members", []):
            if m["agentId"] == agent_id and m["role"] == role:
                return True
        return agent_id in self.archon_users
```

**Step 4: 运行测试确认通过**

```bash
python -m pytest agora/tests/test_core/test_permission.py -v
```

**Step 5: 提交**

```bash
git add agora/core/permission.py agora/tests/test_core/test_permission.py
git commit -m "feat: implement Permission manager with allowAgents matrix and auth"
```

---

## Task 3: ProgressSync 三层活动流

**Files:**
- Create: `agora/core/progress_sync.py`
- Create: `agora/tests/test_core/test_progress_sync.py`

**背景:** 统一三层活动日志写入（flow_log / progress_log / session），提供结构化的日志 API。参考 `02-task-lifecycle.md` § 5。

**Step 1: 写测试 `test_progress_sync.py`**

```python
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
        ps.record_agent_report("OC-001", "develop", "sonnet", "API 完成", artifacts=["src/auth/"])
        logs = db.connect().execute("SELECT * FROM progress_log WHERE task_id='OC-001'").fetchall()
        assert len(logs) == 1
        assert logs[0]["kind"] == "progress"
        assert logs[0]["actor"] == "sonnet"

    def test_record_todos_snapshot(self, ps, db):
        todos = "1. [done] JWT 2. [in_progress] Refresh token"
        ps.record_todos_snapshot("OC-001", "develop", "sonnet", todos)
        logs = db.connect().execute("SELECT * FROM progress_log WHERE task_id='OC-001' AND kind='todos'").fetchall()
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
        ps.record_agent_report("OC-001", "discuss", "opus", "方案讨论中")
        stream = ps.get_activity_stream("OC-001")
        assert len(stream) == 2
        assert stream[0]["layer"] == "flow"
        assert stream[1]["layer"] == "progress"
```

**Step 2: 运行测试确认失败**

**Step 3: 实现 `progress_sync.py`**

```python
"""ProgressSync — 三层活动流统一写入。

flow_log: 状态转移、Gate 判定、阶段推进
progress_log: Agent 工作汇报、待办快照
system events: 子任务派发/完成/失败
"""
import json
from typing import Optional

from .db import DatabaseManager
from .enums import ActivityKind


class ProgressSync:
    """三层活动流管理器。"""

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
        event = f"archon_{decision}"
        self.db.insert_flow_log(
            task_id, event=event, kind="archon", stage_id=stage_id,
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
        conn = self.db.connect()
        flow = conn.execute(
            "SELECT *, 'flow' as layer FROM flow_log WHERE task_id=? ORDER BY created_at",
            (task_id,)
        ).fetchall()
        progress = conn.execute(
            "SELECT *, 'progress' as layer FROM progress_log WHERE task_id=? ORDER BY created_at",
            (task_id,)
        ).fetchall()
        merged = sorted(
            [dict(r) for r in flow] + [dict(r) for r in progress],
            key=lambda x: x["created_at"]
        )
        return merged[:limit]
```

**Step 4: 运行测试确认通过**

**Step 5: 提交**

```bash
git add agora/core/progress_sync.py agora/tests/test_core/test_progress_sync.py
git commit -m "feat: implement ProgressSync three-layer activity logging"
```

---

## Task 4: ModeController + CLI 扩展

**Files:**
- Create: `agora/core/mode_controller.py`
- Create: `agora/tests/test_core/test_mode_controller.py`
- Modify: `agora/core/task_mgr.py` — 集成 GateKeeper, Permission, ProgressSync
- Modify: `agora/scripts/agora_cli.py` — 新增 approve/reject/archon-approve/archon-reject/confirm/subtask-done/force-advance/unblock 命令
- Create: `agora/tests/test_core/test_cli_integration.py`

**依赖:** T1 (GateKeeper), T2 (Permission), T3 (ProgressSync)

**背景:** ModeController 管理 discuss/execute 模式切换。CLI 扩展实现 06-commands-api.md 中的所有命令。TaskManager 重构为使用 GateKeeper + Permission + ProgressSync。

**Step 1: 写 ModeController 测试**

```python
"""Tests for ModeController."""
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


class TestEnterDiscussMode:
    def test_records_mode_entry(self, mc, db):
        result = mc.enter_discuss_mode("OC-001", "discuss", ["opus", "sonnet", "glm5"])
        assert result["mode"] == "discuss"
        assert result["participants"] == ["opus", "sonnet", "glm5"]

class TestEnterExecuteMode:
    def test_records_mode_and_creates_subtasks(self, mc, db):
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
```

**Step 2: 实现 `mode_controller.py`**

```python
"""ModeController — discuss/execute 模式切换。"""
from .db import DatabaseManager
from .progress_sync import ProgressSync


class ModeController:
    def __init__(self, db: DatabaseManager):
        self.db = db
        self.progress = ProgressSync(db)

    def enter_discuss_mode(self, task_id: str, stage_id: str,
                           participants: list[str]) -> dict:
        self.progress.record_state_change(
            task_id, from_state=stage_id, to_state=stage_id,
            actor="system", detail={"mode": "discuss", "participants": participants}
        )
        return {"mode": "discuss", "participants": participants, "stage_id": stage_id}

    def enter_execute_mode(self, task_id: str, stage_id: str,
                           subtask_defs: list[dict]) -> dict:
        created = []
        for st in subtask_defs:
            self.db.insert_subtask(task_id, st["id"], stage_id, st["title"], st["assignee"])
            self.progress.record_subtask_event(task_id, stage_id, st["id"], "created")
            created.append(st)
        return {"mode": "execute", "stage_id": stage_id, "subtasks": created}
```

**Step 3: 重构 TaskManager 集成新模块**

修改 `task_mgr.py`：
- `__init__` 接受 `PermissionManager` 和 config
- `advance_task` 使用 `GateKeeper.check_gate()` 替代 `StateMachine.check_gate()`
- 新增方法: `approve_task`, `reject_task`, `archon_approve`, `archon_reject`, `confirm_task`, `complete_subtask`, `force_advance`, `unblock_task`
- 所有状态变更通过 `ProgressSync` 记录

**Step 4: 扩展 CLI 命令**

在 `agora_cli.py` 新增命令：
- `agora approve <task_id> [--comment]`
- `agora reject <task_id> --reason`
- `agora archon-approve <task_id> [--comment]`
- `agora archon-reject <task_id> --reason`
- `agora confirm <task_id> [--vote approve|reject]`
- `agora subtask-done <task_id> <subtask_id> [--output]`
- `agora force-advance <task_id> --reason`
- `agora unblock <task_id> [--reason]`
- `agora pause <task_id> [--reason]`
- `agora resume <task_id>`
- `agora cancel <task_id> [--reason]`

**Step 5: 写 CLI 集成测试**

```python
"""CLI integration tests — full lifecycle through CLI commands."""
import subprocess
import pytest


def run_cli(*args) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["python", "-m", "agora.scripts.agora_cli"] + list(args),
        capture_output=True, text=True, cwd="/Users/lizeyu/Projects/Agora"
    )


class TestFullLifecycle:
    def test_coding_task_lifecycle(self, tmp_path):
        # Create
        r = run_cli("create", "--type", "quick", "测试任务")
        assert "OC-001" in r.stdout
        # Advance
        r = run_cli("advance", "OC-001")
        assert "已完成" in r.stdout or "已推进" in r.stdout
```

**Step 6: 提交**

```bash
git add agora/core/mode_controller.py agora/core/task_mgr.py agora/scripts/agora_cli.py agora/tests/
git commit -m "feat: integrate GateKeeper/Permission/ProgressSync, extend CLI with all task commands"
```

---

## Task 5: 架构文档更新 + Walkthrough

**Files:**
- Create: `docs/walkthrough/README.md`
- Create: `docs/walkthrough/week1-core-skeleton.md`
- Create: `docs/walkthrough/week2-adapter-integration.md`
- Modify: `docs/01-PLANS/01-architecture.md` — 更新适配层描述（插件方式，非源码修改）
- Modify: `docs/01-PLANS/07-implementation-plan.md` — 更新 Phase 0 实际完成情况

**依赖:** T1, T2, T3（需要了解实际实现才能写文档）

**Step 1: 创建 walkthrough 目录和 README**

```markdown
# Agora 开发 Walkthrough

按周记录 Agora 的开发过程、架构决策和实现总结。

| 周次 | 主题 | 文档 |
|------|------|------|
| Week 1 | 核心骨架 — DB + StateMachine + CLI | [week1-core-skeleton.md](week1-core-skeleton.md) |
| Week 2 | 适配器联通 — Gate + Permission + Server + Plugin | [week2-adapter-integration.md](week2-adapter-integration.md) |
```

**Step 2: 写 Week 1 walkthrough**

总结 Week 1 的开发过程：项目脚手架、枚举定义、SQLite schema、TaskMgr、StateMachine、CLI。记录关键决策（MVP 简化、archon_review 降级为 command 等）。

**Step 3: 写 Week 2 walkthrough**

记录 Week 2 的架构变更：GateKeeper 独立、Permission 模块、ProgressSync 三层活动流、HTTP Server 架构、OpenClaw 插件方案（不改源码，用 Plugin SDK）。

**Step 4: 更新架构文档**

修改 `01-architecture.md` § 4.2：
- 明确 OpenClaw Adapter 是通过 Plugin SDK 实现，不修改 OpenClaw 源码
- 新增 HTTP API 桥接架构说明
- 更新组件图

修改 `07-implementation-plan.md`：
- Phase 0 标记为已完成，记录实际产出
- 更新 Phase 1a 进度

**Step 5: 提交**

```bash
git add docs/walkthrough/ docs/01-PLANS/01-architecture.md docs/01-PLANS/07-implementation-plan.md
git commit -m "docs: add walkthrough docs, update architecture for plugin-based adapter"
```

---

## Task 6: Agora HTTP Server

**Files:**
- Create: `agora/server/__init__.py`
- Create: `agora/server/app.py`
- Create: `agora/server/routes.py`
- Create: `agora/tests/test_server/__init__.py`
- Create: `agora/tests/test_server/test_routes.py`
- Modify: `pyproject.toml` — 添加 fastapi, uvicorn 依赖

**依赖:** T4 (TaskManager 集成完成)

**背景:** FastAPI HTTP Server 暴露 REST API，供 OpenClaw 插件和 Dashboard 调用。

**Step 1: 更新 pyproject.toml**

添加依赖：`fastapi>=0.110.0`, `uvicorn>=0.27.0`

**Step 2: 写路由测试**

```python
"""Tests for Agora HTTP Server routes."""
import pytest
from fastapi.testclient import TestClient
from agora.server.app import create_app


@pytest.fixture
def client(tmp_path):
    app = create_app(db_path=str(tmp_path / "test.db"))
    return TestClient(app)


class TestTaskRoutes:
    def test_create_task(self, client):
        r = client.post("/api/tasks", json={"title": "测试", "type": "quick"})
        assert r.status_code == 200
        assert r.json()["id"].startswith("OC-")
        assert r.json()["state"] == "active"

    def test_get_task(self, client):
        r = client.post("/api/tasks", json={"title": "测试", "type": "quick"})
        task_id = r.json()["id"]
        r = client.get(f"/api/tasks/{task_id}")
        assert r.status_code == 200
        assert r.json()["title"] == "测试"

    def test_list_tasks(self, client):
        client.post("/api/tasks", json={"title": "T1", "type": "quick"})
        client.post("/api/tasks", json={"title": "T2", "type": "quick"})
        r = client.get("/api/tasks")
        assert len(r.json()) == 2

    def test_advance_task(self, client):
        r = client.post("/api/tasks", json={"title": "测试", "type": "quick"})
        task_id = r.json()["id"]
        r = client.post(f"/api/tasks/{task_id}/advance", json={"caller_id": "archon"})
        assert r.status_code == 200
        assert r.json()["state"] == "done"

    def test_get_task_not_found(self, client):
        r = client.get("/api/tasks/OC-999")
        assert r.status_code == 404

    def test_task_status(self, client):
        r = client.post("/api/tasks", json={"title": "测试", "type": "quick"})
        task_id = r.json()["id"]
        r = client.get(f"/api/tasks/{task_id}/status")
        assert r.status_code == 200
        assert "flow_log" in r.json()

    def test_list_tasks_by_state(self, client):
        client.post("/api/tasks", json={"title": "T1", "type": "quick"})
        r = client.get("/api/tasks?state=active")
        assert len(r.json()) == 1


class TestGateRoutes:
    def test_archon_approve(self, client):
        r = client.post("/api/tasks", json={"title": "测试", "type": "coding"})
        task_id = r.json()["id"]
        r = client.post(f"/api/tasks/{task_id}/archon-approve", json={"reviewer_id": "lizeyu"})
        assert r.status_code == 200

    def test_subtask_done(self, client):
        r = client.post("/api/tasks", json={"title": "测试", "type": "coding"})
        task_id = r.json()["id"]
        # Advance past discuss to develop (archon_review simplified)
        client.post(f"/api/tasks/{task_id}/archon-approve", json={"reviewer_id": "lizeyu"})
        client.post(f"/api/tasks/{task_id}/advance", json={"caller_id": "archon"})
        # Now in develop stage — subtask-done
        r = client.post(f"/api/tasks/{task_id}/subtask-done", json={
            "subtask_id": "dev-api", "caller_id": "sonnet", "output": "done"
        })
        assert r.status_code in (200, 404)  # 404 if no subtasks defined


class TestHealthRoute:
    def test_health(self, client):
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
```

**Step 3: 实现 `app.py` 和 `routes.py`**

`app.py`:
```python
"""Agora HTTP Server — FastAPI application factory."""
from fastapi import FastAPI
from .routes import create_router


def create_app(db_path: str = "tasks.db", config_path: str = None) -> FastAPI:
    app = FastAPI(title="Agora", description="Multi-Agent Democratic Orchestration API")
    router = create_router(db_path, config_path)
    app.include_router(router, prefix="/api")
    return app
```

`routes.py`: 实现所有 REST 端点：
- `POST /api/tasks` — 创建任务
- `GET /api/tasks` — 列出任务
- `GET /api/tasks/{id}` — 获取任务
- `GET /api/tasks/{id}/status` — 任务状态详情（含 flow_log）
- `POST /api/tasks/{id}/advance` — 推进
- `POST /api/tasks/{id}/approve` — 审批通过
- `POST /api/tasks/{id}/reject` — 审批打回
- `POST /api/tasks/{id}/archon-approve` — Archon 审批
- `POST /api/tasks/{id}/archon-reject` — Archon 驳回
- `POST /api/tasks/{id}/confirm` — Quorum 投票
- `POST /api/tasks/{id}/subtask-done` — 子任务完成
- `POST /api/tasks/{id}/force-advance` — 强制推进
- `POST /api/tasks/{id}/pause` — 暂停
- `POST /api/tasks/{id}/resume` — 恢复
- `POST /api/tasks/{id}/cancel` — 取消
- `POST /api/tasks/{id}/unblock` — 解除阻塞
- `POST /api/tasks/cleanup` — 清理 orphaned
- `GET /api/health` — 健康检查

**Step 4: 运行测试确认通过**

```bash
pip install fastapi uvicorn httpx && python -m pytest agora/tests/test_server/ -v
```

**Step 5: 添加启动脚本到 CLI**

在 `agora_cli.py` 添加 `agora serve` 命令：
```python
@app.command()
def serve(host: str = "127.0.0.1", port: int = 8420):
    """启动 Agora HTTP Server。"""
    import uvicorn
    from agora.server.app import create_app
    application = create_app()
    uvicorn.run(application, host=host, port=port)
```

**Step 6: 提交**

```bash
git add agora/server/ agora/tests/test_server/ pyproject.toml agora/scripts/agora_cli.py
git commit -m "feat: implement Agora HTTP Server with FastAPI REST API"
```

---

## Task 7: OpenClaw Agora Plugin

**Files:**
- Create: `extensions/agora-plugin/package.json`
- Create: `extensions/agora-plugin/tsconfig.json`
- Create: `extensions/agora-plugin/openclaw.plugin.json`
- Create: `extensions/agora-plugin/src/index.ts`
- Create: `extensions/agora-plugin/src/commands.ts`
- Create: `extensions/agora-plugin/src/bridge.ts`

**依赖:** T6 (HTTP Server 运行中)

**背景:** OpenClaw 插件通过 Plugin SDK 注册 `/task` 命令，通过 HTTP 调用 Agora Server。不修改 OpenClaw 源码。

**Step 1: 创建插件项目结构**

`openclaw.plugin.json`:
```json
{
  "id": "agora",
  "name": "Agora Orchestration",
  "description": "Multi-Agent Democratic Orchestration for OpenClaw",
  "configSchema": {
    "type": "object",
    "properties": {
      "serverUrl": { "type": "string", "default": "http://127.0.0.1:8420" }
    }
  },
  "uiHints": {
    "serverUrl": {
      "label": "Agora Server URL",
      "help": "HTTP endpoint of the Agora Python server"
    }
  }
}
```

**Step 2: 实现 HTTP Bridge**

`bridge.ts`:
```typescript
export class AgoraBridge {
  constructor(private serverUrl: string) {}

  async createTask(title: string, type: string, creator?: string): Promise<any> {
    const res = await fetch(`${this.serverUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, type, creator: creator || "archon" }),
    });
    return res.json();
  }

  async advanceTask(taskId: string, callerId: string): Promise<any> { ... }
  async getTask(taskId: string): Promise<any> { ... }
  async listTasks(state?: string): Promise<any> { ... }
  async archonApprove(taskId: string, reviewerId: string, comment?: string): Promise<any> { ... }
  async archonReject(taskId: string, reviewerId: string, reason: string): Promise<any> { ... }
  async approve(taskId: string, approverId: string, comment?: string): Promise<any> { ... }
  async reject(taskId: string, approverId: string, reason: string): Promise<any> { ... }
  async confirm(taskId: string, voterId: string, vote?: string): Promise<any> { ... }
  async subtaskDone(taskId: string, subtaskId: string, callerId: string, output?: string): Promise<any> { ... }
  async forceAdvance(taskId: string, reason: string): Promise<any> { ... }
  // ... 其他方法
}
```

**Step 3: 注册 /task 命令**

`commands.ts`:
```typescript
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { AgoraBridge } from "./bridge";

export function registerTaskCommands(api: OpenClawPluginApi, bridge: AgoraBridge) {
  api.registerCommand({
    name: "task",
    description: "Agora task management — create/advance/status/list/approve/reject",
    acceptsArgs: true,
    requireAuth: false,  // 内部做权限校验
    handler: async (ctx) => {
      const args = (ctx.args || "").trim();
      const [subcommand, ...rest] = args.split(/\s+/);
      const senderId = ctx.senderId || ctx.from || "unknown";

      switch (subcommand) {
        case "create": return handleCreate(bridge, rest, senderId);
        case "advance": return handleAdvance(bridge, rest, senderId);
        case "status": return handleStatus(bridge, rest);
        case "list": return handleList(bridge, rest);
        case "approve": return handleApprove(bridge, rest, senderId);
        case "reject": return handleReject(bridge, rest, senderId);
        case "archon-approve": return handleArchonApprove(bridge, rest, senderId);
        case "archon-reject": return handleArchonReject(bridge, rest, senderId);
        case "confirm": return handleConfirm(bridge, rest, senderId);
        case "subtask-done": return handleSubtaskDone(bridge, rest, senderId);
        case "force-advance": return handleForceAdvance(bridge, rest, senderId);
        case "cleanup": return handleCleanup(bridge, rest);
        default: return { text: formatHelp() };
      }
    },
  });
}
```

**Step 4: 插件入口**

`index.ts`:
```typescript
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { AgoraBridge } from "./bridge";
import { registerTaskCommands } from "./commands";

export default function register(api: OpenClawPluginApi) {
  const serverUrl = (api.pluginConfig as any)?.serverUrl || "http://127.0.0.1:8420";
  const bridge = new AgoraBridge(serverUrl);

  registerTaskCommands(api, bridge);

  api.logger.info(`Agora plugin loaded, server: ${serverUrl}`);
}
```

**Step 5: 构建和安装**

```bash
cd extensions/agora-plugin && npm install && npm run build
# 在 openclaw.json 中配置:
# "plugins": { "allow": ["agora"], "entries": { "agora": { "config": { "serverUrl": "http://127.0.0.1:8420" } } } }
```

**Step 6: 提交**

```bash
git add extensions/agora-plugin/
git commit -m "feat: implement OpenClaw Agora plugin with /task commands via HTTP bridge"
```

---

## Task 8: 端到端集成测试 + Review + 提交

**由协调器（Opus）直接执行。**

**验证清单:**
1. `agora serve` 启动 HTTP Server
2. `agora create --type coding "测试任务"` → OC-001 创建成功
3. `agora archon-approve OC-001` → archon_review Gate 通过
4. `agora advance OC-001` → discuss → develop
5. `agora subtask-done OC-001 dev-api --output "完成"` → 子任务完成
6. `agora advance OC-001` → develop → review（all_subtasks_done Gate）
7. `agora approve OC-001` → approval Gate 通过
8. `agora advance OC-001` → 任务完成
9. `agora list --state done` → 显示已完成任务
10. `agora status OC-001` → flow_log 完整记录
11. HTTP API: `curl http://127.0.0.1:8420/api/tasks` → JSON 响应
12. 所有 pytest 通过: `python -m pytest agora/tests/ -v`

**代码审查:**
- 检查所有模块间接口一致性
- 检查错误处理覆盖
- 检查 flow_log 记录完整性

**最终提交:**
```bash
git add -A && git commit -m "feat: Week 2 — GateKeeper, Permission, ProgressSync, HTTP Server, OpenClaw Plugin"
```

---

## 验收标准（Week 2 完成条件）

1. 6 种 Gate 全部可工作（command, archon_review, all_subtasks_done, approval, auto_timeout, quorum）
2. 权限矩阵从配置文件加载，正确校验 Agent 权限
3. 三层活动流完整记录（flow_log + progress_log）
4. CLI 支持所有 /task 命令（12+ 个子命令）
5. HTTP Server 暴露 REST API，可被外部调用
6. OpenClaw 插件注册 /task 命令，通过 HTTP 桥接到 Python Core
7. 所有测试通过
8. 架构文档已更新，walkthrough 文档已创建
