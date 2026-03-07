"""Tests for setup-openclaw-plugin command behavior."""
from pathlib import Path

from typer.testing import CliRunner

from agora.scripts import agora_cli


runner = CliRunner()


def _mock_which(_name: str) -> str:
    return "/usr/bin/mock"


def test_setup_openclaw_plugin_writes_server_url_and_api_token(monkeypatch, tmp_path):
    plugin_dir = tmp_path / "agora-plugin"
    plugin_dir.mkdir()

    calls: list[tuple[list[str], str | None]] = []

    monkeypatch.setattr(agora_cli.shutil, "which", _mock_which)
    monkeypatch.setattr(
        agora_cli,
        "_run_cmd",
        lambda args, cwd=None: calls.append((args, cwd)),
    )

    result = runner.invoke(
        agora_cli.app,
        [
            "setup-openclaw-plugin",
            "--plugin-dir",
            str(plugin_dir),
            "--server-url",
            "http://127.0.0.1:9527",
            "--api-token",
            "sec-token",
        ],
    )

    assert result.exit_code == 0

    assert (["openclaw", "config", "set", "plugins.entries.agora.config.serverUrl", "http://127.0.0.1:9527"], None) in calls
    assert (["openclaw", "config", "set", "plugins.entries.agora.config.apiToken", "sec-token"], None) in calls
    assert (["openclaw", "plugins", "enable", "agora"], None) in calls

    npm_calls = [call for call in calls if call[0][:2] == ["npm", "install"] or call[0][:3] == ["npm", "run", "build"]]
    assert npm_calls
    assert all(Path(call[1]).resolve() == plugin_dir.resolve() for call in npm_calls)


def test_setup_openclaw_plugin_uses_env_api_token(monkeypatch, tmp_path):
    plugin_dir = tmp_path / "agora-plugin"
    plugin_dir.mkdir()

    calls: list[tuple[list[str], str | None]] = []

    monkeypatch.setenv("AGORA_API_TOKEN", "env-token")
    monkeypatch.setattr(agora_cli.shutil, "which", _mock_which)
    monkeypatch.setattr(
        agora_cli,
        "_run_cmd",
        lambda args, cwd=None: calls.append((args, cwd)),
    )

    result = runner.invoke(
        agora_cli.app,
        [
            "setup-openclaw-plugin",
            "--plugin-dir",
            str(plugin_dir),
        ],
    )

    assert result.exit_code == 0
    assert (["openclaw", "config", "set", "plugins.entries.agora.config.apiToken", "env-token"], None) in calls


def test_setup_openclaw_plugin_skips_api_token_when_not_provided(monkeypatch, tmp_path):
    plugin_dir = tmp_path / "agora-plugin"
    plugin_dir.mkdir()

    calls: list[tuple[list[str], str | None]] = []

    monkeypatch.delenv("AGORA_API_TOKEN", raising=False)
    monkeypatch.setattr(agora_cli.shutil, "which", _mock_which)
    monkeypatch.setattr(
        agora_cli,
        "_run_cmd",
        lambda args, cwd=None: calls.append((args, cwd)),
    )

    result = runner.invoke(
        agora_cli.app,
        [
            "setup-openclaw-plugin",
            "--plugin-dir",
            str(plugin_dir),
        ],
    )

    assert result.exit_code == 0
    token_calls = [c for c in calls if c[0][0:4] == ["openclaw", "config", "set", "plugins.entries.agora.config.apiToken"]]
    assert token_calls == []
