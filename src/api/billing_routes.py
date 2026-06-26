"""Billing API — subscription status and mock upgrade endpoints.

V1: No real payment. POST /billing/upgrade flips tier to PRO immediately.
V2 path: replace upgrade handler body with Stripe Checkout Session creation.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.api.deps import get_current_user, get_db_session
from src.db.models import User
from src.models.billing_schemas import BillingStatusResponse, UpgradeRequest, UpgradeResponse
from src.services.billing_service import get_billing_status, upgrade_to_pro

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/status", response_model=BillingStatusResponse)
def billing_status(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> BillingStatusResponse:
    """Return current subscription tier and defense-turn quota for the caller."""
    data = get_billing_status(db, user)
    return BillingStatusResponse.model_validate(data)


@router.post("/upgrade", response_model=UpgradeResponse)
def billing_upgrade(
    payload: UpgradeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> UpgradeResponse:
    """Mock-upgrade the caller to Pro tier.

    V1: Instant, no payment.
    V2: Replace this body with a Stripe Checkout Session redirect URL.
    """
    if payload.plan != "pro":
        raise HTTPException(status_code=400, detail="Only 'pro' upgrades are supported.")

    billing_data = upgrade_to_pro(db, user)
    db.commit()

    return UpgradeResponse(
        ok=True,
        message="Your account has been upgraded to Pro. Enjoy 50 defense turns per month!",
        billing=BillingStatusResponse.model_validate(billing_data),
    )
