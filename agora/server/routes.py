"""REST routes for Agora HTTP server."""
from __future__ import annotations

import json
import os
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from agora.core.dashboard_queries import DashboardQueryService
from agora.core.db import DatabaseManager
from agora.core.task_mgr import TaskManager


logger = logging.getLogger("agora.server.routes")


def _load_config(config_path: str | None) -> dict:
    if config_path:
        path = Path(config_path)
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))

    default_candidates = [
        Path(__file__).resolve().parents[1] / "config" / "agora.example.json",
        Path(__file__).resolve().parents[2] / "config" / "agora.example.json",
    ]
    for default_path in default_candidates:
        if default_path.exists():
            return json.loads(default_path.read_text(encoding="utf-8"))

    return {}


def _build_manager(db_path: str, config: dict) -> TaskManager:
    db = DatabaseManager(db_path=db_path, check_same_thread=False)
    db.initialize()
    return TaskManager(db, config=config)


class ApiAuth:
    """Bearer token auth for API routes."""

    def __init__(self, config: dict):
        auth_cfg = config.get("api_auth", {})
        self.enabled = bool(auth_cfg.get("enabled", False))
        self.token = os.getenv("AGORA_API_TOKEN") or auth_cfg.get("token")

    def check(self, credentials: HTTPAuthorizationCredentials | None) -> None:
        if not self.enabled:
            return
        if not self.token:
            logger.error("api_auth_enabled_but_token_missing")
            raise HTTPException(status_code=500, detail="api auth enabled but token not configured")
        if credentials is None or not credentials.credentials:
            logger.warning("api_auth_missing_bearer_token")
            raise HTTPException(status_code=401, detail="missing bearer token")
        if credentials.credentials != self.token:
            logger.warning("api_auth_invalid_token")
            raise HTTPException(status_code=403, detail="invalid api token")


def _resolve_reviewer_id(explicit_id: str | None, mgr: TaskManager) -> str:
    if explicit_id:
        return explicit_id
    archon_users = sorted(mgr.permission.archon_users)
    if archon_users:
        return archon_users[0]
    raise ValueError("reviewer_id is required and no archonUsers configured")


def _translate_error(exc: Exception):
    if isinstance(exc, PermissionError):
        logger.warning("permission_denied: %s", exc)
        raise HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, ValueError):
        message = str(exc)
        logger.info("value_error: %s", message)
        if "not found" in message.lower():
            raise HTTPException(status_code=404, detail=message)
        raise HTTPException(status_code=400, detail=message)
    logger.exception("unhandled_error")
    raise HTTPException(status_code=500, detail=str(exc))


class CreateTaskRequest(BaseModel):
    title: str
    type: str = "coding"
    creator: str = "archon"
    description: str = ""
    priority: str = "normal"


class AdvanceRequest(BaseModel):
    caller_id: str = "archon"


class ApproveRequest(BaseModel):
    caller_id: Optional[str] = None
    approver_id: Optional[str] = None
    comment: str = ""


class RejectRequest(BaseModel):
    caller_id: Optional[str] = None
    rejector_id: Optional[str] = None
    reason: str = ""


class ArchonApproveRequest(BaseModel):
    reviewer_id: Optional[str] = None
    comment: str = ""


class ArchonRejectRequest(BaseModel):
    reviewer_id: Optional[str] = None
    reason: str = ""


class ConfirmRequest(BaseModel):
    caller_id: Optional[str] = None
    voter_id: Optional[str] = None
    vote: str = "approve"
    comment: str = ""


class SubtaskDoneRequest(BaseModel):
    subtask_id: str
    caller_id: str = "archon"
    output: str = ""


class ForceAdvanceRequest(BaseModel):
    reason: str = ""


class StateChangeRequest(BaseModel):
    reason: str = ""


class CleanupRequest(BaseModel):
    task_id: Optional[str] = None


class ArchiveRetryRequest(BaseModel):
    reason: str = ""


class TodoCreateRequest(BaseModel):
    text: str
    due: Optional[str] = None
    tags: list[str] = []


class TodoUpdateRequest(BaseModel):
    text: Optional[str] = None
    due: Optional[str] = None
    tags: Optional[list[str]] = None
    status: Optional[str] = None


class TodoPromoteRequest(BaseModel):
    type: str = "quick"
    creator: str = "archon"
    priority: str = "normal"


def create_router(db_path: str = "tasks.db", config_path: str | None = None) -> APIRouter:
    router = APIRouter()
    config = _load_config(config_path)
    mgr = _build_manager(db_path, config)
    dashboard = DashboardQueryService(mgr.db, mgr.templates_dir)
    auth = ApiAuth(config)
    bearer = HTTPBearer(auto_error=False)

    def require_api_auth(
        credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    ) -> None:
        auth.check(credentials)

    @router.post("/tasks", dependencies=[Depends(require_api_auth)])
    def create_task(payload: CreateTaskRequest):
        try:
            task = mgr.create_task(
                title=payload.title,
                task_type=payload.type,
                creator=payload.creator,
                description=payload.description,
                priority=payload.priority,
            )
            logger.info("task_created id=%s type=%s creator=%s", task["id"], task["type"], task["creator"])
            return task
        except (PermissionError, ValueError, FileNotFoundError) as exc:
            _translate_error(exc)

    @router.get("/tasks", dependencies=[Depends(require_api_auth)])
    def list_tasks(state: Optional[str] = None):
        try:
            return mgr.list_tasks(state_filter=state)
        except (PermissionError, ValueError, FileNotFoundError) as exc:
            _translate_error(exc)

    @router.get("/tasks/{task_id}", dependencies=[Depends(require_api_auth)])
    def get_task(task_id: str):
        task = mgr.get_task(task_id)
        if task is None:
            raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
        return task

    @router.get("/tasks/{task_id}/status", dependencies=[Depends(require_api_auth)])
    def task_status(task_id: str):
        task = mgr.get_task(task_id)
        if task is None:
            raise HTTPException(status_code=404, detail=f"Task {task_id} not found")

        flow_log = mgr.db.get_flow_logs(task_id)
        progress_log_rows = mgr.db.connect().execute(
            "SELECT * FROM progress_log WHERE task_id = ? ORDER BY created_at",
            (task_id,),
        ).fetchall()
        subtasks = mgr.db.get_subtasks(task_id)
        return {
            "task": task,
            "flow_log": flow_log,
            "progress_log": [dict(r) for r in progress_log_rows],
            "subtasks": subtasks,
        }

    @router.post("/tasks/{task_id}/advance", dependencies=[Depends(require_api_auth)])
    def advance_task(task_id: str, payload: AdvanceRequest):
        try:
            task = mgr.advance_task(task_id, caller_id=payload.caller_id)
            logger.info("task_advanced id=%s caller=%s stage=%s state=%s", task_id, payload.caller_id, task.get("current_stage"), task.get("state"))
            return task
        except (PermissionError, ValueError, FileNotFoundError) as exc:
            _translate_error(exc)

    @router.post("/tasks/{task_id}/approve", dependencies=[Depends(require_api_auth)])
    def approve_task(task_id: str, payload: ApproveRequest):
        caller = payload.approver_id or payload.caller_id or "archon"
        try:
            return mgr.approve_task(task_id, approver_id=caller, comment=payload.comment)
        except (PermissionError, ValueError, FileNotFoundError) as exc:
            _translate_error(exc)

    @router.post("/tasks/{task_id}/reject", dependencies=[Depends(require_api_auth)])
    def reject_task(task_id: str, payload: RejectRequest):
        caller = payload.rejector_id or payload.caller_id or "archon"
        try:
            return mgr.reject_task(task_id, rejector_id=caller, reason=payload.reason)
        except (PermissionError, ValueError, FileNotFoundError) as exc:
            _translate_error(exc)

    @router.post("/tasks/{task_id}/archon-approve", dependencies=[Depends(require_api_auth)])
    def archon_approve(task_id: str, payload: ArchonApproveRequest):
        try:
            reviewer_id = _resolve_reviewer_id(payload.reviewer_id, mgr)
            task = mgr.archon_approve(task_id, reviewer_id=reviewer_id, comment=payload.comment)
            logger.info("archon_approved id=%s reviewer=%s", task_id, reviewer_id)
            return task
        except (PermissionError, ValueError, FileNotFoundError) as exc:
            _translate_error(exc)

    @router.post("/tasks/{task_id}/archon-reject", dependencies=[Depends(require_api_auth)])
    def archon_reject(task_id: str, payload: ArchonRejectRequest):
        try:
            reviewer_id = _resolve_reviewer_id(payload.reviewer_id, mgr)
            task = mgr.archon_reject(task_id, reviewer_id=reviewer_id, reason=payload.reason)
            logger.info("archon_rejected id=%s reviewer=%s", task_id, reviewer_id)
            return task
        except (PermissionError, ValueError, FileNotFoundError) as exc:
            _translate_error(exc)

    @router.post("/tasks/{task_id}/confirm", dependencies=[Depends(require_api_auth)])
    def confirm(task_id: str, payload: ConfirmRequest):
        caller = payload.voter_id or payload.caller_id or "archon"
        try:
            return mgr.confirm_task(task_id, voter_id=caller, vote=payload.vote, comment=payload.comment)
        except (PermissionError, ValueError, FileNotFoundError) as exc:
            _translate_error(exc)

    @router.post("/tasks/{task_id}/subtask-done", dependencies=[Depends(require_api_auth)])
    def subtask_done(task_id: str, payload: SubtaskDoneRequest):
        try:
            return mgr.complete_subtask(
                task_id=task_id,
                subtask_id=payload.subtask_id,
                caller_id=payload.caller_id,
                output=payload.output,
            )
        except (PermissionError, ValueError, FileNotFoundError) as exc:
            _translate_error(exc)

    @router.post("/tasks/{task_id}/force-advance", dependencies=[Depends(require_api_auth)])
    def force_advance(task_id: str, payload: ForceAdvanceRequest):
        try:
            return mgr.force_advance(task_id, reason=payload.reason)
        except (PermissionError, ValueError, FileNotFoundError) as exc:
            _translate_error(exc)

    @router.post("/tasks/{task_id}/pause", dependencies=[Depends(require_api_auth)])
    def pause(task_id: str, payload: StateChangeRequest):
        try:
            return mgr.pause_task(task_id, reason=payload.reason)
        except (PermissionError, ValueError, FileNotFoundError) as exc:
            _translate_error(exc)

    @router.post("/tasks/{task_id}/resume", dependencies=[Depends(require_api_auth)])
    def resume(task_id: str):
        try:
            return mgr.resume_task(task_id)
        except (PermissionError, ValueError, FileNotFoundError) as exc:
            _translate_error(exc)

    @router.post("/tasks/{task_id}/cancel", dependencies=[Depends(require_api_auth)])
    def cancel(task_id: str, payload: StateChangeRequest):
        try:
            return mgr.cancel_task(task_id, reason=payload.reason)
        except (PermissionError, ValueError, FileNotFoundError) as exc:
            _translate_error(exc)

    @router.post("/tasks/{task_id}/unblock", dependencies=[Depends(require_api_auth)])
    def unblock(task_id: str, payload: StateChangeRequest):
        try:
            return mgr.unblock_task(task_id, reason=payload.reason)
        except (PermissionError, ValueError, FileNotFoundError) as exc:
            _translate_error(exc)

    @router.post("/tasks/cleanup", dependencies=[Depends(require_api_auth)])
    def cleanup(payload: CleanupRequest):
        try:
            if payload.task_id:
                count = mgr.cleanup_orphaned(payload.task_id)
            else:
                count = mgr.cleanup_orphaned()
            logger.info("cleanup_orphaned count=%s task_id=%s", count, payload.task_id)
            return {"cleaned": count}
        except (PermissionError, ValueError, FileNotFoundError) as exc:
            _translate_error(exc)

    @router.get("/agents/status", dependencies=[Depends(require_api_auth)])
    def agents_status():
        return dashboard.get_agents_status()

    @router.get("/archive/jobs", dependencies=[Depends(require_api_auth)])
    def list_archive_jobs(status: Optional[str] = None, task_id: Optional[str] = None):
        return mgr.db.list_archive_jobs(status_filter=status, task_id=task_id)

    @router.get("/archive/jobs/{job_id}", dependencies=[Depends(require_api_auth)])
    def get_archive_job(job_id: int):
        job = mgr.db.get_archive_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Archive job {job_id} not found")
        return job

    @router.post("/archive/jobs/{job_id}/retry", dependencies=[Depends(require_api_auth)])
    def retry_archive_job(job_id: int, payload: ArchiveRetryRequest):
        try:
            job = mgr.db.retry_archive_job(job_id)
            logger.info("archive_job_retried id=%s reason=%s", job_id, payload.reason)
            return job
        except ValueError as exc:
            _translate_error(exc)

    @router.get("/todos", dependencies=[Depends(require_api_auth)])
    def list_todos(status: Optional[str] = None):
        return mgr.db.list_todos(status_filter=status)

    @router.post("/todos", dependencies=[Depends(require_api_auth)])
    def create_todo(payload: TodoCreateRequest):
        return mgr.db.insert_todo(payload.text, due=payload.due, tags=payload.tags)

    @router.patch("/todos/{todo_id}", dependencies=[Depends(require_api_auth)])
    def update_todo(todo_id: int, payload: TodoUpdateRequest):
        try:
            updates: dict = {}
            if payload.text is not None:
                updates["text"] = payload.text
            if payload.due is not None:
                updates["due"] = payload.due
            if payload.tags is not None:
                updates["tags"] = payload.tags
            if payload.status is not None:
                updates["status"] = payload.status
                if payload.status == "done":
                    updates["completed_at"] = mgr.db.connect().execute(
                        "SELECT datetime('now')"
                    ).fetchone()[0]
                elif payload.status == "pending":
                    updates["completed_at"] = None
            return mgr.db.update_todo(todo_id, **updates)
        except ValueError as exc:
            _translate_error(exc)

    @router.delete("/todos/{todo_id}", dependencies=[Depends(require_api_auth)])
    def delete_todo(todo_id: int):
        deleted = mgr.db.delete_todo(todo_id)
        if not deleted:
            raise HTTPException(status_code=404, detail=f"Todo {todo_id} not found")
        return {"deleted": True}

    @router.post("/todos/{todo_id}/promote", dependencies=[Depends(require_api_auth)])
    def promote_todo(todo_id: int, payload: TodoPromoteRequest):
        try:
            return mgr.promote_todo(
                todo_id,
                task_type=payload.type,
                creator=payload.creator,
                priority=payload.priority,
            )
        except (PermissionError, ValueError, FileNotFoundError) as exc:
            _translate_error(exc)

    @router.get("/templates", dependencies=[Depends(require_api_auth)])
    def list_templates():
        return dashboard.list_templates()

    @router.get("/templates/{template_id}", dependencies=[Depends(require_api_auth)])
    def get_template(template_id: str):
        try:
            return dashboard.get_template(template_id)
        except ValueError as exc:
            _translate_error(exc)

    @router.get("/health")
    def health():
        return {"status": "ok"}

    return router
