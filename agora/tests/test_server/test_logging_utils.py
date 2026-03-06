"""Tests for structured logging utilities."""
import json
import logging

from agora.server.logging_utils import JsonFormatter, RedactSecretsFilter


class TestRedactSecretsFilter:
    def test_redacts_bearer_token_and_explicit_secret(self):
        record = logging.LogRecord(
            name="agora.test",
            level=logging.INFO,
            pathname=__file__,
            lineno=10,
            msg="Authorization: Bearer abc.def.ghi token=top-secret",
            args=(),
            exc_info=None,
        )
        f = RedactSecretsFilter(secrets=["top-secret"])
        assert f.filter(record) is True
        assert "abc.def.ghi" not in str(record.msg)
        assert "top-secret" not in str(record.msg)
        assert "***REDACTED***" in str(record.msg)
        assert str(record.msg).startswith("Authorization: Bearer ***REDACTED***")


class TestJsonFormatter:
    def test_formats_json_log(self):
        record = logging.LogRecord(
            name="agora.test",
            level=logging.WARNING,
            pathname=__file__,
            lineno=25,
            msg="hello",
            args=(),
            exc_info=None,
        )
        formatter = JsonFormatter()
        payload = json.loads(formatter.format(record))
        assert payload["level"] == "WARNING"
        assert payload["logger"] == "agora.test"
        assert payload["message"] == "hello"
        assert "timestamp" in payload
