"""Tests for Agora HTTP Server routes."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from agora.server.app import create_app


@pytest.fixture
def client(tmp_path):
    app = create_app(db_path=str(tmp_path / "test.db"))
    return TestClient(app)


def _write_config(path: Path, payload: dict) -> str:
    path.write_text(json.dumps(payload), encoding="utf-8")
    return str(path)


@pytest.fixture
def secure_client(tmp_path):
    cfg = {
        "permissions": {"archonUsers": ["lizeyu"]},
        "api_auth": {"enabled": True, "token": "test-token"},
    }
    config_path = _write_config(tmp_path / "secure.json", cfg)
    app = create_app(db_path=str(tmp_path / "secure.db"), config_path=config_path)
    return TestClient(app)


@pytest.fixture
def no_archon_client(tmp_path):
    cfg = {
        "permissions": {"archonUsers": []},
        "api_auth": {"enabled": False},
    }
    config_path = _write_config(tmp_path / "no-archon.json", cfg)
    app = create_app(db_path=str(tmp_path / "no-archon.db"), config_path=config_path)
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
        r = client.post(f"/api/tasks/{task_id}/advance", json={"caller_id": "lizeyu"})
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
        body = r.json()
        assert "task" in body
        assert "flow_log" in body

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

    def test_archon_approve_uses_config_default_reviewer(self, client):
        r = client.post("/api/tasks", json={"title": "测试", "type": "coding"})
        task_id = r.json()["id"]
        r = client.post(f"/api/tasks/{task_id}/archon-approve", json={})
        assert r.status_code == 200

    def test_archon_approve_without_reviewer_and_no_config_fails(self, no_archon_client):
        r = no_archon_client.post("/api/tasks", json={"title": "测试", "type": "coding"})
        task_id = r.json()["id"]
        r = no_archon_client.post(f"/api/tasks/{task_id}/archon-approve", json={})
        assert r.status_code == 400

    def test_subtask_done_requires_assignee(self, client):
        r = client.post("/api/tasks", json={"title": "测试", "type": "coding"})
        task_id = r.json()["id"]
        client.post(f"/api/tasks/{task_id}/archon-approve", json={"reviewer_id": "lizeyu"})
        client.post(f"/api/tasks/{task_id}/advance", json={"caller_id": "opus"})
        client.post(
            f"/api/tasks/{task_id}/subtask-done",
            json={"subtask_id": "dev-api", "caller_id": "sonnet", "output": "done"},
        )
        # no subtasks inserted via API yet; endpoint should return 4xx instead of 500
        r = client.post(
            f"/api/tasks/{task_id}/subtask-done",
            json={"subtask_id": "dev-api", "caller_id": "glm5", "output": "done"},
        )
        assert r.status_code in (400, 403, 404)


class TestHealthRoute:
    def test_health(self, client):
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


class TestDashboardRoute:
    def test_dashboard_index(self, client):
        r = client.get("/dashboard/")
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")


class TestApiAuth:
    def test_missing_token_rejected_when_auth_enabled(self, secure_client):
        r = secure_client.post("/api/tasks", json={"title": "测试", "type": "quick"})
        assert r.status_code == 401

    def test_invalid_token_rejected_when_auth_enabled(self, secure_client):
        r = secure_client.post(
            "/api/tasks",
            json={"title": "测试", "type": "quick"},
            headers={"Authorization": "Bearer wrong-token"},
        )
        assert r.status_code == 403

    def test_valid_token_allows_access(self, secure_client):
        headers = {"Authorization": "Bearer test-token"}
        r = secure_client.post("/api/tasks", json={"title": "测试", "type": "quick"}, headers=headers)
        assert r.status_code == 200
        task_id = r.json()["id"]

        destructive_paths = [
            (f"/api/tasks/{task_id}/force-advance", {"reason": "x"}),
            (f"/api/tasks/{task_id}/cancel", {"reason": "x"}),
            ("/api/tasks/cleanup", {}),
        ]
        for path, body in destructive_paths:
            rr = secure_client.post(path, json=body, headers=headers)
            assert rr.status_code in (200, 400, 403)

    def test_health_is_public_even_when_auth_enabled(self, secure_client):
        r = secure_client.get("/api/health")
        assert r.status_code == 200
