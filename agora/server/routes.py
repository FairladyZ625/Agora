"""REST routes for Agora HTTP server."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agora.core.db import DatabaseManager
from agora.core.task_mgr import TaskManager


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


def _build_manager(db_path: str, config_path: str | None) -> TaskManager:
    db = DatabaseManager(db_path=db_path, check_same_thread=False)
    db.initialize()
    return TaskManager(db, config=_load_config(config_path))


def _translate_error(exc: Exception):
    if isinstance(exc, PermissionError):
        raise HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, ValueError):
        message = str(exc)
        if "not found" in message.lower():
            raise HTTPException(status_code=404, detail=message)
        raise HTTPException(status_code=400, detail=message)
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
    reviewer_id: str = "lizeyu"
    comment: str = ""


class ArchonRejectRequest(BaseModel):
    reviewer_id: str = "lizeyu"
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


def create_router(db_path: str = "tasks.db", config_path: str | None = None) -> APIRouter:
    router = APIRouter()
    mgr = _build_manager(db_path, config_path)

    @router.post("/tasks")
    def create_task(payload: CreateTaskRequest):
        try:
            return mgr.create_task(
                title=payload.title,
                task_type=payload.type,
                creator=payload.creator,
                description=payload.description,
                priority=payload.priority,
            )
        except Exception as exc:  # noqa: BLE001
            _translate_error(exc)

    @router.get("/tasks")
    def list_tasks(state: Optional[str] = None):
        try:
            return mgr.list_tasks(state_filter=state)
        except Exception as exc:  # noqa: BLE001
            _translate_error(exc)

    @router.get("/tasks/{task_id}")
    def get_task(task_id: str):
        task = mgr.get_task(task_id)
        if task is None:
            raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
        return task

    @router.get("/tasks/{task_id}/status")
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

    @router.post("/tasks/{task_id}/advance")
    def advance_task(task_id: str, payload: AdvanceRequest):
        try:
            return mgr.advance_task(task_id, caller_id=payload.caller_id)
        except Exception as exc:  # noqa: BLE001
            _translate_error(exc)

    @router.post("/tasks/{task_id}/approve")
    def approve_task(task_id: str, payload: ApproveRequest):
        caller = payload.approver_id or payload.caller_id or "archon"
        try:
            return mgr.approve_task(task_id, approver_id=caller, comment=payload.comment)
        except Exception as exc:  # noqa: BLE001
            _translate_error(exc)

    @router.post("/tasks/{task_id}/reject")
    def reject_task(task_id: str, payload: RejectRequest):
        caller = payload.rejector_id or payload.caller_id or "archon"
        try:
            return mgr.reject_task(task_id, rejector_id=caller, reason=payload.reason)
        except Exception as exc:  # noqa: BLE001
            _translate_error(exc)

    @router.post("/tasks/{task_id}/archon-approve")
    def archon_approve(task_id: str, payload: ArchonApproveRequest):
        try:
            return mgr.archon_approve(task_id, reviewer_id=payload.reviewer_id, comment=payload.comment)
        except Exception as exc:  # noqa: BLE001
            _translate_error(exc)

    @router.post("/tasks/{task_id}/archon-reject")
    def archon_reject(task_id: str, payload: ArchonRejectRequest):
        try:
            return mgr.archon_reject(task_id, reviewer_id=payload.reviewer_id, reason=payload.reason)
        except Exception as exc:  # noqa: BLE001
            _translate_error(exc)

    @router.post("/tasks/{task_id}/confirm")
    def confirm(task_id: str, payload: ConfirmRequest):
        caller = payload.voter_id or payload.caller_id or "archon"
        try:
            return mgr.confirm_task(task_id, voter_id=caller, vote=payload.vote, comment=payload.comment)
        except Exception as exc:  # noqa: BLE001
            _translate_error(exc)

    @router.post("/tasks/{task_id}/subtask-done")
    def subtask_done(task_id: str, payload: SubtaskDoneRequest):
        try:
            return mgr.complete_subtask(
                task_id=task_id,
                subtask_id=payload.subtask_id,
                caller_id=payload.caller_id,
                output=payload.output,
            )
        except Exception as exc:  # noqa: BLE001
            _translate_error(exc)

    @router.post("/tasks/{task_id}/force-advance")
    def force_advance(task_id: str, payload: ForceAdvanceRequest):
        try:
            return mgr.force_advance(task_id, reason=payload.reason)
        except Exception as exc:  # noqa: BLE001
            _translate_error(exc)

    @router.post("/tasks/{task_id}/pause")
    def pause(task_id: str, payload: StateChangeRequest):
        try:
            return mgr.pause_task(task_id, reason=payload.reason)
        except Exception as exc:  # noqa: BLE001
            _translate_error(exc)

    @router.post("/tasks/{task_id}/resume")
    def resume(task_id: str):
        try:
            return mgr.resume_task(task_id)
        except Exception as exc:  # noqa: BLE001
            _translate_error(exc)

    @router.post("/tasks/{task_id}/cancel")
    def cancel(task_id: str, payload: StateChangeRequest):
        try:
            return mgr.cancel_task(task_id, reason=payload.reason)
        except Exception as exc:  # noqa: BLE001
            _translate_error(exc)

    @router.post("/tasks/{task_id}/unblock")
    def unblock(task_id: str, payload: StateChangeRequest):
        try:
            return mgr.unblock_task(task_id, reason=payload.reason)
        except Exception as exc:  # noqa: BLE001
            _translate_error(exc)

    @router.post("/tasks/cleanup")
    def cleanup(payload: CleanupRequest):
        try:
            if payload.task_id:
                count = mgr.cleanup_orphaned(payload.task_id)
            else:
                count = mgr.cleanup_orphaned()
            return {"cleaned": count}
        except Exception as exc:  # noqa: BLE001
            _translate_error(exc)

    @router.get("/health")
    def health():
        return {"status": "ok"}

    return router
