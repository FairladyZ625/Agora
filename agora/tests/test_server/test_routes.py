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
