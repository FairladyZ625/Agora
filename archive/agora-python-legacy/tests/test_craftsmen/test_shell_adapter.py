"""Tests for shell craftsmen adapter."""
import sys

import pytest

from agora.craftsmen.shell_adapter import ShellCraftsman


class TestShellCraftsman:
    def test_run_success(self):
        adapter = ShellCraftsman()
        result = adapter.run([sys.executable, "-c", "print('hello')"])
        assert result.exit_code == 0
        assert "hello" in result.stdout
        assert result.timed_out is False

    def test_run_non_zero_exit(self):
        adapter = ShellCraftsman()
        result = adapter.run([sys.executable, "-c", "import sys; sys.exit(7)"])
        assert result.exit_code == 7
        assert result.timed_out is False

    def test_run_timeout_raises(self):
        adapter = ShellCraftsman()
        with pytest.raises(TimeoutError):
            adapter.run([sys.executable, "-c", "import time; time.sleep(2)"], timeout_sec=0.1)
