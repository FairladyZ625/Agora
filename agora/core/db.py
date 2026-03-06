"""Agora SQLite database manager.

WAL mode for concurrent reads, optimistic locking via version field,
ACID transactions for all writes.
"""
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


class DatabaseManager:
    """SQLite database manager with WAL mode and optimistic locking."""

    def __init__(self, db_path: str = "tasks.db", check_same_thread: bool = True):
        self.db_path = db_path
        self.check_same_thread = check_same_thread
        self._conn: Optional[sqlite3.Connection] = None

    def connect(self) -> sqlite3.Connection:
        """Create connection with WAL mode and row factory."""
        if self._conn is None:
            self._conn = sqlite3.connect(
                self.db_path, check_same_thread=self.check_same_thread
            )
            self._conn.row_factory = sqlite3.Row
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
        return self._conn

    def initialize(self):
        """Execute DDL from migration file (idempotent via IF NOT EXISTS)."""
        conn = self.connect()
        migration_path = Path(__file__).parent / "migrations" / "001_initial.sql"
        sql = migration_path.read_text()
        conn.executescript(sql)

    @contextmanager
    def get_connection(self):
        """Context manager for database connection."""
        conn = self.connect()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise

    def close(self):
        """Close database connection."""
        if self._conn:
            self._conn.close()
            self._conn = None

    # ── Task CRUD ──

    def insert_task(self, task_id: str, title: str, task_type: str,
                    creator: str, team: dict, workflow: dict,
                    priority: str = "normal", description: str = "",
                    scheduler: Optional[dict] = None) -> dict:
        """Insert a new task in draft state."""
        now = datetime.now(timezone.utc).isoformat()
        with self.get_connection() as conn:
            conn.execute("""
                INSERT INTO tasks (id, title, description, type, priority, creator,
                                   state, team, workflow, scheduler, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
            """, (task_id, title, description, task_type, priority, creator,
                  json.dumps(team), json.dumps(workflow),
                  json.dumps(scheduler) if scheduler else None,
                  now, now))
        return self.get_task(task_id)

    def get_task(self, task_id: str) -> Optional[dict]:
        """Get task by ID, parsing JSON fields."""
        conn = self.connect()
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if row is None:
            return None
        return self._parse_task_row(row)

    def list_tasks(self, state_filter: Optional[str] = None) -> list[dict]:
        """List tasks, optionally filtered by state. Excludes draft by default."""
        conn = self.connect()
        if state_filter:
            rows = conn.execute(
                "SELECT * FROM tasks WHERE state = ? ORDER BY created_at DESC",
                (state_filter,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM tasks WHERE state != 'draft' ORDER BY created_at DESC"
            ).fetchall()
        return [self._parse_task_row(r) for r in rows]

    def update_task(self, task_id: str, version: int, **kwargs) -> dict:
        """Update task with optimistic locking. Raises ValueError on conflict."""
        kwargs["updated_at"] = datetime.now(timezone.utc).isoformat()
        kwargs["version"] = version + 1

        # JSON-encode dict values
        for key in ("team", "workflow", "scheduler", "scheduler_snapshot", "discord", "metrics"):
            if key in kwargs and isinstance(kwargs[key], dict):
                kwargs[key] = json.dumps(kwargs[key])

        set_clause = ", ".join(f"{k} = ?" for k in kwargs)
        values = list(kwargs.values())

        with self.get_connection() as conn:
            cursor = conn.execute(
                f"UPDATE tasks SET {set_clause} WHERE id = ? AND version = ?",
                values + [task_id, version]
            )
            if cursor.rowcount == 0:
                raise ValueError(f"Optimistic lock conflict: task {task_id} version {version}")

        return self.get_task(task_id)

    # ── Flow Log ──

    def insert_flow_log(self, task_id: str, event: str, kind: str = "flow",
                        stage_id: Optional[str] = None,
                        from_state: Optional[str] = None,
                        to_state: Optional[str] = None,
                        detail: Optional[dict] = None,
                        actor: str = "system") -> int:
        """Insert a flow log entry. Returns the log ID."""
        with self.get_connection() as conn:
            cursor = conn.execute("""
                INSERT INTO flow_log (task_id, kind, event, stage_id, from_state, to_state, detail, actor)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (task_id, kind, event, stage_id, from_state, to_state,
                  json.dumps(detail) if detail else None, actor))
            return cursor.lastrowid

    def get_flow_logs(self, task_id: str) -> list[dict]:
        """Get all flow logs for a task."""
        conn = self.connect()
        rows = conn.execute(
            "SELECT * FROM flow_log WHERE task_id = ? ORDER BY created_at",
            (task_id,)
        ).fetchall()
        return [dict(r) for r in rows]

    # ── Stage History ──

    def enter_stage(self, task_id: str, stage_id: str) -> int:
        """Record entering a stage."""
        with self.get_connection() as conn:
            cursor = conn.execute(
                "INSERT INTO stage_history (task_id, stage_id) VALUES (?, ?)",
                (task_id, stage_id)
            )
            return cursor.lastrowid

    def exit_stage(self, task_id: str, stage_id: str, reason: str = "advance"):
        """Record exiting a stage."""
        now = datetime.now(timezone.utc).isoformat()
        with self.get_connection() as conn:
            conn.execute("""
                UPDATE stage_history SET exited_at = ?, exit_reason = ?
                WHERE task_id = ? AND stage_id = ? AND exited_at IS NULL
            """, (now, reason, task_id, stage_id))

    # ── Subtasks ──

    def insert_subtask(self, task_id: str, subtask_id: str, stage_id: str,
                       title: str, assignee: str) -> None:
        """Insert a subtask."""
        with self.get_connection() as conn:
            conn.execute("""
                INSERT INTO subtasks (id, task_id, stage_id, title, assignee)
                VALUES (?, ?, ?, ?, ?)
            """, (subtask_id, task_id, stage_id, title, assignee))

    def update_subtask(self, task_id: str, subtask_id: str, **kwargs) -> None:
        """Update subtask fields."""
        set_clause = ", ".join(f"{k} = ?" for k in kwargs)
        values = list(kwargs.values())
        with self.get_connection() as conn:
            conn.execute(
                f"UPDATE subtasks SET {set_clause} WHERE task_id = ? AND id = ?",
                values + [task_id, subtask_id]
            )

    def get_subtasks(self, task_id: str, stage_id: Optional[str] = None) -> list[dict]:
        """Get subtasks for a task, optionally filtered by stage."""
        conn = self.connect()
        if stage_id:
            rows = conn.execute(
                "SELECT * FROM subtasks WHERE task_id = ? AND stage_id = ?",
                (task_id, stage_id)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM subtasks WHERE task_id = ?", (task_id,)
            ).fetchall()
        return [dict(r) for r in rows]

    # ── Progress Log ──

    def insert_progress_log(self, task_id: str, content: str, actor: str,
                            kind: str = "progress", stage_id: Optional[str] = None,
                            subtask_id: Optional[str] = None,
                            artifacts: Optional[list] = None) -> int:
        """Insert a progress log entry."""
        with self.get_connection() as conn:
            cursor = conn.execute("""
                INSERT INTO progress_log (task_id, kind, stage_id, subtask_id, content, artifacts, actor)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (task_id, kind, stage_id, subtask_id, content,
                  json.dumps(artifacts) if artifacts else None, actor))
            return cursor.lastrowid

    # ── Helpers ──

    def _parse_task_row(self, row: sqlite3.Row) -> dict:
        """Parse a task row, deserializing JSON fields."""
        d = dict(row)
        for key in ("team", "workflow", "scheduler", "scheduler_snapshot", "discord", "metrics"):
            if d.get(key):
                d[key] = json.loads(d[key])
        return d

    def generate_task_id(self) -> str:
        """Generate next task ID (OC-001, OC-002, ...)."""
        conn = self.connect()
        row = conn.execute(
            "SELECT id FROM tasks ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
        if row is None:
            return "OC-001"
        last_num = int(row["id"].split("-")[1])
        return f"OC-{last_num + 1:03d}"
