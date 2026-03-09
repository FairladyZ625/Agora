"""Shell-based craftsmen adapter for command execution."""
from __future__ import annotations

from dataclasses import dataclass
import subprocess
import time
from typing import Sequence


@dataclass
class ShellExecutionResult:
    command: str
    exit_code: int
    stdout: str
    stderr: str
    duration_ms: int
    timed_out: bool = False


class ShellCraftsman:
    """Execute commands as a lightweight craftsmen adapter."""

    def run(
        self,
        command: Sequence[str],
        timeout_sec: float = 30.0,
        cwd: str | None = None,
    ) -> ShellExecutionResult:
        started = time.monotonic()
        try:
            completed = subprocess.run(
                list(command),
                cwd=cwd,
                capture_output=True,
                text=True,
                check=False,
                timeout=timeout_sec,
            )
        except subprocess.TimeoutExpired as exc:
            raise TimeoutError(f"command timed out after {timeout_sec}s: {' '.join(command)}") from exc

        duration_ms = int((time.monotonic() - started) * 1000)
        return ShellExecutionResult(
            command=" ".join(command),
            exit_code=completed.returncode,
            stdout=completed.stdout,
            stderr=completed.stderr,
            duration_ms=duration_ms,
            timed_out=False,
        )
