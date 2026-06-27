"""Billing API — subscription status, QR checkout, and upgrade endpoints.

V1: QR-based mock payment — POST /billing/checkout creates a short-lived
    token; GET /billing/confirm/{id} validates it and flips the tier.
V2 path: replace checkout body with Stripe Checkout Session creation;
    replace confirm with Stripe webhook signature verification.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from src.api.deps import get_current_user, get_db_session
from src.config import get_settings
from src.db.models import User
from src.models.billing_schemas import BillingStatusResponse, CheckoutResponse, UpgradeRequest, UpgradeResponse
from src.services.billing_service import (
    CHECKOUT_TTL_MINUTES,
    confirm_checkout,
    create_checkout_session,
    get_billing_status,
    upgrade_to_pro,
    _generate_qr_png_b64,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/status", response_model=BillingStatusResponse)
def billing_status(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> BillingStatusResponse:
    """Return current subscription tier and defense-turn quota for the caller."""
    data = get_billing_status(db, user)
    return BillingStatusResponse.model_validate(data)


@router.post("/checkout", response_model=CheckoutResponse)
def billing_checkout(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> CheckoutResponse:
    """Create a QR checkout session for Pro upgrade.

    Returns a QR-encoded PNG (base64) pointing to a one-time confirm URL.
    The client should poll GET /billing/status to detect completion.

    V2 path: replace body with stripe.checkout.sessions.create() and
    return the Stripe-hosted URL as confirm_url.
    """
    settings = get_settings()
    backend_url = settings.backend_base_url.rstrip("/")

    checkout_id = create_checkout_session(user)
    confirm_url = f"{backend_url}/api/v1/billing/confirm/{checkout_id}"
    qr_b64 = _generate_qr_png_b64(confirm_url)

    return CheckoutResponse(
        checkout_id=checkout_id,
        confirm_url=confirm_url,
        qr_png_b64=qr_b64,
        expires_in_minutes=CHECKOUT_TTL_MINUTES,
    )


@router.get("/confirm/{checkout_id}", response_class=HTMLResponse, include_in_schema=False)
def billing_confirm(
    checkout_id: str,
    db: Session = Depends(get_db_session),
) -> HTMLResponse:
    """Validate a QR token and upgrade the user to Pro.

    No auth required — the opaque token IS the credential.
    Returns a styled HTML page shown on the user's phone after scanning.

    V2 path: becomes a Stripe webhook POST handler with signature verification.
    """
    result = confirm_checkout(db, checkout_id)
    if result is None:
        return HTMLResponse(content=_checkout_html(success=False), status_code=404)
    if result.get("already_confirmed"):
        return HTMLResponse(content=_checkout_html(success=True, already_done=True))
    return HTMLResponse(content=_checkout_html(success=True, already_done=False))


@router.post("/upgrade", response_model=UpgradeResponse)
def billing_upgrade(
    payload: UpgradeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> UpgradeResponse:
    """Direct upgrade — kept for admin/testing use only.

    Normal clients should use POST /billing/checkout → scan QR → auto-upgrade.
    V2: remove this endpoint once Stripe webhooks are in place.
    """
    if payload.plan != "pro":
        raise HTTPException(status_code=400, detail="Only 'pro' upgrades are supported.")

    billing_data = upgrade_to_pro(db, user)
    db.commit()

    return UpgradeResponse(
        ok=True,
        message="Account upgraded to Pro. Enjoy 50 defense turns per month!",
        billing=BillingStatusResponse.model_validate(billing_data),
    )


# ─── HTML pages served to the phone browser ──────────────────────────────────

def _checkout_html(*, success: bool, already_done: bool = False) -> str:
    base = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
    card = (
        "background:#fff;border-radius:20px;padding:48px 40px;"
        "max-width:420px;width:90%;text-align:center;"
        "box-shadow:0 8px 40px rgba(0,0,0,.1)"
    )

    if not success:
        return f"""<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lỗi thanh toán — Arionear</title>
<style>*{{box-sizing:border-box}}body{{{base};display:flex;align-items:center;
justify-content:center;min-height:100vh;margin:0;background:#fef2f2}}
.card{{{card}}}h1{{color:#ef4444;margin:0 0 16px;font-size:2rem}}
p{{color:#6b7280;margin:0 0 8px;line-height:1.6}}</style></head>
<body><div class="card"><div style="font-size:3rem">❌</div>
<h1>Không hợp lệ</h1>
<p>Mã QR đã hết hạn hoặc không tồn tại.</p>
<p>Vui lòng quay lại ứng dụng để tạo mã mới.</p></div></body></html>"""

    if already_done:
        return f"""<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Đã kích hoạt — Arionear</title>
<style>*{{box-sizing:border-box}}body{{{base};display:flex;align-items:center;
justify-content:center;min-height:100vh;margin:0;background:#f0fdf4}}
.card{{{card}}}h1{{color:#22c55e;margin:0 0 16px;font-size:2rem}}
p{{color:#6b7280;margin:0 0 8px;line-height:1.6}}</style></head>
<body><div class="card"><div style="font-size:3rem">✅</div>
<h1>Đã kích hoạt</h1>
<p>Tài khoản của bạn đã được nâng cấp Pro trước đó.</p>
<p>Bạn có thể đóng trang này.</p></div></body></html>"""

    return f"""<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kích hoạt thành công! — Arionear</title>
<style>*{{box-sizing:border-box}}body{{{base};display:flex;align-items:center;
justify-content:center;min-height:100vh;margin:0;background:#f0fdf4}}
.card{{{card}}}
h1{{color:#22c55e;margin:0 0 16px;font-size:1.75rem}}
.badge{{display:inline-flex;align-items:center;gap:6px;
background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;
border-radius:999px;padding:6px 20px;font-weight:700;font-size:1.1rem;
margin:16px 0 24px}}
p{{color:#6b7280;margin:0 0 8px;line-height:1.6}}
.hint{{margin-top:28px;font-size:.8rem;color:#9ca3af}}</style></head>
<body><div class="card">
<div style="font-size:3rem">🎉</div>
<h1>Nâng cấp thành công!</h1>
<div class="badge">⚡ PRO</div>
<p><strong>Tài khoản của bạn đã được kích hoạt gói Pro.</strong></p>
<p>Quay lại ứng dụng để sử dụng 50 lượt Defense Phản Biện mỗi tháng
và các tính năng cao cấp.</p>
<p class="hint">Bạn có thể đóng trang này.</p>
</div></body></html>"""
