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
