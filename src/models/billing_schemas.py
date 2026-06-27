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


class CheckoutRequest(BaseModel):
    """Optional client origin so QR links use the browser host, not the API proxy host."""

    client_origin: str | None = None


class UpgradeResponse(BaseModel):
    """Returned after a successful (mock) upgrade."""

    ok: bool = True
    message: str
    billing: BillingStatusResponse


class CheckoutResponse(BaseModel):
    """QR checkout session created for Pro upgrade.

    V2 path: replace confirm_url with a Stripe Checkout Session URL and
    track the session ID instead of our own checkout_id.
    """

    checkout_id: str
    confirm_url: str
    qr_png_b64: str
    expires_in_minutes: int = 15
