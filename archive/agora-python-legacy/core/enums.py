"""Agora canonical enums — single source of truth.

All enum values MUST match docs/01-PLANS/ENUMS.md exactly.
"""
from enum import Enum


class TaskState(str, Enum):
    """任务顶层状态"""
    DRAFT = "draft"
    CREATED = "created"
    ACTIVE = "active"
    BLOCKED = "blocked"
    PAUSED = "paused"
    DONE = "done"
    CANCELLED = "cancelled"
    ORPHANED = "orphaned"


class SubtaskState(str, Enum):
    """子任务状态"""
    NOT_STARTED = "not_started"
    DISPATCHED = "dispatched"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    FAILED = "failed"
    RETRYING = "retrying"
    ESCALATED = "escalated"


class CollaborationMode(str, Enum):
    """协作模式"""
    DISCUSS = "discuss"
    INDEPENDENT_EXECUTE = "execute"


class GateType(str, Enum):
    """Gate 类型"""
    ARCHON_REVIEW = "archon_review"
    COMMAND = "command"
    ALL_SUBTASKS_DONE = "all_subtasks_done"
    APPROVAL = "approval"
    AUTO_TIMEOUT = "auto_timeout"
    QUORUM = "quorum"


class AgentRole(str, Enum):
    """Agent 角色"""
    ARCHITECT = "architect"
    DEVELOPER = "developer"
    REVIEWER = "reviewer"
    WRITER = "writer"
    RESEARCHER = "researcher"
    ANALYST = "analyst"
    EXECUTOR = "executor"
    CRAFTSMAN = "craftsman"


class DispatchStatus(str, Enum):
    """调度状态"""
    QUEUED = "queued"
    SUCCESS = "success"
    FAILED = "failed"
    TIMEOUT = "timeout"
    GATEWAY_OFFLINE = "gateway_offline"
    ERROR = "error"


class EscalationLevel(int, Enum):
    """升级级别"""
    NONE = 0
    RETRY = 1
    NOTIFY = 2
    ROLLBACK = 3
    HUMAN = 4


class ActivityKind(str, Enum):
    """活动类型"""
    FLOW = "flow"
    PROGRESS = "progress"
    TODOS = "todos"
    ASSISTANT = "assistant"
    TOOL_RESULT = "tool_result"
    USER = "user"
    SYSTEM = "system"
    ARCHON = "archon"


class GovernancePreset(str, Enum):
    """治理预设"""
    LEAN = "lean"
    STANDARD = "standard"
    STRICT = "strict"
    CUSTOM = "custom"


class CraftsmanType(str, Enum):
    """工匠类型"""
    CLAUDE_CODE = "claude_code"
    CODEX = "codex"
    GEMINI_CLI = "gemini_cli"
    CUSTOM = "custom"


class TaskType(str, Enum):
    """任务类型"""
    CODING = "coding"
    CODING_HEAVY = "coding_heavy"
    RESEARCH = "research"
    DOCUMENT = "document"
    QUICK = "quick"
    BRAINSTORM = "brainstorm"
    CUSTOM = "custom"


class TaskPriority(str, Enum):
    """任务优先级"""
    HIGH = "high"
    NORMAL = "normal"
    LOW = "low"
