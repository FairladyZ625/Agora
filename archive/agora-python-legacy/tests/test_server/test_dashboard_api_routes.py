"""Tests for dashboard expansion API routes."""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from agora.core.db import DatabaseManager
from agora.core.task_mgr import TaskManager
from agora.server.app import create_app


def _make_manager(db: DatabaseManager) -> TaskManager:
    return TaskManager(
        db,
        config={
            "permissions": {
                "archonUsers": ["lizeyu", "archon"],
                "allowAgents": {
                    "opus": {"canCall": ["sonnet", "glm5"], "canAdvance": True},
                    "sonnet": {"canCall": ["opus"], "canAdvance": False},
                    "glm5": {"canCall": [], "canAdvance": False},
                    "*": {"canCall": [], "canAdvance": False},
                },
            }
        },
    )


@pytest.fixture
def db(tmp_path):
    db = DatabaseManager(str(tmp_path / "dashboard-api.db"), check_same_thread=False)
    db.initialize()
    return db


@pytest.fixture
def client(db):
    app = create_app(db_path=db.db_path)
    return TestClient(app)


class TestAgentStatusRoutes:
    def test_agents_status_aggregates_active_agents_and_craftsmen(self, client, db):
        mgr = _make_manager(db)
        task = mgr.create_task("实现认证", "coding", creator="lizeyu")
        db.insert_subtask(task["id"], "dev-api", "develop", "后端 API", "sonnet")
        db.update_subtask(
            task["id"],
            "dev-api",
            craftsman_type="codex",
            dispatch_status="success",
            dispatched_at="2026-03-07T10:00:00+00:00",
        )
        db.insert_progress_log(
            task["id"],
            content="working on auth middleware",
            actor="sonnet",
            kind="progress",
            stage_id=task["current_stage"],
            subtask_id="dev-api",
        )

        response = client.get("/api/agents/status")

        assert response.status_code == 200
        payload = response.json()
        assert payload["summary"]["active_tasks"] == 1
        assert any(agent["id"] == "sonnet" for agent in payload["agents"])
        assert any(item["id"] == "codex" for item in payload["craftsmen"])


class TestArchiveJobRoutes:
    def test_list_archive_jobs_returns_joined_task_info(self, client, db):
        task = db.insert_task(
            task_id="OC-901",
            title="归档测试",
            task_type="document",
            creator="lizeyu",
            team={"members": []},
            workflow={"stages": []},
        )
        with db.get_connection() as conn:
            conn.execute(
                """
                INSERT INTO archive_jobs (task_id, status, target_path, payload, writer_agent)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    task["id"],
                    "pending",
                    "ZeYu-AI-Brain/docs/",
                    json.dumps({"summary": "draft"}),
                    "writer-agent",
                ),
            )

        response = client.get("/api/archive/jobs")

        assert response.status_code == 200
        payload = response.json()
        assert len(payload) == 1
        assert payload[0]["task_id"] == "OC-901"
        assert payload[0]["task_title"] == "归档测试"

    def test_get_archive_job_by_id(self, client, db):
        task = db.insert_task(
            task_id="OC-902",
            title="归档详情",
            task_type="document",
            creator="lizeyu",
            team={"members": []},
            workflow={"stages": []},
        )
        with db.get_connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO archive_jobs (task_id, status, target_path, payload, writer_agent)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    task["id"],
                    "failed",
                    "ZeYu-AI-Brain/docs/",
                    json.dumps({"error_message": "timeout"}),
                    "writer-agent",
                ),
            )
            job_id = cursor.lastrowid

        response = client.get(f"/api/archive/jobs/{job_id}")

        assert response.status_code == 200
        assert response.json()["id"] == job_id

    def test_retry_archive_job_resets_status_to_pending(self, client, db):
        task = db.insert_task(
            task_id="OC-903",
            title="重试归档",
            task_type="document",
            creator="lizeyu",
            team={"members": []},
            workflow={"stages": []},
        )
        with db.get_connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO archive_jobs (task_id, status, target_path, payload, writer_agent, commit_hash, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    task["id"],
                    "failed",
                    "ZeYu-AI-Brain/docs/",
                    json.dumps({"error_message": "timeout"}),
                    "writer-agent",
                    "deadbeef",
                    "2026-03-07T09:00:00+00:00",
                ),
            )
            job_id = cursor.lastrowid

        response = client.post(f"/api/archive/jobs/{job_id}/retry", json={"reason": "manual retry"})

        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "pending"
        assert payload["commit_hash"] is None
        assert payload["completed_at"] is None


class TestTodoRoutes:
    def test_create_and_list_todos(self, client):
        create_response = client.post(
            "/api/todos",
            json={"text": "补后端接口", "due": "2026-03-10", "tags": ["dashboard", "backend"]},
        )
        assert create_response.status_code == 200
        created = create_response.json()
        assert created["status"] == "pending"

        list_response = client.get("/api/todos")

        assert list_response.status_code == 200
        payload = list_response.json()
        assert len(payload) == 1
        assert payload[0]["text"] == "补后端接口"

    def test_patch_todo_updates_status_and_text(self, client):
        todo = client.post("/api/todos", json={"text": "旧标题"}).json()

        response = client.patch(
            f"/api/todos/{todo['id']}",
            json={"text": "新标题", "status": "done"},
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["text"] == "新标题"
        assert payload["status"] == "done"
        assert payload["completed_at"] is not None

    def test_delete_todo_removes_item(self, client):
        todo = client.post("/api/todos", json={"text": "会被删除"}).json()

        delete_response = client.delete(f"/api/todos/{todo['id']}")
        list_response = client.get("/api/todos")

        assert delete_response.status_code == 200
        assert delete_response.json()["deleted"] is True
        assert list_response.json() == []

    def test_promote_todo_creates_task_and_links_back(self, client):
        todo = client.post("/api/todos", json={"text": "升级成任务"}).json()

        response = client.post(
            f"/api/todos/{todo['id']}/promote",
            json={"type": "quick", "creator": "lizeyu", "priority": "high"},
        )

        assert response.status_code == 200
        payload = response.json()
        assert payload["todo"]["promoted_to"].startswith("OC-")
        assert payload["task"]["id"] == payload["todo"]["promoted_to"]
        assert payload["task"]["title"] == "升级成任务"


class TestTemplateRoutes:
    def test_list_templates_returns_template_summaries(self, client):
        response = client.get("/api/templates")

        assert response.status_code == 200
        payload = response.json()
        assert any(item["id"] == "coding" for item in payload)
        coding = next(item for item in payload if item["id"] == "coding")
        assert coding["stage_count"] >= 1

    def test_get_template_returns_full_template_payload(self, client):
        response = client.get("/api/templates/coding")

        assert response.status_code == 200
        payload = response.json()
        assert payload["type"] == "coding"
        assert payload["defaultTeam"]["architect"]["suggested"][0] == "opus"
