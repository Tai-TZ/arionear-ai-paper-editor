"""Process-wide logging (stdlib ``dictConfig``).

* ``APP_ENV=development`` → readable text lines; anything else → one JSON object per line with the fields
  Cloud Logging understands (``severity``, ``message``, ``time``, ``logging.googleapis.com/trace``) plus
  ``logger`` and ``request_id``. JSON comes from the ``python-json-logger`` formatter.
* One stdout handler on the root logger; uvicorn's loggers propagate into it, so access and error lines
  share the format and carry the request id. The handler flushes every record, so output does not depend
  on ``PYTHONUNBUFFERED``.
* Secrets in request paths (share tokens, billing checkout ids, OAuth codes) are masked before formatting.
"""

from __future__ import annotations

import logging
import logging.config
import re
import sys
from typing import Any

from src.config import get_settings
from src.request_context import RequestContextMiddleware, cloud_trace_var, request_id_var

CLOUD_TRACE_FIELD = "logging.googleapis.com/trace"

_TEXT_FORMAT = "%(asctime)s %(levelname)-8s %(name)s [%(request_id)s] %(message)s"
_JSON_FIELDS = "%(levelname)s %(name)s %(message)s"
# `stack_trace` is the field Cloud Error Reporting reads tracebacks from.
_JSON_RENAMES = {"levelname": "severity", "name": "logger", "exc_info": "stack_trace"}

# Path segments that are bearer secrets: /share/<token>, /ws/share/<token>, /billing/confirm/<checkout id>
_SECRET_PATH_RE = re.compile(r"(/(?:ws/)?share/|/billing/confirm/)[^/?#\s\"]+")
_SECRET_QUERY_RE = re.compile(r"([?&](?:token|access_token|code|state)=)[^&#\s\"]+", re.IGNORECASE)
_MASK = "***"


def mask_secrets(text: str) -> str:
    """Replace secret path segments / query values in a URL or log line with ``***``."""
    if "/" not in text and "=" not in text:
        return text
    return _SECRET_QUERY_RE.sub(rf"\1{_MASK}", _SECRET_PATH_RE.sub(rf"\1{_MASK}", text))


class RequestContextFilter(logging.Filter):
    """Attach ``request_id`` (``-`` outside a request) and the Cloud Trace resource to every record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get() or "-"
        trace = cloud_trace_var.get()
        if trace:
            setattr(record, CLOUD_TRACE_FIELD, trace)
        # uvicorn duplicates the message with ANSI colours; keep it out of JSON output.
        record.__dict__.pop("color_message", None)
        return True


class SecretMaskingFilter(logging.Filter):
    """Mask tokens in log arguments and messages (uvicorn's access line passes the path as an argument)."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = mask_secrets(record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(mask_secrets(arg) if isinstance(arg, str) else arg for arg in record.args)
        elif isinstance(record.args, dict):
            record.args = {k: mask_secrets(v) if isinstance(v, str) else v for k, v in record.args.items()}
        return True


class StdoutHandler(logging.StreamHandler):
    """Stream handler bound to the *current* ``sys.stdout`` (test runners and reloaders swap it)."""

    def __init__(self) -> None:
        super().__init__(sys.stdout)

    @property  # type: ignore[override]
    def stream(self) -> Any:
        return sys.stdout

    @stream.setter
    def stream(self, _value: Any) -> None:
        pass


def build_logging_config(*, json_logs: bool, level: str) -> dict[str, Any]:
    if json_logs:
        formatter: dict[str, Any] = {
            "()": "pythonjsonlogger.json.JsonFormatter",
            "fmt": _JSON_FIELDS,
            "rename_fields": _JSON_RENAMES,
            "timestamp": "time",
            "json_ensure_ascii": False,
        }
    else:
        formatter = {"format": _TEXT_FORMAT}
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "filters": {
            "request_context": {"()": RequestContextFilter},
            "mask_secrets": {"()": SecretMaskingFilter},
        },
        "formatters": {"default": formatter},
        "handlers": {
            "stdout": {
                "()": StdoutHandler,
                "formatter": "default",
                "filters": ["mask_secrets", "request_context"],
            }
        },
        "root": {"level": level, "handlers": ["stdout"]},
        "loggers": {
            # Drop uvicorn's own handlers and route everything through the root handler above.
            "uvicorn": {"handlers": [], "propagate": True},
            "uvicorn.error": {"handlers": [], "propagate": True},
            "uvicorn.access": {"handlers": [], "propagate": True},
        },
    }


def configure_logging(app: Any | None = None) -> None:
    """Apply the logging config (idempotent) and, when given the ASGI app, add the request-id middleware."""
    settings = get_settings()
    json_logs = settings.app_env != "development"
    logging.config.dictConfig(build_logging_config(json_logs=json_logs, level=settings.log_level))
    if app is not None:
        app.add_middleware(RequestContextMiddleware)
