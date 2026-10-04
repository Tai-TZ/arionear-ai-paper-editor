"""Rate limits and guards for the LaTeX compile endpoint."""

from __future__ import annotations

import threading
import time

from src.config import get_settings

_buckets: dict[str, list[float]] = {}
_lock = threading.Lock()


class CompileRateLimitedError(Exception):
    """Raised when a client exceeds compile request rate limits."""


def reset_compile_rate_limit_state() -> None:
    """Test helper — clear in-memory compile rate buckets."""
    with _lock:
        _buckets.clear()


def check_compile_rate_limit(client_key: str) -> None:
    """Sliding-window limit per client (IP or authenticated user id)."""
    limit = get_settings().compile_rate_limit_per_min
    now = time.time()
    with _lock:
        bucket = _buckets.setdefault(client_key, [])
        bucket[:] = [t for t in bucket if now - t < 60]
        if len(bucket) >= limit:
            raise CompileRateLimitedError(f"Quá nhiều yêu cầu compile ({limit}/phút). Vui lòng đợi rồi thử lại.")
        bucket.append(now)
