"""Structured logging utilities for Agora server."""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Iterable

_BEARER_PATTERN = re.compile(r"(Bearer\s+)([^\s]+)", re.IGNORECASE)


class RedactSecretsFilter(logging.Filter):
    """Redact bearer tokens and configured secrets from log messages."""

    def __init__(self, secrets: Iterable[str] | None = None):
        super().__init__()
        self.secrets = [s for s in (secrets or []) if s]

    def _redact(self, value: str) -> str:
        redacted = _BEARER_PATTERN.sub(r"\1***REDACTED***", value)
        for secret in self.secrets:
            redacted = redacted.replace(secret, "***REDACTED***")
        return redacted

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        record.msg = self._redact(str(message))
        record.args = ()
        return True


class JsonFormatter(logging.Formatter):
    """Serialize log records as JSON lines."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_server_logging(level: str = "INFO", secrets: Iterable[str] | None = None) -> None:
    """Configure a single JSON log handler for `agora` logger namespace."""
    logger = logging.getLogger("agora")
    if getattr(logger, "_agora_logging_configured", False):
        return

    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    handler.addFilter(RedactSecretsFilter(secrets=secrets))

    logger.handlers.clear()
    logger.addHandler(handler)
    logger.setLevel(level)
    logger.propagate = False
    setattr(logger, "_agora_logging_configured", True)
