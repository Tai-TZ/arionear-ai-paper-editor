"""Pydantic schemas for the /billing endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

UserTierLabel = Literal["free", "pro"]


class BillingStatusResponse(BaseModel):
    """Current subscription + quota state for the authenticated user."""

    tier: UserTierLabel
    defense_turns_limit: int
    defense_turns_used: int
    defense_turns_remaining: int
    upgraded_at: datetime | None = None
    created_at: datetime


class UpgradeRequest(BaseModel):
    """Payload for the mock upgrade endpoint (V1 — no payment fields)."""

    plan: Literal["pro"] = "pro"


class UpgradeResponse(BaseModel):
    """Returned after a successful (mock) upgrade."""

    ok: bool = True
    message: str
    billing: BillingStatusResponse
