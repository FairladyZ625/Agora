"""Tests for CLI auth helper behavior."""
import os

import pytest

from agora.scripts.agora_cli import (
    _load_cli_config,
    _resolve_agent_caller,
    _require_archon_token,
)


class TestResolveAgentCaller:
    def test_use_legacy_caller_when_no_agent_id(self):
        assert _resolve_agent_caller("archon", None, None) == "archon"

    def test_agent_id_requires_session_key(self):
        with pytest.raises(ValueError, match="session-key"):
            _resolve_agent_caller("archon", "sonnet", None)

    def test_agent_id_with_session_key(self):
        assert _resolve_agent_caller("archon", "sonnet", "sess-1") == "sonnet"


class TestRequireArchonToken:
    def test_requires_token_when_env_missing(self, monkeypatch):
        monkeypatch.delenv("AGORA_ARCHON_TOKEN", raising=False)
        with pytest.raises(ValueError, match="archon-token"):
            _require_archon_token(None)

    def test_accepts_explicit_token_without_env(self, monkeypatch):
        monkeypatch.delenv("AGORA_ARCHON_TOKEN", raising=False)
        assert _require_archon_token("local-token") == "local-token"

    def test_accepts_env_token(self, monkeypatch):
        monkeypatch.setenv("AGORA_ARCHON_TOKEN", "sec-token")
        assert _require_archon_token(None) == "sec-token"

    def test_rejects_mismatched_token(self, monkeypatch):
        monkeypatch.setenv("AGORA_ARCHON_TOKEN", "sec-token")
        with pytest.raises(ValueError, match="invalid archon-token"):
            _require_archon_token("wrong")


class TestLoadCliConfig:
    def test_loads_default_package_config(self, monkeypatch):
        monkeypatch.delenv("AGORA_CONFIG_PATH", raising=False)
        config = _load_cli_config()
        assert "permissions" in config
        assert "archonUsers" in config["permissions"]

    def test_env_path_overrides_default(self, monkeypatch, tmp_path):
        cfg = tmp_path / "cfg.json"
        cfg.write_text(
            '{"permissions":{"allowAgents":{"*":{"canCall":[],"canAdvance":true}},"archonUsers":["tester"]}}',
            encoding="utf-8",
        )
        monkeypatch.setenv("AGORA_CONFIG_PATH", str(cfg))
        config = _load_cli_config()
        assert config["permissions"]["archonUsers"] == ["tester"]
