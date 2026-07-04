"""Tests for compile endpoint rate limiting."""

from __future__ import annotations

import pytest

from src.services.compile_policy import (
    CompileRateLimitedError,
    check_compile_rate_limit,
    reset_compile_rate_limit_state,
)


@pytest.fixture(autouse=True)
def _clear_buckets():
    reset_compile_rate_limit_state()
    yield
    reset_compile_rate_limit_state()


def test_allows_requests_under_limit():
    for _ in range(5):
        check_compile_rate_limit("client-a")


def test_blocks_when_limit_exceeded():
    for _ in range(30):
        check_compile_rate_limit("client-b")
    with pytest.raises(CompileRateLimitedError):
        check_compile_rate_limit("client-b")
